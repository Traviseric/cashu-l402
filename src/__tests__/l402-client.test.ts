import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	buildL402Header,
	clearL402Cache,
	getL402CacheSize,
	l402Fetch,
	parseL402Challenge,
} from '../l402-client.js';

// ---------------------------------------------------------------------------
// parseL402Challenge
// ---------------------------------------------------------------------------

describe('parseL402Challenge', () => {
	it('parses a valid L402 challenge', () => {
		const result = parseL402Challenge('L402 macaroon="abc123", invoice="lnbc100n1ptest"');
		expect(result).toEqual({ macaroon: 'abc123', invoice: 'lnbc100n1ptest' });
	});

	it('parses challenge with extra whitespace', () => {
		const result = parseL402Challenge('L402  macaroon="mac123" ,  invoice="lnbc50u1ptest"');
		expect(result).toEqual({ macaroon: 'mac123', invoice: 'lnbc50u1ptest' });
	});

	it('parses challenge with long base64 macaroon', () => {
		const longMac = 'eyJwYXlsb2FkIjoie1wiaWRlbnRpZmllclwiOlwidGVzdC1pZFwifSIsInNpZyI6ImFiYzEyMyJ9';
		const result = parseL402Challenge(`L402 macaroon="${longMac}", invoice="lnbc1u1ptest"`);
		expect(result.macaroon).toBe(longMac);
	});

	it('throws on missing macaroon', () => {
		expect(() => parseL402Challenge('L402 invoice="lnbc100n1ptest"')).toThrow(
			'Invalid L402 challenge',
		);
	});

	it('throws on missing invoice', () => {
		expect(() => parseL402Challenge('L402 macaroon="abc123"')).toThrow('Invalid L402 challenge');
	});

	it('throws on empty string', () => {
		expect(() => parseL402Challenge('')).toThrow('Invalid L402 challenge');
	});

	it('throws on completely malformed input', () => {
		expect(() => parseL402Challenge('Bearer token123')).toThrow('Invalid L402 challenge');
	});

	it('throws when values are empty strings in quotes', () => {
		expect(() => parseL402Challenge('L402 macaroon="", invoice=""')).toThrow(
			'Invalid L402 challenge',
		);
	});
});

// ---------------------------------------------------------------------------
// buildL402Header
// ---------------------------------------------------------------------------

describe('buildL402Header', () => {
	it('builds correct Authorization header value', () => {
		const header = buildL402Header({ macaroon: 'mac123', preimage: 'pre456' });
		expect(header).toBe('L402 mac123:pre456');
	});

	it('handles long values', () => {
		const mac = 'a'.repeat(200);
		const pre = 'b'.repeat(64);
		const header = buildL402Header({ macaroon: mac, preimage: pre });
		expect(header).toBe(`L402 ${mac}:${pre}`);
	});
});

// ---------------------------------------------------------------------------
// Token cache
// ---------------------------------------------------------------------------

