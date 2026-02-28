/**
 * Integration tests — real HTTP server, real fetch(), mock Lightning with real SHA-256.
 *
 * Proves the full 402 → pay → retry → 200 cycle works end-to-end
 * as a developer would actually use the library.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearL402Cache,
	clearPendingChallenges,
	detectConditions,
	extractConditionCaveats,
	getL402CacheSize,
	l402Fetch,
	parseL402Challenge,
	signMacaroon,
	verifyMacaroon,
} from '../index.js';
import { createMockLightning } from './helpers/mock-lightning.js';
import { ROOT_KEY, startTestServer, type TestServerHandle } from './helpers/test-server.js';

describe('Integration: cashu-l402', () => {
	const ln = createMockLightning();
	let srv: TestServerHandle;

	beforeAll(async () => {
		srv = await startTestServer({
			createInvoice: ln.createInvoice,
			lookupInvoice: ln.lookupInvoice,
			priceSats: 100,
		});
	});

	afterAll(async () => {
		await srv.close();
	});

	beforeEach(() => {
		clearPendingChallenges();
		clearL402Cache();
		ln.reset();
	});

	// -----------------------------------------------------------------------
	// Suite 1: L402 full flow
	// -----------------------------------------------------------------------
	describe('L402 full flow', () => {
		it('returns 402 with challenge for unauthenticated request', async () => {
			const res = await fetch(`${srv.baseUrl}/api/protected`);
			expect(res.status).toBe(402);

			const wwwAuth = res.headers.get('WWW-Authenticate');
			expect(wwwAuth).toBeTruthy();
			expect(wwwAuth).toContain('L402 macaroon=');
			expect(wwwAuth).toContain('invoice=');
			expect(wwwAuth).toContain('Cashu mint=');
		});

		it('returns 200 after valid L402 payment', async () => {
			// Step 1: Get challenge
			const res402 = await fetch(`${srv.baseUrl}/api/protected`);
			expect(res402.status).toBe(402);

			const wwwAuth = res402.headers.get('WWW-Authenticate')!;
			const challenge = parseL402Challenge(wwwAuth);

			// Step 2: Pay invoice (mock Lightning with real crypto)
			const { preimage } = await ln.payInvoice(challenge.invoice);

			// Step 3: Retry with L402 token
			const res200 = await fetch(`${srv.baseUrl}/api/protected`, {
				headers: { Authorization: `L402 ${challenge.macaroon}:${preimage}` },
			});
			expect(res200.status).toBe(200);

			const body = await res200.json();
			expect(body.data).toBe('Protected content');
			expect(body.payment).toBe('l402');
		});

		it('rejects invalid preimage', async () => {
			const res402 = await fetch(`${srv.baseUrl}/api/protected`);
			const wwwAuth = res402.headers.get('WWW-Authenticate')!;
			const challenge = parseL402Challenge(wwwAuth);

			// Use a fake preimage that won't match the rHash
			const fakePreimage = 'deadbeef'.repeat(8);

			const res = await fetch(`${srv.baseUrl}/api/protected`, {
				headers: { Authorization: `L402 ${challenge.macaroon}:${fakePreimage}` },
			});
			expect(res.status).toBe(401);

			const body = await res.json();
			expect(body.error).toContain('Invalid preimage');
		});

		it('rejects tampered macaroon', async () => {
			const res402 = await fetch(`${srv.baseUrl}/api/protected`);
			const wwwAuth = res402.headers.get('WWW-Authenticate')!;
			const challenge = parseL402Challenge(wwwAuth);

			const { preimage } = await ln.payInvoice(challenge.invoice);

			// Tamper with the last 4 characters of the macaroon
			const tampered = `${challenge.macaroon.slice(0, -4)}XXXX`;

			const res = await fetch(`${srv.baseUrl}/api/protected`, {
				headers: { Authorization: `L402 ${tampered}:${preimage}` },
			});
			expect(res.status).toBe(401);

			const body = await res.json();
			expect(body.error).toBeTruthy();
		});
	});

	// -----------------------------------------------------------------------
	// Suite 2: l402Fetch auto-pay
	// -----------------------------------------------------------------------
	describe('l402Fetch auto-pay', () => {
		it('automatically handles 402 → pay → retry → 200', async () => {
			const res = await l402Fetch(`${srv.baseUrl}/api/protected`, ln.payInvoice);
			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.data).toBe('Protected content');
			expect(body.payment).toBe('l402');
		});

		it('reuses cached token without re-paying', async () => {
			const payInvoiceSpy = vi.fn(ln.payInvoice);

			// First request → pays invoice
			const res1 = await l402Fetch(`${srv.baseUrl}/api/protected`, payInvoiceSpy);
			expect(res1.status).toBe(200);
			expect(payInvoiceSpy).toHaveBeenCalledTimes(1);

			// Second request → uses cached token (no new payment)
			const res2 = await l402Fetch(`${srv.baseUrl}/api/protected`, payInvoiceSpy);
			expect(res2.status).toBe(200);
			expect(payInvoiceSpy).toHaveBeenCalledTimes(1); // NOT called again
			expect(getL402CacheSize()).toBe(1);
		});
	});

	// -----------------------------------------------------------------------
	// Suite 3: Dual challenge
	// -----------------------------------------------------------------------
	describe('Dual challenge', () => {
		it('402 response contains both L402 and Cashu challenges', async () => {
			const res = await fetch(`${srv.baseUrl}/api/protected`);
			const wwwAuth = res.headers.get('WWW-Authenticate')!;

			expect(wwwAuth).toContain('Cashu mint=');
			expect(wwwAuth).toContain('amount="100"');
			expect(wwwAuth).toContain('L402 macaroon=');
			expect(wwwAuth).toContain('invoice=');
		});

		it('accepts Cashu auth header', async () => {
			const res = await fetch(`${srv.baseUrl}/api/protected`, {
				headers: { Authorization: 'Cashu cashuAeyJtb2NrIjoidG9rZW4ifQ==' },
			});
			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.payment).toBe('cashu');
		});
	});

	// -----------------------------------------------------------------------
	// Suite 4: maxCostSats
	// -----------------------------------------------------------------------
	describe('maxCostSats', () => {
		it('allows invoice within cost limit', async () => {
			// Server charges 100 sats, limit is 500 → allowed
			const res = await l402Fetch(
				`${srv.baseUrl}/api/protected`,
				ln.payInvoice,
				undefined,
				500,
			);
			expect(res.status).toBe(200);
		});

		it('rejects invoice exceeding cost limit', async () => {
			// Start a server that charges 1000 sats
			const expensiveSrv = await startTestServer({
				createInvoice: ln.createInvoice,
				priceSats: 1000,
			});

			try {
				await expect(
					l402Fetch(
						`${expensiveSrv.baseUrl}/api/protected`,
						ln.payInvoice,
						undefined,
						500, // max 500 sats, but server charges 1000
					),
				).rejects.toThrow('exceeds max cost');
			} finally {
				await expensiveSrv.close();
			}
		});
	});

	// -----------------------------------------------------------------------
	// Suite 5: Conditions pipeline
	// -----------------------------------------------------------------------
	describe('Conditions pipeline', () => {
		it('NUT-10 secret → detect → extract caveats → sign macaroon → verify', () => {
			// Create a P2PK NUT-10 secret with locktime and multisig
			const futureLocktime = Math.floor(Date.now() / 1000) + 3600;
			const secret = JSON.stringify([
				'P2PK',
				{
					nonce: 'abc123',
					data: '02abcdef1234567890',
					tags: [
						['locktime', String(futureLocktime)],
						['pubkeys', '02abcdef1234567890'],
						['n_sigs', '2'],
					],
				},
			]);

			// Detect conditions from proof
			const conditions = detectConditions({ secret });
			expect(conditions).not.toBeNull();
			expect(conditions!.kind).toBe('P2PK');
			expect(conditions!.nSigs).toBe(2);
			expect(conditions!.locktime).toBe(futureLocktime);

			// Extract caveats for macaroon embedding
			const caveats = extractConditionCaveats(conditions!);
			expect(caveats.length).toBeGreaterThan(0);

			const caveatStrings = caveats.map((c) => `${c.key}=${c.value}`);
			expect(caveatStrings).toContain('condition_kind=P2PK');
			expect(caveatStrings.some((s) => s.startsWith('locktime='))).toBe(true);
			expect(caveatStrings.some((s) => s.startsWith('n_sigs='))).toBe(true);

			// Sign macaroon with condition caveats
			const macaroon = signMacaroon(
				{
					identifier: 'cond-test-123',
					location: 'cashu-l402',
					caveats: caveatStrings,
				},
				ROOT_KEY,
			);

			// Verify macaroon preserves all caveats
			const verified = verifyMacaroon(macaroon, ROOT_KEY);
			expect(verified).not.toBeNull();
			expect(verified!.caveats).toContain('condition_kind=P2PK');
			expect(verified!.caveats.some((c: string) => c.startsWith('n_sigs='))).toBe(true);
			expect(verified!.caveats.some((c: string) => c.startsWith('locktime='))).toBe(true);
		});
	});

	// -----------------------------------------------------------------------
	// Suite 6: Server lifecycle
	// -----------------------------------------------------------------------
	describe('Server lifecycle', () => {
		it('handles concurrent requests independently', async () => {
			const results = await Promise.all(
				Array.from({ length: 5 }, () =>
					l402Fetch(`${srv.baseUrl}/api/protected`, ln.payInvoice),
				),
			);

			for (const res of results) {
				expect(res.status).toBe(200);
				const body = await res.json();
				expect(body.data).toBe('Protected content');
			}
		});

		it('rejects tokens after pending challenges are cleared', async () => {
			// Get a challenge
			const res402 = await fetch(`${srv.baseUrl}/api/protected`);
			const wwwAuth = res402.headers.get('WWW-Authenticate')!;
			const challenge = parseL402Challenge(wwwAuth);
			const { preimage } = await ln.payInvoice(challenge.invoice);

			// Simulate server restart by clearing pending challenges
			clearPendingChallenges();

			// Try to use the token — server can't find the pending challenge
			const res = await fetch(`${srv.baseUrl}/api/protected`, {
				headers: { Authorization: `L402 ${challenge.macaroon}:${preimage}` },
			});
			expect(res.status).toBe(401);

			const body = await res.json();
			expect(body.error).toContain('Unknown or expired');
		});
	});
});
