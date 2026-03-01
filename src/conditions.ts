/**
 * Spending condition detection and pre-validation for Cashu proofs.
 *
 * Detects NUT-10/11/14 conditions + custom kinds (PoS, etc.)
 * and extracts metadata for macaroon caveat encoding.
 *
 * Based on Research #2: Programmable eCash and Advanced Spending Conditions.
 */

import type { ConditionCaveat, ConditionInfo, Nut10Secret, PrevalidationResult } from './types.js';

// ---------------------------------------------------------------------------
// NUT-10 secret parsing
// ---------------------------------------------------------------------------

/**
 * Attempt to parse a proof's secret as a NUT-10 well-known secret.
 * Returns null if the secret is not a valid NUT-10 JSON array.
 *
 * NUT-10 format: ["kind", {"nonce": "<str>", "data": "<str>", "tags": [["key", "value1", ...]]}]
 */
export function parseNut10Secret(secret: string): Nut10Secret | null {
	// Reject oversized secrets before parsing (prevent DoS via large JSON)
	if (secret.length > 10_000) return null;

	try {
		const parsed = JSON.parse(secret);
		if (!Array.isArray(parsed) || parsed.length < 2) return null;

		const [kind, body] = parsed;
		if (typeof kind !== 'string') return null;
		if (typeof body !== 'object' || body === null) return null;
		if (typeof body.nonce !== 'string') return null;
		if (typeof body.data !== 'string') return null;

		const rawTags = Array.isArray(body.tags) ? body.tags : [];
		const tags: string[][] = rawTags.filter(
			(t): t is string[] => Array.isArray(t) && t.every((e) => typeof e === 'string'),
		);

		return { kind, nonce: body.nonce, data: body.data, tags };
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Condition detection
// ---------------------------------------------------------------------------

/**
 * Detect spending conditions on a Cashu proof.
 *
 * Accepts a proof-like object with a `secret` field (string).
 * Returns structured condition info, or null if unconditional.
 */
export function detectConditions(proof: { secret: string }): ConditionInfo | null {
	const nut10 = parseNut10Secret(proof.secret);
	if (!nut10) return null;

	const info: ConditionInfo = {
		kind: nut10.kind as ConditionInfo['kind'],
		data: nut10.data,
		tags: nut10.tags,
	};

	// Extract well-known tags
	for (const tag of nut10.tags) {
		if (tag.length < 2) continue;
		const [key, ...values] = tag;

		switch (key) {
			case 'locktime': {
				const v = Number.parseInt(values[0], 10);
				info.locktime = !Number.isNaN(v) && v >= 0 ? v : undefined;
				break;
			}
			case 'refund':
				info.refundKeys = values;
				break;
			case 'n_sigs': {
				const v = Number.parseInt(values[0], 10);
				info.nSigs = !Number.isNaN(v) && v >= 1 ? v : undefined;
				break;
			}
			case 'pubkeys':
				info.pubkeys = values;
				break;
			case 'sigflag':
				info.sigAll = values[0] === 'SIG_ALL';
				break;
		}
	}

	return info;
}

// ---------------------------------------------------------------------------
// Caveat extraction
// ---------------------------------------------------------------------------

/**
 * Extract macaroon caveats from a spending condition.
 *
 * When a conditional proof is used for L402 payment, the condition metadata
 * should be encoded as macaroon caveats so the access token reflects the
 * condition's constraints.
 */
export function extractConditionCaveats(conditions: ConditionInfo): ConditionCaveat[] {
	const caveats: ConditionCaveat[] = [];

	caveats.push({ key: 'condition_kind', value: conditions.kind });

	if (conditions.locktime) {
		caveats.push({ key: 'locktime', value: String(conditions.locktime) });

		// Macaroon should expire no later than locktime
		const remaining = conditions.locktime - Math.floor(Date.now() / 1000);
		if (remaining > 0) {
			caveats.push({ key: 'max_ttl_seconds', value: String(remaining) });
		}
	}

	if (conditions.kind === 'PoS') {
		caveats.push({ key: 'service_hash', value: conditions.data });

		// Extract deadline from tags if present
		const deadlineTag = conditions.tags.find((t) => t[0] === 'deadline');
		if (deadlineTag?.[1]) {
			caveats.push({ key: 'deadline', value: deadlineTag[1] });
		}
	}

	if (conditions.nSigs) {
		caveats.push({ key: 'n_sigs', value: String(conditions.nSigs) });
	}

	return caveats;
}

// ---------------------------------------------------------------------------
// Pre-validation
// ---------------------------------------------------------------------------

/**
 * Client-side pre-validation of a conditional proof before submitting to mint.
 *
 * Checks locktime validity. Does NOT verify cryptographic signatures —
 * that's the mint's responsibility.
 *
 * @param proof - Proof with `secret` field
 * @param currentTime - Current Unix timestamp (defaults to now). Pass mint's time for accuracy.
 */
export function prevalidateCondition(
	proof: { secret: string },
	currentTime?: number,
): PrevalidationResult {
	const conditions = detectConditions(proof);

	// Unconditional proofs are always valid from a condition perspective
	if (!conditions) {
		return { valid: true };
	}

	const now = currentTime ?? Math.floor(Date.now() / 1000);

	// Check locktime
	if (conditions.locktime) {
		const remaining = conditions.locktime - now;

		if (remaining <= 0) {
			// Lock expired — only refund keys can redeem
			return {
				valid: false,
				expired: true,
				remainingSeconds: 0,
				error: `Locktime expired ${Math.abs(remaining)}s ago — only refund keys can redeem`,
			};
		}

		return {
			valid: true,
			expired: false,
			remainingSeconds: remaining,
		};
	}

	// No locktime — condition is always active
	return { valid: true };
}
