import { describe, expect, it, vi } from 'vitest';
import type { FastifyCashuL402Options } from '../../middleware/fastify.js';

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
	return { headers, url } as unknown as import('fastify').FastifyRequest;
}

function makeReply() {
	const reply = {
		_code: 0,
		_headers: {} as Record<string, string>,
		_body: undefined as unknown,
		code(n: number) {
			reply._code = n;
			return reply;
		},
		header(k: string, v: string) {
			reply._headers[k] = v;
			return reply;
		},
		send(body: unknown) {
			reply._body = body;
			return reply;
		},
	};
	return reply;
}

const baseOptions: FastifyCashuL402Options = {
	priceSats: 10,
	mintUrl: 'https://mock.mint',
	rootKey: 'test-root-key-32-bytes-padded!!!',
	createInvoice: vi.fn().mockResolvedValue({ paymentRequest: 'lnbc...', rHash: 'aabbcc' }),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fastifyCashuL402', () => {
	it('returns 402 with WWW-Authenticate when no auth header is present', async () => {
		const { fastifyCashuL402 } = await import('../../middleware/fastify.js');

		mockCreateL402Challenge.mockResolvedValue({
			wwwAuthenticate: 'L402 macaroon="mac1", invoice="lnbc..."',
			macaroon: 'mac1',
			invoice: 'lnbc...',
			rHash: 'aabbcc',
			expiresAt: new Date(),
		});

		const handler = fastifyCashuL402(baseOptions);
		const req = makeRequest({});
		const reply = makeReply();

		await handler(req, reply);

		expect(reply._code).toBe(402);
		expect(reply._headers['WWW-Authenticate']).toContain('L402');
		expect(mockCreateL402Challenge).toHaveBeenCalledWith(
			expect.objectContaining({
				amount: 10,
				rootKey: 'test-root-key-32-bytes-padded!!!',
			}),
		);
	});

	it('allows through when a valid L402 token is presented', async () => {
		const { fastifyCashuL402 } = await import('../../middleware/fastify.js');

		mockVerifyL402Token.mockResolvedValue({ success: true, type: 'l402', proof: 'mac1' });

		const handler = fastifyCashuL402(baseOptions);
		const req = makeRequest({ authorization: 'L402 mac1:preimage1' });
		const reply = makeReply();

		await handler(req, reply);

		// reply.code/send should NOT have been called — handler returned early
		expect(reply._code).toBe(0);
		expect(mockVerifyL402Token).toHaveBeenCalledWith(
			expect.objectContaining({ macaroon: 'mac1', preimage: 'preimage1' }),
		);
	});

	it('returns 402 when an invalid L402 token is presented', async () => {
		const { fastifyCashuL402 } = await import('../../middleware/fastify.js');

		mockVerifyL402Token.mockResolvedValue({ success: false, type: 'l402', error: 'Invalid macaroon signature' });
		mockCreateL402Challenge.mockResolvedValue({
			wwwAuthenticate: 'L402 macaroon="mac2", invoice="lnbc2..."',
			macaroon: 'mac2',
			invoice: 'lnbc2...',
			rHash: 'ccddee',
			expiresAt: new Date(),
		});

		const handler = fastifyCashuL402(baseOptions);
		const req = makeRequest({ authorization: 'L402 bad-mac:bad-preimage' });
		const reply = makeReply();

		await handler(req, reply);

		expect(reply._code).toBe(402);
		expect(reply._headers['WWW-Authenticate']).toContain('L402');
	});

	it('allows through when a valid X-Cashu token is presented', async () => {
		const { fastifyCashuL402 } = await import('../../middleware/fastify.js');

		mockVerifyCashuPaymentSmart.mockResolvedValue({ paid: true, amountSats: 10, proofs: [], method: 'online' });

		const handler = fastifyCashuL402(baseOptions);
		const req = makeRequest({ 'x-cashu': 'cashuAeyJ...' });
		const reply = makeReply();

		await handler(req, reply);

		expect(reply._code).toBe(0); // not sent
		expect(mockVerifyCashuPaymentSmart).toHaveBeenCalledWith('cashuAeyJ...', baseOptions, undefined);
	});

	it('returns 402 when a Cashu token fails verification', async () => {
		const { fastifyCashuL402 } = await import('../../middleware/fastify.js');

		mockVerifyCashuPaymentSmart.mockResolvedValue({ paid: false, amountSats: 0, proofs: [], method: 'online', error: 'Proof already spent' });
		mockCreateL402Challenge.mockResolvedValue({
			wwwAuthenticate: 'L402 macaroon="mac3", invoice="lnbc3..."',
			macaroon: 'mac3',
			invoice: 'lnbc3...',
			rHash: 'ff0011',
			expiresAt: new Date(),
		});

		const handler = fastifyCashuL402(baseOptions);
		const req = makeRequest({ 'x-cashu': 'cashuAinvalid' });
		const reply = makeReply();

		await handler(req, reply);

		expect(reply._code).toBe(402);
	});

	it('uses options.resourcePath when provided', async () => {
		const { fastifyCashuL402 } = await import('../../middleware/fastify.js');

		mockCreateL402Challenge.mockResolvedValue({
			wwwAuthenticate: 'L402 macaroon="mac4", invoice="lnbc4..."',
			macaroon: 'mac4',
			invoice: 'lnbc4...',
			rHash: 'aabb00',
			expiresAt: new Date(),
		});

		const handler = fastifyCashuL402({ ...baseOptions, resourcePath: '/api/premium' });
		const req = makeRequest({});
		const reply = makeReply();

		await handler(req, reply);

		expect(mockCreateL402Challenge).toHaveBeenCalledWith(
			expect.objectContaining({ resourcePath: '/api/premium' }),
		);
	});
});
