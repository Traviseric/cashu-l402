/**
 * Payment routing heuristic — choose optimal payment backend.
 *
 * Extracted from ArxMint lib/payment-sdk.ts routePayment function.
 */

import type { SpendRoute } from './types.js';

/**
 * Determine the best payment backend for a given request.
 *
 * Routing logic:
 * - Privacy `maximum` → fedimint (federation) or cashu (blinded proofs)
 * - Privacy `enhanced` → cashu preferred
 * - Amount < 10k sats → ecash (no Lightning routing overhead)
 * - Otherwise → lightning (most widely supported)
 * - Fee estimate: ~0% for ecash, ~1% for lightning
 */
export function routePayment(params: {
	amount: number;
	privacyLevel?: 'standard' | 'enhanced' | 'maximum';
	availableBackends?: ('cashu' | 'lightning' | 'fedimint')[];
}): SpendRoute {
	const { amount, privacyLevel = 'standard', availableBackends } = params;
	const available = availableBackends ?? ['cashu', 'lightning'];

	// Privacy-first routing
	if (privacyLevel === 'maximum') {
		if (available.includes('fedimint')) {
			return {
				backend: 'fedimint',
				reason: 'Maximum privacy — federated blind signatures',
				estimatedFee: 0,
			};
		}
		if (available.includes('cashu')) {
			return {
				backend: 'cashu',
				reason: 'Maximum privacy — Chaumian ecash (single mint)',
				estimatedFee: 0,
			};
		}
	}

	if (privacyLevel === 'enhanced') {
		if (available.includes('cashu')) {
			return {
				backend: 'cashu',
				reason: 'Enhanced privacy — blinded proofs hide sender',
				estimatedFee: 0,
			};
		}
		if (available.includes('fedimint')) {
			return {
				backend: 'fedimint',
				reason: 'Enhanced privacy — federated blind signatures',
				estimatedFee: 0,
			};
		}
	}

	// Amount-based routing
	if (amount < 10_000 && available.includes('cashu')) {
		return {
			backend: 'cashu',
			reason: 'Small amount — ecash avoids Lightning routing overhead',
			estimatedFee: 0,
		};
	}

	// Default: Lightning
	if (available.includes('lightning')) {
		return {
			backend: 'lightning',
			reason: 'Standard payment — Lightning Network routing',
			estimatedFee: Math.ceil(amount * 0.01),
		};
	}

	// Fallback to whatever is available
	const fallback = available[0] ?? 'lightning';
	return {
		backend: fallback,
		reason: `Fallback — only ${fallback} available`,
		estimatedFee: fallback === 'lightning' ? Math.ceil(amount * 0.01) : 0,
	};
}
