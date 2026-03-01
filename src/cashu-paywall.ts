/**
 * NUT-24 Cashu ecash paywall — parse, verify, and challenge.
 *
 * Extracted from ArxMint lib/cashu-paywall.ts and hardened for standalone use.
 */

import { CashuMint, CashuWallet, type Proof, getDecodedToken } from '@cashu/cashu-ts';
import { detectConditions, extractConditionCaveats } from './conditions.js';
import { createBridgeL402 } from './l402-server.js';
import { isEligibleForOfflineVerify, verifyTokenOffline } from './offline-verify.js';
import { CashuL402ErrorCode } from './types.js';
import type {
	BridgeVerifyConfig,
	CashuPaymentResult,
	CashuPaymentResultV2,
	CashuPaywallConfig,
} from './types.js';

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/**
 * Extract ecash token from "Cashu <token>" Authorization header.
 * Case-insensitive prefix match per NUT-24.
 */
export function parseCashuAuthHeader(authHeader: string | null): string | null {
	if (!authHeader) return null;
	const trimmed = authHeader.trim();
	if (trimmed.toLowerCase().startsWith('cashu ')) {
		return trimmed.slice(6).trim() || null;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Challenge builder
// ---------------------------------------------------------------------------

/**
 * Build a WWW-Authenticate challenge header value for NUT-24.
 *
 * Format: `Cashu mint="<url>", amount="<sats>", unit="<unit>"`
 */
export function buildCashuChallenge(config: CashuPaywallConfig): string {
	const unit = config.unit ?? 'sat';
	const parts = [`Cashu mint="${config.mintUrl}"`, `amount="${config.priceSats}"`, `unit="${unit}"`];
	if (config.description) {
		parts.push(`description="${config.description}"`);
	}
	return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Payment detection
// ---------------------------------------------------------------------------

/**
 * Detect payment method from Authorization header.
 * Returns which protocol was used and the raw token.
 */
export function detectPaymentMethod(authHeader: string | null): {
	method: 'l402' | 'cashu' | 'none';
	token: string | null;
} {
	if (!authHeader) return { method: 'none', token: null };
	const trimmed = authHeader.trim();

	if (trimmed.toLowerCase().startsWith('cashu ')) {
		const token = trimmed.slice(6).trim();
		return { method: 'cashu', token: token || null };
	}

	if (trimmed.toLowerCase().startsWith('l402 ')) {
		const token = trimmed.slice(5).trim();
		return { method: 'l402', token: token || null };
	}

	return { method: 'none', token: null };
}

// ---------------------------------------------------------------------------
// Dual challenge
// ---------------------------------------------------------------------------

/**
 * Build both L402 and Cashu challenges for a 402 response.
 * Returns headers object to spread onto the response.
 */
export function buildDualChallenge(
	cashuConfig: CashuPaywallConfig,
	l402Challenge?: string,
): Record<string, string> {
	const headers: Record<string, string> = {};
	const challenges: string[] = [];

	challenges.push(buildCashuChallenge(cashuConfig));
	if (l402Challenge) {
		challenges.push(l402Challenge);
	}

	headers['WWW-Authenticate'] = challenges.join(', ');
	return headers;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Full Cashu payment verification:
 * 1. Decode token
 * 2. Validate mint URL matches expected
 * 3. Sum proof amounts
 * 4. Check proofs are UNSPENT
 * 5. Claim proofs (swap via wallet.receive) — atomic double-spend prevention
 */
export async function verifyCashuPayment(
	token: string,
	config: CashuPaywallConfig,
): Promise<CashuPaymentResult> {
	try {
		// Decode
		const decoded = getDecodedToken(token);
		if (!decoded.token || decoded.token.length === 0) {
			return { paid: false, amountSats: 0, proofs: [], error: 'Empty token', code: CashuL402ErrorCode.EMPTY_TOKEN };
		}

		// Validate mint URL — all token entries must match expected mint
		for (const entry of decoded.token as Array<{ mint: string; proofs: Array<{ amount: number }> }>) {
			if (entry.mint !== config.mintUrl) {
				return {
					paid: false,
					amountSats: 0,
					proofs: [],
					error: `Unexpected mint: ${entry.mint} (expected ${config.mintUrl})`,
					code: CashuL402ErrorCode.WRONG_MINT,
				};
			}
		}

		// Sum proofs
		const allProofs: Proof[] = (decoded.token as Array<{ proofs: Proof[] }>).flatMap(
			(entry) => entry.proofs,
		);
		const totalAmount = allProofs.reduce((sum, proof) => sum + proof.amount, 0);

		if (totalAmount < config.priceSats) {
			return {
				paid: false,
				amountSats: totalAmount,
				proofs: allProofs,
				error: `Insufficient amount: ${totalAmount} < ${config.priceSats}`,
				code: CashuL402ErrorCode.INSUFFICIENT_AMOUNT,
			};
		}

		// Verify proofs are unspent + claim (atomic double-spend prevention)
		const mint = new CashuMint(config.mintUrl);
		const wallet = new CashuWallet(mint);
		await wallet.loadMint();

		// checkProofsStates returns state for each proof
		const states = await wallet.checkProofsStates(allProofs);
		const allUnspent = states.every(
			(s) => s.state === 'UNSPENT' || (s as { state: string }).state === 'UNSPENT',
		);
		if (!allUnspent) {
			return {
				paid: false,
				amountSats: totalAmount,
				proofs: allProofs,
				error: 'One or more proofs already spent',
				code: CashuL402ErrorCode.PROOF_ALREADY_SPENT,
			};
		}

		// Claim proofs — receive swaps them to our keys, marking originals as spent
		await wallet.receive(token);

		return { paid: true, amountSats: totalAmount, proofs: allProofs };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { paid: false, amountSats: 0, proofs: [], error: `Verification failed: ${message}` };
	}
}

// ---------------------------------------------------------------------------
// Offline verification (Phase 2)
// ---------------------------------------------------------------------------

/**
 * Extract proofs from a decoded token, handling both v3 and v4 formats.
 */
function extractProofsFromToken(token: string): { proofs: Proof[]; mintUrl?: string } {
	const decoded = getDecodedToken(token);

	// v4 format (cashu-ts v2): { mint, proofs, unit }
	if ('proofs' in decoded && Array.isArray(decoded.proofs)) {
		return { proofs: decoded.proofs as Proof[], mintUrl: (decoded as any).mint };
	}
	// v3 format: { token: [{ mint, proofs }] }
	if ('token' in decoded && Array.isArray((decoded as any).token)) {
		const entries = (decoded as any).token as Array<{ mint: string; proofs: Proof[] }>;
		const proofs = entries.flatMap((e) => e.proofs);
		const mintUrl = entries[0]?.mint;
		return { proofs, mintUrl };
	}
	return { proofs: [] };
}

/**
 * Verify a Cashu payment offline using P2PK lock check + DLEQ verification.
 *
 * No mint contact required. Proofs must be P2PK-locked to the bridge pubkey
 * and have valid DLEQ proofs from the mint.
 *
 * Returns a V2 result with offline-specific fields.
 */
export async function verifyCashuPaymentOffline(
	token: string,
	config: CashuPaywallConfig,
	bridgeConfig: BridgeVerifyConfig,
): Promise<CashuPaymentResultV2> {
	try {
		const { proofs, mintUrl } = extractProofsFromToken(token);

		if (proofs.length === 0) {
			bridgeConfig.onLog?.({ level: 'warn', event: 'empty_token', context: {} });
			return {
				paid: false, amountSats: 0, proofs: [], method: 'offline',
				error: 'Empty token', code: CashuL402ErrorCode.EMPTY_TOKEN,
			};
		}

		// Validate mint URL
		if (mintUrl && mintUrl !== config.mintUrl) {
			bridgeConfig.onLog?.({ level: 'warn', event: 'wrong_mint', context: { got: mintUrl, expected: config.mintUrl } });
			return {
				paid: false, amountSats: 0, proofs: [], method: 'offline',
				error: `Unexpected mint: ${mintUrl} (expected ${config.mintUrl})`,
				code: CashuL402ErrorCode.WRONG_MINT,
			};
		}

		// Sum proofs
		const totalAmount = proofs.reduce((sum, p) => sum + p.amount, 0);
		if (totalAmount < config.priceSats) {
			bridgeConfig.onLog?.({ level: 'warn', event: 'insufficient_amount', context: { got: totalAmount, required: config.priceSats } });
			return {
				paid: false, amountSats: totalAmount, proofs, method: 'offline',
				error: `Insufficient amount: ${totalAmount} < ${config.priceSats}`,
				code: CashuL402ErrorCode.INSUFFICIENT_AMOUNT,
			};
		}

		// Offline verification: P2PK + DLEQ
		const offlineResult = verifyTokenOffline(token, {
			bridgePubkey: bridgeConfig.bridgePubkey,
			mintKeysets: bridgeConfig.mintKeysets,
			requireDleq: bridgeConfig.requireDleq,
		});

		if (!offlineResult.allValid) {
			const firstError = offlineResult.results.find((r) => !r.valid);
			const isDleqFailure = firstError?.p2pkValid === true && firstError?.dleqValid === false;
			bridgeConfig.onLog?.({
				level: 'warn',
				event: isDleqFailure ? 'dleq_verification_failed' : 'offline_verification_failed',
				context: { error: firstError?.error, p2pkValid: firstError?.p2pkValid, dleqValid: firstError?.dleqValid },
			});
			return {
				paid: false,
				amountSats: totalAmount,
				proofs,
				method: 'offline',
				p2pkVerified: firstError?.p2pkValid,
				dleqVerified: firstError?.dleqValid,
				error: firstError?.error ?? 'Offline verification failed',
				code: isDleqFailure ? CashuL402ErrorCode.DLEQ_PROOF_INVALID : CashuL402ErrorCode.OFFLINE_VERIFY_FAILED,
			};
		}

		// Extract conditions from proofs and build caveats
		const conditionCaveats: string[] = [];
		let minLocktime: number | undefined;

		for (const proof of proofs) {
			const conditions = detectConditions(proof);
			if (conditions) {
				const caveats = extractConditionCaveats(conditions);
				for (const c of caveats) {
					conditionCaveats.push(`${c.key}=${c.value}`);
				}
				// Track minimum locktime for TTL clamping
				if (conditions.locktime) {
					if (minLocktime === undefined || conditions.locktime < minLocktime) {
						minLocktime = conditions.locktime;
					}
				}
			}
		}

		// TTL clamping: min(default TTL, locktime - now)
		let ttlSeconds: number | undefined;
		if (minLocktime !== undefined) {
			const remaining = minLocktime - Math.floor(Date.now() / 1000);
			if (remaining <= 0) {
				bridgeConfig.onLog?.({ level: 'warn', event: 'proof_locktime_expired', context: { locktimeUnix: minLocktime } });
				return {
					paid: false,
					amountSats: totalAmount,
					proofs,
					method: 'offline',
					error: 'Proof locktime has expired',
					code: CashuL402ErrorCode.LOCKTIME_EXPIRED,
				};
			}
			ttlSeconds = remaining;
		}

		// Deduplicate caveats
		const uniqueCaveats = [...new Set(conditionCaveats)];

		// Issue bridge L402 token
		const proofSecrets = proofs.map((p) => p.secret);
		const { macaroon } = createBridgeL402({
			rootKey: bridgeConfig.rootKey,
			proofSecrets,
			resourcePath: config.description ?? '/api/resource',
			location: bridgeConfig.location,
			caveats: uniqueCaveats.length > 0 ? uniqueCaveats : undefined,
			ttlSeconds,
		});

		// Enqueue proofs for async batch settlement if a queue is provided
		let settlementId: string | undefined;
		if (bridgeConfig.settlementQueue) {
			settlementId = await bridgeConfig.settlementQueue.enqueue({
				token,
				amountSats: totalAmount,
				mintUrl: config.mintUrl,
			});
		}

		bridgeConfig.onLog?.({
			level: 'info',
			event: 'proof_verified_offline',
			context: { amountSats: totalAmount, proofCount: proofs.length, dleqVerified: true, settlementId },
		});

		return {
			paid: true,
			amountSats: totalAmount,
			proofs,
			method: 'offline',
			p2pkVerified: true,
			dleqVerified: true,
			bridgeL402: macaroon,
			settlementId,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		bridgeConfig.onLog?.({ level: 'error', event: 'offline_verification_exception', context: { error: message } });
		return {
			paid: false, amountSats: 0, proofs: [], method: 'offline',
			error: `Offline verification failed: ${message}`,
			code: CashuL402ErrorCode.OFFLINE_VERIFY_FAILED,
		};
	}
}

/**
 * Smart Cashu payment verification — tries offline first, falls back to synchronous.
 *
 * This is the recommended entry point for Phase 2. If `bridgeConfig` is provided
 * and the proofs have P2PK locks + DLEQ proofs, verification happens locally
 * (microsecond latency). Otherwise, falls back to the existing synchronous
 * wallet.receive() path.
 *
 * @param token - Encoded Cashu token
 * @param config - Paywall configuration (price, mint URL, etc.)
 * @param bridgeConfig - Optional bridge configuration for offline path
 * @param requesterId - Optional requester identifier passed to rate limiter
 */
export async function verifyCashuPaymentSmart(
	token: string,
	config: CashuPaywallConfig,
	bridgeConfig?: BridgeVerifyConfig,
	requesterId?: string,
): Promise<CashuPaymentResultV2> {
	// Rate limit check (before any expensive work)
	if (config.onRateLimit) {
		const verifyMethod = bridgeConfig ? 'smart' : 'online';
		const allowed = await config.onRateLimit({ requesterId, verifyMethod, tokenLength: token.length });
		if (!allowed) {
			config.onLog?.({ level: 'warn', event: 'rate_limit_exceeded', context: { requesterId, tokenLength: token.length } });
			return {
				paid: false, amountSats: 0, proofs: [], method: verifyMethod === 'smart' ? 'offline' : 'online',
				error: 'Rate limit exceeded', code: CashuL402ErrorCode.RATE_LIMIT_EXCEEDED,
			};
		}
	}

	// Try offline path if bridge config provided and token is eligible
	if (bridgeConfig && isEligibleForOfflineVerify(token, bridgeConfig.bridgePubkey)) {
		const result = await verifyCashuPaymentOffline(token, config, bridgeConfig);
		if (result.paid) return result;
		// If offline fails, don't fall back — the proofs are P2PK-locked to us
		// and a DLEQ failure means something is wrong
		return result;
	}

	// Fall back to synchronous verification
	const syncResult = await verifyCashuPayment(token, config);
	return { ...syncResult, method: 'online' };
}