describe('token cache', () => {
	afterEach(() => {
		clearL402Cache();
	});

	it('starts empty', () => {
		expect(getL402CacheSize()).toBe(0);
	});

	it('clears the cache', () => {
		// We can't directly add to the cache, but we can verify clear works
		clearL402Cache();
		expect(getL402CacheSize()).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// l402Fetch
// ---------------------------------------------------------------------------

describe('l402Fetch', () => {
	afterEach(() => {
		clearL402Cache();
		vi.restoreAllMocks();
	});

	it('returns response directly when not 402', async () => {
		const mockResponse = new Response('OK', { status: 200 });
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

		const payInvoice = vi.fn();
		const result = await l402Fetch('https://api.example.com/data', payInvoice);

		expect(result.status).toBe(200);
		expect(payInvoice).not.toHaveBeenCalled();
	});

	it('auto-pays on 402 and retries', async () => {
		const challengeHeaders = new Headers({
			'WWW-Authenticate': 'L402 macaroon="serverMac123", invoice="lnbc100n1ptest"',
		});
		const challengeResponse = new Response('Payment Required', {
			status: 402,
			headers: challengeHeaders,
		});
		const successResponse = new Response('Protected content', { status: 200 });

		vi.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(challengeResponse)
			.mockResolvedValueOnce(successResponse);

		const payInvoice = vi.fn().mockResolvedValue({ preimage: 'preimage_hex', feeSats: 1 });

		const result = await l402Fetch('https://api.example.com/paid', payInvoice);

		expect(result.status).toBe(200);
		expect(payInvoice).toHaveBeenCalledWith('lnbc100n1ptest');
		expect(getL402CacheSize()).toBe(1);
	});

	it('uses cached token on subsequent requests', async () => {
		// First request: 402 → pay → 200
		const challengeHeaders = new Headers({
			'WWW-Authenticate': 'L402 macaroon="cachedMac", invoice="lnbc50u1ptest"',
		});
		vi.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(
				new Response('', { status: 402, headers: challengeHeaders }),
			)
			.mockResolvedValueOnce(new Response('OK', { status: 200 }))
			// Second request: uses cached token → 200
			.mockResolvedValueOnce(new Response('OK again', { status: 200 }));

		const payInvoice = vi.fn().mockResolvedValue({ preimage: 'pre123', feeSats: 0 });

		// First call populates cache
		await l402Fetch('https://api.example.com/resource', payInvoice);
		expect(payInvoice).toHaveBeenCalledTimes(1);

		// Second call should use cached token (no payment)
		const result = await l402Fetch('https://api.example.com/resource', payInvoice);
		expect(result.status).toBe(200);
		expect(payInvoice).toHaveBeenCalledTimes(1); // Still just 1 call
	});

	it('clears expired cached token and re-pays', async () => {
		// Populate cache with a token for the domain
		const challengeHeaders = new Headers({
			'WWW-Authenticate': 'L402 macaroon="mac1", invoice="lnbc10u1ptest"',
		});

		vi.spyOn(globalThis, 'fetch')
			// First request: 402 → pay → 200
			.mockResolvedValueOnce(
				new Response('', { status: 402, headers: challengeHeaders }),
			)
			.mockResolvedValueOnce(new Response('OK', { status: 200 }))
			// Second request: cached token expired → 402 again, then new challenge → pay → 200
			.mockResolvedValueOnce(new Response('', { status: 402 })) // cached token rejected
			.mockResolvedValueOnce(
				new Response('', {
					status: 402,
					headers: new Headers({
						'WWW-Authenticate': 'L402 macaroon="mac2", invoice="lnbc20u1ptest"',
					}),
				}),
			)
			.mockResolvedValueOnce(new Response('OK renewed', { status: 200 }));

		const payInvoice = vi.fn().mockResolvedValue({ preimage: 'pre_new', feeSats: 1 });

		// First: populate cache
		await l402Fetch('https://api.example.com/expire-test', payInvoice);
		expect(payInvoice).toHaveBeenCalledTimes(1);

		// Second: cached token fails → re-pay
		const result = await l402Fetch('https://api.example.com/expire-test', payInvoice);
		expect(result.status).toBe(200);
		expect(payInvoice).toHaveBeenCalledTimes(2);
	});

	it('throws when 402 has no WWW-Authenticate header', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response('', { status: 402 }),
		);

		const payInvoice = vi.fn();
		await expect(
			l402Fetch('https://api.example.com/no-header', payInvoice),
		).rejects.toThrow('402 response missing WWW-Authenticate header');
	});

	it('passes through request options', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response('OK', { status: 200 }));

		const payInvoice = vi.fn();
		await l402Fetch('https://api.example.com/data', payInvoice, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{"key": "value"}',
		});

		expect(fetchSpy).toHaveBeenCalledWith('https://api.example.com/data', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{"key": "value"}',
		});
	});

	it('includes Authorization header when retrying with token', async () => {
		const challengeHeaders = new Headers({
			'WWW-Authenticate': 'L402 macaroon="authMac", invoice="lnbc1u1ptest"',
		});
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(
				new Response('', { status: 402, headers: challengeHeaders }),
			)
			.mockResolvedValueOnce(new Response('OK', { status: 200 }));

		const payInvoice = vi.fn().mockResolvedValue({ preimage: 'pre_abc', feeSats: 0 });

		await l402Fetch('https://api.example.com/auth-check', payInvoice);

		// The retry (second fetch call) should include Authorization header
		const retryCall = fetchSpy.mock.calls[1];
		const retryHeaders = retryCall[1]?.headers as Record<string, string>;
		expect(retryHeaders.Authorization).toBe('L402 authMac:pre_abc');
	});

	// -----------------------------------------------------------------------
	// maxCostSats enforcement
	// -----------------------------------------------------------------------

	describe('maxCostSats', () => {
		it('allows invoice under the max cost', async () => {
			const challengeHeaders = new Headers({
				'WWW-Authenticate': 'L402 macaroon="mac", invoice="lnbc100u1ptest"',
			});
			vi.spyOn(globalThis, 'fetch')
				.mockResolvedValueOnce(
					new Response('', { status: 402, headers: challengeHeaders }),
				)
				.mockResolvedValueOnce(new Response('OK', { status: 200 }));

			const payInvoice = vi.fn().mockResolvedValue({ preimage: 'pre', feeSats: 0 });

			// lnbc100u = 100 micro-BTC = 10,000 sats. maxCostSats = 20,000 → allowed
			const result = await l402Fetch(
				'https://api.example.com/cheap',
				payInvoice,
				undefined,
				20_000,
			);
			expect(result.status).toBe(200);
			expect(payInvoice).toHaveBeenCalled();
		});

		it('rejects invoice over the max cost', async () => {
			const challengeHeaders = new Headers({
				'WWW-Authenticate': 'L402 macaroon="mac", invoice="lnbc100u1ptest"',
			});
			vi.spyOn(globalThis, 'fetch').mockResolvedValue(
				new Response('', { status: 402, headers: challengeHeaders }),
			);

			const payInvoice = vi.fn();

			// lnbc100u = 100 micro-BTC = 10,000 sats. maxCostSats = 5,000 → rejected
			await expect(
				l402Fetch('https://api.example.com/expensive', payInvoice, undefined, 5_000),
			).rejects.toThrow('exceeds max cost');
			expect(payInvoice).not.toHaveBeenCalled();
		});

		it('allows invoice when amount cannot be decoded', async () => {
			const challengeHeaders = new Headers({
				'WWW-Authenticate': 'L402 macaroon="mac", invoice="lnbc1pweirdformat"',
			});
			vi.spyOn(globalThis, 'fetch')
				.mockResolvedValueOnce(
					new Response('', { status: 402, headers: challengeHeaders }),
				)
				.mockResolvedValueOnce(new Response('OK', { status: 200 }));

			const payInvoice = vi.fn().mockResolvedValue({ preimage: 'pre', feeSats: 0 });

			// Can't decode amount → allows (conservative: don't block on parse failure)
			const result = await l402Fetch(
				'https://api.example.com/unknown-amount',
				payInvoice,
				undefined,
				100,
			);
			expect(result.status).toBe(200);
		});

		it('rejects milli-BTC invoice over limit', async () => {
			const challengeHeaders = new Headers({
				// lnbc1m = 1 milli-BTC = 100,000 sats
				'WWW-Authenticate': 'L402 macaroon="mac", invoice="lnbc1m1ptest"',
			});
			vi.spyOn(globalThis, 'fetch').mockResolvedValue(
				new Response('', { status: 402, headers: challengeHeaders }),
			);

			const payInvoice = vi.fn();

			await expect(
				l402Fetch('https://api.example.com/expensive-m', payInvoice, undefined, 50_000),
			).rejects.toThrow('100000 sats');
			expect(payInvoice).not.toHaveBeenCalled();
		});

		it('handles nano-BTC amounts', async () => {
			const challengeHeaders = new Headers({
				// lnbc5000n = 5000 nano-BTC = 500 sats (5000 * 0.1)
				'WWW-Authenticate': 'L402 macaroon="mac", invoice="lnbc5000n1ptest"',
			});
			vi.spyOn(globalThis, 'fetch')
				.mockResolvedValueOnce(
					new Response('', { status: 402, headers: challengeHeaders }),
				)
				.mockResolvedValueOnce(new Response('OK', { status: 200 }));

			const payInvoice = vi.fn().mockResolvedValue({ preimage: 'pre', feeSats: 0 });

			const result = await l402Fetch(
				'https://api.example.com/nano',
				payInvoice,
				undefined,
				1000,
			);
			expect(result.status).toBe(200);
		});

		it('handles pico-BTC amounts', async () => {
			const challengeHeaders = new Headers({
				// lnbc10000p = 10000 pico-BTC = 1 sat (10000 * 0.0001)
				'WWW-Authenticate': 'L402 macaroon="mac", invoice="lnbc10000p1ptest"',
			});
			vi.spyOn(globalThis, 'fetch')
				.mockResolvedValueOnce(
					new Response('', { status: 402, headers: challengeHeaders }),
				)
				.mockResolvedValueOnce(new Response('OK', { status: 200 }));

			const payInvoice = vi.fn().mockResolvedValue({ preimage: 'pre', feeSats: 0 });

			const result = await l402Fetch(
				'https://api.example.com/pico',
				payInvoice,
				undefined,
				10,
			);
			expect(result.status).toBe(200);
		});
	});

	// -----------------------------------------------------------------------
	// Header normalization
	// -----------------------------------------------------------------------

	describe('header normalization', () => {
		it('works with Headers object', async () => {
			const challengeHeaders = new Headers({
				'WWW-Authenticate': 'L402 macaroon="mac", invoice="lnbc1u1ptest"',
			});
			const fetchSpy = vi
				.spyOn(globalThis, 'fetch')
				.mockResolvedValueOnce(
					new Response('', { status: 402, headers: challengeHeaders }),
				)
				.mockResolvedValueOnce(new Response('OK', { status: 200 }));

			const payInvoice = vi.fn().mockResolvedValue({ preimage: 'pre', feeSats: 0 });

			const reqHeaders = new Headers({ 'X-Custom': 'value' });
			await l402Fetch('https://api.example.com/headers-obj', payInvoice, {
				headers: reqHeaders,
			});

			const retryHeaders = fetchSpy.mock.calls[1][1]?.headers as Record<string, string>;
			expect(retryHeaders['x-custom']).toBe('value');
			expect(retryHeaders.Authorization).toBeTruthy();
		});

		it('works with array headers', async () => {
			const challengeHeaders = new Headers({
				'WWW-Authenticate': 'L402 macaroon="mac", invoice="lnbc1u1ptest"',
			});
			const fetchSpy = vi
				.spyOn(globalThis, 'fetch')
				.mockResolvedValueOnce(
					new Response('', { status: 402, headers: challengeHeaders }),
				)
				.mockResolvedValueOnce(new Response('OK', { status: 200 }));

			const payInvoice = vi.fn().mockResolvedValue({ preimage: 'pre', feeSats: 0 });

			await l402Fetch('https://api.example.com/headers-arr', payInvoice, {
				headers: [['X-Custom', 'arrval']],
			});

			const retryHeaders = fetchSpy.mock.calls[1][1]?.headers as Record<string, string>;
			expect(retryHeaders['X-Custom']).toBe('arrval');
		});

		it('works with no headers', async () => {
			const challengeHeaders = new Headers({
				'WWW-Authenticate': 'L402 macaroon="mac", invoice="lnbc1u1ptest"',
			});
			vi.spyOn(globalThis, 'fetch')
				.mockResolvedValueOnce(
					new Response('', { status: 402, headers: challengeHeaders }),
				)
				.mockResolvedValueOnce(new Response('OK', { status: 200 }));

			const payInvoice = vi.fn().mockResolvedValue({ preimage: 'pre', feeSats: 0 });

			const result = await l402Fetch('https://api.example.com/no-headers', payInvoice);
			expect(result.status).toBe(200);
		});
	});
});
