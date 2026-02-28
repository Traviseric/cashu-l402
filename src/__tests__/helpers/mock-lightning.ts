/**
 * Mock Lightning backend using real SHA-256 crypto.
 *
 * Creates real preimage/rHash pairs so `verifyPreimage()` passes with
 * genuine cryptographic verification — not stubs.
 *
 * Invoice format: `lnbc<amount>u1mock_<random>` so the BOLT11 regex
 * in `l402Fetch` can decode amounts for `maxCostSats` enforcement.
 */

import { createHash, randomBytes } from 'node:crypto';

interface MockInvoice {
	paymentRequest: string;
	rHash: string;
	preimage: string;
	amountSats: number;
	settled: boolean;
}

export function createMockLightning() {
	const invoices = new Map<string, MockInvoice>();

	async function createInvoice(
		amountSats: number,
		_memo: string,
	): Promise<{ paymentRequest: string; rHash: string }> {
		const preimage = randomBytes(32);
		const rHash = createHash('sha256').update(preimage).digest();
		const rHashBase64 = rHash.toString('base64');
		const preimageHex = preimage.toString('hex');

		// Encode amount in BOLT11-like format for l402Fetch's maxCostSats parsing
		const paymentRequest =
			amountSats >= 100 && amountSats % 100 === 0
				? `lnbc${amountSats / 100}u1mock_${randomBytes(8).toString('hex')}`
				: `lnbc${amountSats * 10}n1mock_${randomBytes(8).toString('hex')}`;

		invoices.set(rHashBase64, {
			paymentRequest,
			rHash: rHashBase64,
			preimage: preimageHex,
			amountSats,
			settled: false,
		});

		return { paymentRequest, rHash: rHashBase64 };
	}

	async function payInvoice(bolt11: string): Promise<{ preimage: string; feeSats: number }> {
		for (const inv of invoices.values()) {
			if (inv.paymentRequest === bolt11) {
				inv.settled = true;
				return { preimage: inv.preimage, feeSats: 0 };
			}
		}
		throw new Error(`Unknown invoice: ${bolt11}`);
	}

	async function lookupInvoice(rHash: string): Promise<{ settled: boolean }> {
		const inv = invoices.get(rHash);
		return { settled: inv?.settled ?? false };
	}

	function reset(): void {
		invoices.clear();
	}

	return { createInvoice, payInvoice, lookupInvoice, reset };
}
