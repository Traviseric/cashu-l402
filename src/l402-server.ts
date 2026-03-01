/**
 * Server-side L402 — macaroon signing, preimage verification, challenge creation.
 *
 * Framework-agnostic. Integrators call these functions from their route handlers.
 * Extracted from ArxMint app/api/l402/route.ts and lib/payment-sdk.ts.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { CashuL402ErrorCode } from './types.js';
import type {
	CreateInvoiceFn,
	L402ChallengeResult,
	LookupInvoiceFn,
	MacaroonPayload,
	PaymentResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Macaroon signing
// ---------------------------------------------------------------------------

/**
 * Sign a macaroon payload with HMAC-SHA256.
 * Returns base64-encoded `{payload, sig}` string.
 */
export function signMacaroon(payload: MacaroonPayload, rootKey: string): string {
	const payloadStr = JSON.stringify(payload);
	const sig = createHmac('sha256', rootKey).update(payloadStr).digest('hex');
	const combined = JSON.stringify({ payload: payloadStr, sig });
	return Buffer.from(combined).toString('base64');
}

/**
 * Verify a macaroon's HMAC signature. Timing-safe comparison.
 * Returns the parsed payload if valid, null otherwise.
 */
export function verifyMacaroon(token: string, rootKey: string): MacaroonPayload | null {
	try {
		const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
		if (!decoded.payload || !decoded.sig) return null;

		const expected = createHmac('sha256', rootKey).update(decoded.payload).digest('hex');
		const sigBuf = Buffer.from(decoded.sig, 'hex');
		const expectedBuf = Buffer.from(expected, 'hex');

		if (sigBuf.length !== expectedBuf.length) return null;
		if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

		return JSON.parse(decoded.payload) as MacaroonPayload;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Caveat semantic verification
// ---------------------------------------------------------------------------

/**
 * Verify caveat semantics for a parsed macaroon payload.
 * Checks `expires_at` (time) and `service=` (resource match) caveats.
 *
 * Call this after `verifyMacaroon` to enforce access policy.
 * Tokens without `expires_at` pass the time check (backwards compatible).
 *
 * @param payload - Parsed MacaroonPayload from verifyMacaroon
 * @param expectedService - Optional: require service= caveat to match this value
 */
export function verifyCaveats(
	payload: MacaroonPayload,
	expectedService?: string,
): { valid: boolean; error?: string } {
	const now = Math.floor(Date.now() / 1000);

	for (const caveat of payload.caveats) {
		const eqIndex = caveat.indexOf('=');
		if (eqIndex === -1) continue;
		const key = caveat.slice(0, eqIndex);
		const value = caveat.slice(eqIndex + 1);

		if (key === 'expires_at') {
			const expiresAt = parseInt(value, 10);
			if (isNaN(expiresAt) || now > expiresAt) {
				return { valid: false, error: `Token expired at ${value}` };
			}
		}

		if (key === 'service' && expectedService !== undefined) {
			if (value !== expectedService) {
				return { valid: false, error: `Service mismatch: expected ${expectedService}, got ${value}` };
			}
		}
	}

	return { valid: true };
}

// ---------------------------------------------------------------------------
// Preimage verification
// ---------------------------------------------------------------------------

/**
 * Verify a Lightning preimage against a payment hash.
 * Constant-time comparison to prevent timing attacks.
 *
 * @param preimage - Hex-encoded preimage
 * @param rHashBase64 - Base64-encoded payment hash (r_hash from LND)
 */
export function verifyPreimage(preimage: string, rHashBase64: string): boolean {
	try {
		const preimageBytes = Buffer.from(preimage, 'hex');
		const hash = createHash('sha256').update(preimageBytes).digest();
		const expected = Buffer.from(rHashBase64, 'base64');

		if (hash.length !== expected.length) return false;
		return timingSafeEqual(hash, expected);
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
// Challenge creation
// ---------------------------------------------------------------------------

/** In-memory challenge store: macaroon → { rHash, expiresAt } */
const pendingChallenges = new Map<string, { rHash: string; expiresAt: Date }>();

/** Remove expired challenges */
function pruneExpired(): void {
	const now = new Date();
	for (const [key, val] of pendingChallenges) {
		if (val.expiresAt < now) {
			pendingChallenges.delete(key);
		}
	}
}

/**
 * Create a full L402 challenge: generate macaroon, request invoice, store mapping.
 *
 * Integrator provides `createInvoice` — this library has no LND dependency.
 */
export async function createL402Challenge(params: {
	amount: number;
	resourcePath: string;
	rootKey: string;
	createInvoice: CreateInvoiceFn;
	location?: string;
	caveats?: string[];
	ttlSeconds?: number;
}): Promise<L402ChallengeResult> {
	pruneExpired();

	const identifier = randomBytes(16).toString('hex');
	const location = params.location ?? 'cashu-l402';
	const caveats = params.caveats ?? [`service=${params.resourcePath}`];
	const ttl = params.ttlSeconds ?? 86400; // 24h default

	const payload: MacaroonPayload = { identifier, location, caveats };
	const macaroon = signMacaroon(payload, params.rootKey);

	const { paymentRequest, rHash } = await params.createInvoice(
		params.amount,
		`L402 access: ${params.resourcePath}`,
	);

	const expiresAt = new Date(Date.now() + ttl * 1000);
	pendingChallenges.set(macaroon, { rHash, expiresAt });

	const wwwAuthenticate = `L402 macaroon="${macaroon}", invoice="${paymentRequest}"`;

	return { wwwAuthenticate, macaroon, invoice: paymentRequest, rHash, expiresAt };
}

// ---------------------------------------------------------------------------
// Token verification
// ---------------------------------------------------------------------------

/**
 * Verify an L402 token: check macaroon signature + preimage validity.
 *
 * Optionally verifies with LND that the invoice is settled.
 */
export async function verifyL402Token(params: {
	macaroon: string;
	preimage: string;
	rootKey: string;
	lookupInvoice?: LookupInvoiceFn;
	/** Optional: require service= caveat to match this value */
	expectedService?: string;
}): Promise<PaymentResult> {
	// Verify macaroon signature
	const payload = verifyMacaroon(params.macaroon, params.rootKey);
	if (!payload) {
		return { success: false, type: 'l402', error: 'Invalid macaroon signature', code: CashuL402ErrorCode.INVALID_MACAROON };
	}

	// Verify caveat semantics (expiry, service match)
	const caveatCheck = verifyCaveats(payload, params.expectedService);
	if (!caveatCheck.valid) {
		const isExpiry = caveatCheck.error?.startsWith('Token expired');
		return {
			success: false,
			type: 'l402',
			error: caveatCheck.error,
			code: isExpiry ? CashuL402ErrorCode.MACAROON_EXPIRED : CashuL402ErrorCode.SERVICE_MISMATCH,
		};
	}

	// Look up rHash from pending challenges
	const challenge = pendingChallenges.get(params.macaroon);
	if (!challenge) {
		return { success: false, type: 'l402', error: 'Unknown or expired challenge', code: CashuL402ErrorCode.CHALLENGE_NOT_FOUND };
	}

	if (challenge.expiresAt < new Date()) {
		pendingChallenges.delete(params.macaroon);
		return { success: false, type: 'l402', error: 'Challenge expired', code: CashuL402ErrorCode.CHALLENGE_EXPIRED };
	}

	// Verify preimage → rHash
	if (!verifyPreimage(params.preimage, challenge.rHash)) {
		return { success: false, type: 'l402', error: 'Invalid preimage', code: CashuL402ErrorCode.PREIMAGE_INVALID };
	}

	// Optionally verify with LND
	if (params.lookupInvoice) {
		try {
			const { settled } = await params.lookupInvoice(challenge.rHash);
			if (!settled) {
				return { success: false, type: 'l402', error: 'Invoice not settled' };
			}
		} catch {
			// LND unavailable — accept preimage verification as sufficient
		}
	}

	// Success — clean up
	pendingChallenges.delete(params.macaroon);

	return { success: true, type: 'l402', proof: params.macaroon };
}

/**
 * Parse L402 token from "L402 <macaroon>:<preimage>" header value.
 */
export function parseL402AuthHeader(
	authHeader: string | null,
): { macaroon: string; preimage: string } | null {
	if (!authHeader) return null;
	const trimmed = authHeader.trim();
	if (!trimmed.toLowerCase().startsWith('l402 ')) return null;

	const tokenPart = trimmed.slice(5).trim();
	const colonIndex = tokenPart.indexOf(':');
	if (colonIndex === -1) return null;

	const macaroon = tokenPart.slice(0, colonIndex);
	const preimage = tokenPart.slice(colonIndex + 1);
	if (!macaroon || !preimage) return null;

	return { macaroon, preimage };
}

/** Get count of pending (unexpired) challenges. For monitoring. */
export function getPendingChallengeCount(): number {
	pruneExpired();
	return pendingChallenges.size;
}

/** Clear all pending challenges. For testing. */
export function clearPendingChallenges(): void {
	pendingChallenges.clear();
}

// ---------------------------------------------------------------------------
// Bridge L402 — deterministic token issuance without Lightning
// ---------------------------------------------------------------------------

/**
 * Create a bridge-issued L402 macaroon for an offline-verified Cashu payment.
 *
 * Instead of requiring a Lightning invoice + preimage, the bridge derives
 * a deterministic "preimage" from the proof data using HMAC-SHA256.
 * This maintains the L402 verification contract without Lightning.
 *
 * @param params.rootKey - Root key for macaroon signing
 * @param params.proofSecrets - Sorted array of proof secret strings
 * @param params.resourcePath - Resource being accessed
 * @param params.location - Macaroon location hint
 * @param params.caveats - Additional caveats (payment_method=cashu_p2pk is always added)
 * @param params.ttlSeconds - Token TTL (default: 86400 = 24h)
 */
export function createBridgeL402(params: {
	rootKey: string;
	proofSecrets: string[];
	resourcePath: string;
	location?: string;
	caveats?: string[];
	ttlSeconds?: number;
}): { macaroon: string; preimage: string } {
	const identifier = randomBytes(16).toString('hex');
	const location = params.location ?? 'cashu-l402-bridge';
	const ttl = params.ttlSeconds ?? 86400;

	// Deterministic preimage: HMAC-SHA256(rootKey, 'bridge:' + SHA256(sorted proof secrets))
	const sortedSecrets = [...params.proofSecrets].sort();
	const secretsDigest = createHash('sha256')
		.update(sortedSecrets.join(':'))
		.digest('hex');
	const preimage = createHmac('sha256', params.rootKey)
		.update(`bridge:${secretsDigest}`)
		.digest('hex');

	// Build caveats
	const caveats = [
		`service=${params.resourcePath}`,
		'payment_method=cashu_p2pk',
		...(params.caveats ?? []),
	];

	// Clamp TTL if provided
	if (ttl > 0) {
		const expiresAt = Math.floor(Date.now() / 1000) + ttl;
		caveats.push(`expires_at=${expiresAt}`);
	}

	const payload: MacaroonPayload = { identifier, location, caveats };
	const macaroon = signMacaroon(payload, params.rootKey);

	return { macaroon, preimage };
}
