/**
 * NUT-24 Cashu ecash paywall — parse, verify, and challenge.
 *
 * Extracted from ArxMint lib/cashu-paywall.ts and hardened for standalone use.
 */

import { CashuMint, CashuWallet, type Proof, getDecodedToken } from '@cashu/cashu-ts';
import type { CashuPaymentResult, CashuPaywallConfig } from './types.js';

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
			return { paid: false, amountSats: 0, proofs: [], error: 'Empty token' };
		}

		// Validate mint URL — all token entries must match expected mint
		for (const entry of decoded.token as Array<{ mint: string; proofs: Array<{ amount: number }> }>) {
			if (entry.mint !== config.mintUrl) {
				return {
					paid: false,
					amountSats: 0,
					proofs: [],
					error: `Unexpected mint: ${entry.mint} (expected ${config.mintUrl})`,
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
