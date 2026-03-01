/**
 * Offline P2PK + DLEQ verification for Cashu proofs.
 *
 * Eliminates synchronous mint contact: verify that proofs are locked to the
 * bridge's pubkey (P2PK) and that the mint's blind signatures are valid (DLEQ),
 * then issue L402 tokens immediately. Settlement with the mint happens later.
 *
 * Fallback: proofs without P2PK/DLEQ go through the existing synchronous path.
 */

import { timingSafeEqual } from 'node:crypto';
import { type Proof, getDecodedToken, hasValidDleq } from '@cashu/cashu-ts';
import { parseNut10Secret } from './conditions.js';
import type {
	MintKeyset,
	OfflineVerifyBatchResult,
	OfflineVerifyConfig,
	OfflineVerifyResult,
} from './types.js';

// ---------------------------------------------------------------------------
// P2PK lock check
// ---------------------------------------------------------------------------

/**
 * Check if a proof is P2PK-locked to the bridge's public key.
 *
 * Parses the NUT-10 secret, checks kind === 'P2PK', and compares the
 * data field (the locking pubkey) to bridgePubkey using timing-safe comparison.
 *
 * Does NOT verify Schnorr signatures — that's the mint's job during settlement.
 * We only check "is this locked to me?"
 */
export function isLockedToBridge(proof: { secret: string }, bridgePubkey: string): boolean {
	const nut10 = parseNut10Secret(proof.secret);
	if (!nut10) return false;
	if (nut10.kind !== 'P2PK') return false;

	// Normalize both to lowercase hex for comparison
	const proofPubkey = nut10.data.toLowerCase();
	const expectedPubkey = bridgePubkey.toLowerCase();

	if (proofPubkey.length !== expectedPubkey.length) return false;

	try {
		return timingSafeEqual(Buffer.from(proofPubkey, 'hex'), Buffer.from(expectedPubkey, 'hex'));
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
// DLEQ verification
// ---------------------------------------------------------------------------

/**
 * Verify a proof's DLEQ proof against mint keys.
 *
 * Wraps cashu-ts `hasValidDleq()`. Returns false if the proof has no DLEQ
 * field or if verification fails.
 */
export function hasValidDleqProof(proof: Proof, mintKeyset: MintKeyset): boolean {
	if (!proof.dleq) return false;

	try {
		// hasValidDleq expects MintKeys shape: { id, unit, keys }
		return hasValidDleq(proof, mintKeyset);
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
// Single proof offline verification
// ---------------------------------------------------------------------------

/**
 * Verify a single proof offline: P2PK lock + DLEQ proof.
 *
 * @param proof - Cashu proof with secret, C, amount, id, and optional dleq
 * @param config - Bridge pubkey and mint keysets
 */
export function verifyProofOffline(proof: Proof, config: OfflineVerifyConfig): OfflineVerifyResult {
	const requireDleq = config.requireDleq ?? true;

	// Check P2PK lock
	const p2pkValid = isLockedToBridge(proof, config.bridgePubkey);
	if (!p2pkValid) {
		return {
			valid: false,
			p2pkValid: false,
			dleqValid: false,
			error: 'Proof is not P2PK-locked to bridge pubkey',
		};
	}

	// Find matching keyset for this proof
	const keyset = config.mintKeysets.find((k) => k.id === proof.id);
	if (!keyset) {
		return {
			valid: false,
			p2pkValid: true,
			dleqValid: false,
			error: `No matching keyset found for proof keyset ID: ${proof.id}`,
		};
	}

	// Check DLEQ
	const dleqValid = hasValidDleqProof(proof, keyset);
	if (requireDleq && !dleqValid) {
		return {
			valid: false,
			p2pkValid: true,
			dleqValid: false,
			error: proof.dleq ? 'DLEQ proof verification failed' : 'Proof missing DLEQ proof',
		};
	}

	return {
		valid: true,
		p2pkValid: true,
		dleqValid,
	};
}

// ---------------------------------------------------------------------------
// Token-level offline verification
// ---------------------------------------------------------------------------

/**
 * Extract proofs from a decoded token, handling both v3 and v4 formats.
 *
 * v4 (cashu-ts v2): { mint, proofs, unit }
 * v3 (legacy):      { token: [{ mint, proofs }] }
 */
function extractProofs(decoded: ReturnType<typeof getDecodedToken>): Proof[] {
	// v4 format: flat { proofs: [...] }
	if ('proofs' in decoded && Array.isArray(decoded.proofs)) {
		return decoded.proofs as Proof[];
	}
	// v3 format: nested { token: [{ proofs: [...] }] }
	if ('token' in decoded && Array.isArray((decoded as any).token)) {
		return ((decoded as any).token as Array<{ proofs: Proof[] }>).flatMap(
			(entry) => entry.proofs,
		);
	}
	return [];
}

/**
 * Verify all proofs in a Cashu token offline.
 *
 * Decodes the token, then verifies each proof for P2PK lock and DLEQ.
 * All proofs must pass for the token to be considered valid.
 *
 * @param token - Encoded Cashu token string
 * @param config - Bridge pubkey and mint keysets
 */
export function verifyTokenOffline(
	token: string,
	config: OfflineVerifyConfig,
): OfflineVerifyBatchResult {
	let allProofs: Proof[];

	try {
		const decoded = getDecodedToken(token);
		allProofs = extractProofs(decoded);
	} catch {
		return { allValid: false, results: [], validCount: 0, invalidCount: 0 };
	}

	if (allProofs.length === 0) {
		return { allValid: false, results: [], validCount: 0, invalidCount: 0 };
	}

	const results = allProofs.map((proof) => verifyProofOffline(proof, config));
	const validCount = results.filter((r) => r.valid).length;
	const invalidCount = results.length - validCount;

	return {
		allValid: invalidCount === 0,
		results,
		validCount,
		invalidCount,
	};
}

/**
 * Check if a token's proofs are eligible for offline verification.
 *
 * Returns true if ALL proofs have P2PK locks and DLEQ proofs.
 * Used by verifyCashuPaymentSmart to decide which path to take.
 */
export function isEligibleForOfflineVerify(token: string, bridgePubkey: string): boolean {
	try {
		const decoded = getDecodedToken(token);
		const allProofs = extractProofs(decoded);
		if (allProofs.length === 0) return false;

		return allProofs.every(
			(proof) => isLockedToBridge(proof, bridgePubkey) && proof.dleq != null,
		);
	} catch {
		return false;
	}
}
