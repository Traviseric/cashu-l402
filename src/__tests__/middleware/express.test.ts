import { describe, expect, it, vi } from 'vitest';
import type { ExpressCashuL402Options } from '../../middleware/express.js';

// ---------------------------------------------------------------------------
// Module mocks — hoisted so vi.mock factories can reference them
// ---------------------------------------------------------------------------

const { mockVerifyL402Token, mockVerifyCashuPaymentSmart, mockCreateL402Challenge } = vi.hoisted(
	() => ({
		mockVerifyL402Token: vi.fn(),
		mockVerifyCashuPaymentSmart: vi.fn(),
		mockCreateL402Challenge: vi.fn(),
	}),
);

vi.mock('../../l402-server.js', () => ({
	verifyL402Token: mockVerifyL402Token,
	createL402Challenge: mockCreateL402Challenge,
}));

vi.mock('../../cashu-paywall.js', () => ({
	verifyCashuPaymentSmart: mockVerifyCashuPaymentSmart,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(headers: Record<string, string> = {}, url = '/api/resource') {
	return { headers, url };
}

function makeResponse() {
	const res = {
		_status: 0,
		_headers: {} as Record<string, string>,
		_body: undefined as unknown,
		status(code: number) {
			res._status = code;
			return res;
		},
		set(k: string, v: string) {
			res._headers[k] = v;
			return res;
		},
		json(body: unknown) {
			res._body = body;
			return res;
		},
	};
	return res;
}

const baseOptions: ExpressCashuL402Options = {
	priceSats: 10,
	mintUrl: 'https://mock.mint',
	rootKey: 'test-root-key-32-bytes-padded!!!',
	createInvoice: vi.fn().mockResolvedValue({ paymentRequest: 'lnbc...', rHash: 'aabbcc' }),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('expressCashuL402', () => {
	it('returns 402 with WWW-Authenticate when no auth header is present', async () => {
		const { expressCashuL402 } = await import('../../middleware/express.js');

		mockCreateL402Challenge.mockResolvedValue({
			wwwAuthenticate: 'L402 macaroon="mac1", invoice="lnbc..."',
			macaroon: 'mac1',
			invoice: 'lnbc...',
			rHash: 'aabbcc',
			expiresAt: new Date(),
		});

		const middleware = expressCashuL402(baseOptions);
		const req = makeRequest({});
		const res = makeResponse();
		const next = vi.fn();

		await middleware(req, res, next);

		expect(res._status).toBe(402);
		expect(res._headers['WWW-Authenticate']).toContain('L402');
		expect(next).not.toHaveBeenCalled();
		expect(mockCreateL402Challenge).toHaveBeenCalledWith(
			expect.objectContaining({
				amount: 10,
				rootKey: 'test-root-key-32-bytes-padded!!!',
			}),
		);
	});

	it('calls next() and does not send 402 when a valid L402 token is presented', async () => {
		const { expressCashuL402 } = await import('../../middleware/express.js');

		mockVerifyL402Token.mockResolvedValue({ success: true, type: 'l402', proof: 'mac1' });

		const middleware = expressCashuL402(baseOptions);
		const req = makeRequest({ authorization: 'L402 mac1:preimage1' });
		const res = makeResponse();
		const next = vi.fn();

		await middleware(req, res, next);

		expect(next).toHaveBeenCalledOnce();
		expect(res._status).toBe(0); // not set
		expect(mockVerifyL402Token).toHaveBeenCalledWith(
			expect.objectContaining({ macaroon: 'mac1', preimage: 'preimage1' }),
		);
	});

	it('returns 402 when an invalid L402 token is presented', async () => {
		const { expressCashuL402 } = await import('../../middleware/express.js');

		mockVerifyL402Token.mockResolvedValue({ success: false, type: 'l402', error: 'Invalid macaroon signature' });
		mockCreateL402Challenge.mockResolvedValue({
			wwwAuthenticate: 'L402 macaroon="mac2", invoice="lnbc2..."',
			macaroon: 'mac2',
			invoice: 'lnbc2...',
			rHash: 'ccddee',
			expiresAt: new Date(),
		});

		const middleware = expressCashuL402(baseOptions);
		const req = makeRequest({ authorization: 'L402 bad-mac:bad-preimage' });
		const res = makeResponse();
		const next = vi.fn();

		await middleware(req, res, next);

		expect(res._status).toBe(402);
		expect(res._headers['WWW-Authenticate']).toContain('L402');
		expect(next).not.toHaveBeenCalled();
	});

	it('calls next() when a valid X-Cashu token is presented', async () => {
		const { expressCashuL402 } = await import('../../middleware/express.js');

		mockVerifyCashuPaymentSmart.mockResolvedValue({ paid: true, amountSats: 10, proofs: [], method: 'online' });

		const middleware = expressCashuL402(baseOptions);
		const req = makeRequest({ 'x-cashu': 'cashuAeyJ...' });
		const res = makeResponse();
		const next = vi.fn();

		await middleware(req, res, next);

		expect(next).toHaveBeenCalledOnce();
		expect(res._status).toBe(0); // not set
		expect(mockVerifyCashuPaymentSmart).toHaveBeenCalledWith('cashuAeyJ...', baseOptions, undefined);
	});

	it('returns 402 when a Cashu token fails verification', async () => {
		const { expressCashuL402 } = await import('../../middleware/express.js');

		mockVerifyCashuPaymentSmart.mockResolvedValue({ paid: false, amountSats: 0, proofs: [], method: 'online', error: 'Proof already spent' });
		mockCreateL402Challenge.mockResolvedValue({
			wwwAuthenticate: 'L402 macaroon="mac3", invoice="lnbc3..."',
			macaroon: 'mac3',
			invoice: 'lnbc3...',
			rHash: 'ff0011',
			expiresAt: new Date(),
		});

		const middleware = expressCashuL402(baseOptions);
		const req = makeRequest({ 'x-cashu': 'cashuAinvalid' });
		const res = makeResponse();
		const next = vi.fn();

		await middleware(req, res, next);

		expect(res._status).toBe(402);
		expect(next).not.toHaveBeenCalled();
	});

	it('uses options.resourcePath when provided', async () => {
		const { expressCashuL402 } = await import('../../middleware/express.js');

		mockCreateL402Challenge.mockResolvedValue({
			wwwAuthenticate: 'L402 macaroon="mac4", invoice="lnbc4..."',
			macaroon: 'mac4',
			invoice: 'lnbc4...',
			rHash: 'aabb00',
			expiresAt: new Date(),
		});

		const middleware = expressCashuL402({ ...baseOptions, resourcePath: '/api/premium' });
		const req = makeRequest({});
		const res = makeResponse();
		const next = vi.fn();

		await middleware(req, res, next);

		expect(mockCreateL402Challenge).toHaveBeenCalledWith(
			expect.objectContaining({ resourcePath: '/api/premium' }),
		);
	});
});
