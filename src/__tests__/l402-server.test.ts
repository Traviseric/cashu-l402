import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	clearPendingChallenges,
	createL402Challenge,
	parseL402AuthHeader,
	signMacaroon,
	verifyL402Token,
	verifyMacaroon,
	verifyPreimage,
} from '../l402-server.js';

const TEST_ROOT_KEY = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

describe('signMacaroon / verifyMacaroon', () => {
	it('round-trips a macaroon payload', () => {
		const payload = {
			identifier: 'test-id-123',
			location: 'test-location',
			caveats: ['service=api', 'tier=premium'],
		};

		const signed = signMacaroon(payload, TEST_ROOT_KEY);
		const verified = verifyMacaroon(signed, TEST_ROOT_KEY);

		expect(verified).not.toBeNull();
		expect(verified!.identifier).toBe('test-id-123');
		expect(verified!.location).toBe('test-location');
		expect(verified!.caveats).toEqual(['service=api', 'tier=premium']);
	});

	it('rejects macaroon with wrong key', () => {
		const payload = {
			identifier: 'test-id',
			location: 'loc',
			caveats: [],
		};
		const signed = signMacaroon(payload, TEST_ROOT_KEY);
		const verified = verifyMacaroon(signed, 'wrong-key');
		expect(verified).toBeNull();
	});

	it('rejects tampered macaroon', () => {
		const payload = {
			identifier: 'test-id',
			location: 'loc',
			caveats: [],
		};
		const signed = signMacaroon(payload, TEST_ROOT_KEY);
		const tampered = `${signed.slice(0, -4)}XXXX`;
		const verified = verifyMacaroon(tampered, TEST_ROOT_KEY);
		expect(verified).toBeNull();
	});

	it('rejects garbage input', () => {
		expect(verifyMacaroon('not-base64-at-all!!!', TEST_ROOT_KEY)).toBeNull();
		expect(verifyMacaroon('', TEST_ROOT_KEY)).toBeNull();
	});
});

describe('verifyPreimage', () => {
	it('verifies correct preimage against hash', () => {
		const preimage = Buffer.from('hello').toString('hex');
		const hash = createHash('sha256').update(Buffer.from(preimage, 'hex')).digest();
		const rHashBase64 = hash.toString('base64');

		expect(verifyPreimage(preimage, rHashBase64)).toBe(true);
	});

	it('rejects wrong preimage', () => {
		const correctPreimage = Buffer.from('hello').toString('hex');
		const hash = createHash('sha256').update(Buffer.from(correctPreimage, 'hex')).digest();
		const rHashBase64 = hash.toString('base64');

		const wrongPreimage = Buffer.from('wrong').toString('hex');
		expect(verifyPreimage(wrongPreimage, rHashBase64)).toBe(false);
	});
});

describe('parseL402AuthHeader', () => {
	it('parses valid L402 header', () => {
		const result = parseL402AuthHeader('L402 macaroonABC:preimage123');
		expect(result).toEqual({ macaroon: 'macaroonABC', preimage: 'preimage123' });
	});

	it('is case-insensitive', () => {
		const result = parseL402AuthHeader('l402 mac:pre');
		expect(result).toEqual({ macaroon: 'mac', preimage: 'pre' });
	});

	it('returns null for non-L402 headers', () => {
		expect(parseL402AuthHeader('Bearer token')).toBeNull();
		expect(parseL402AuthHeader('Cashu token')).toBeNull();
	});

	it('returns null for missing colon separator', () => {
		expect(parseL402AuthHeader('L402 no-colon-here')).toBeNull();
	});

	it('returns null for null/empty', () => {
		expect(parseL402AuthHeader(null)).toBeNull();
		expect(parseL402AuthHeader('')).toBeNull();
	});
});

describe('createL402Challenge + verifyL402Token', () => {
	it('creates and verifies a challenge round-trip', async () => {
		clearPendingChallenges();

		const mockRHash = Buffer.from('test-hash-for-challenge').toString('base64');
		const createInvoice = async () => ({
			paymentRequest: 'lnbc100n1...',
			rHash: mockRHash,
		});

		const challenge = await createL402Challenge({
			amount: 100,
			resourcePath: '/api/test',
			rootKey: TEST_ROOT_KEY,
			createInvoice,
		});

		expect(challenge.wwwAuthenticate).toContain('L402 macaroon=');
		expect(challenge.wwwAuthenticate).toContain('invoice=');
		expect(challenge.macaroon).toBeTruthy();
		expect(challenge.invoice).toBe('lnbc100n1...');

		const payload = verifyMacaroon(challenge.macaroon, TEST_ROOT_KEY);
		expect(payload).not.toBeNull();
		expect(payload!.caveats).toContain('service=/api/test');
	});

	it('rejects expired challenge', async () => {
		clearPendingChallenges();

		const createInvoice = async () => ({
			paymentRequest: 'lnbc100n1...',
			rHash: Buffer.from('expired-test').toString('base64'),
		});

		const challenge = await createL402Challenge({
			amount: 100,
			resourcePath: '/api/test',
			rootKey: TEST_ROOT_KEY,
			createInvoice,
			ttlSeconds: 0,
		});

		await new Promise((r) => setTimeout(r, 10));

		const result = await verifyL402Token({
			macaroon: challenge.macaroon,
			preimage: 'doesnt-matter',
			rootKey: TEST_ROOT_KEY,
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain('expired');
	});
});
