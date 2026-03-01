import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	clearPendingChallenges,
	createBridgeL402,
	createL402Challenge,
	parseL402AuthHeader,
	signMacaroon,
	verifyCaveats,
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

describe('verifyCaveats', () => {
	const base = { identifier: 'id', location: 'loc' };

	it('passes when no caveats present', () => {
		const result = verifyCaveats({ ...base, caveats: [] });
		expect(result.valid).toBe(true);
	});

	it('passes token with future expires_at', () => {
		const future = Math.floor(Date.now() / 1000) + 3600;
		const result = verifyCaveats({ ...base, caveats: [`expires_at=${future}`] });
		expect(result.valid).toBe(true);
	});

	it('rejects token with past expires_at', () => {
		const past = Math.floor(Date.now() / 1000) - 100;
		const result = verifyCaveats({ ...base, caveats: [`expires_at=${past}`] });
		expect(result.valid).toBe(false);
		expect(result.error).toContain('Token expired');
	});

	it('passes token without expires_at (backwards compatible)', () => {
		const result = verifyCaveats({ ...base, caveats: ['service=/api/v1', 'tier=premium'] });
		expect(result.valid).toBe(true);
	});

	it('passes matching service caveat', () => {
		const result = verifyCaveats(
			{ ...base, caveats: ['service=/api/v1'] },
			'/api/v1',
		);
		expect(result.valid).toBe(true);
	});

	it('rejects mismatched service caveat', () => {
		const result = verifyCaveats(
			{ ...base, caveats: ['service=/api/basic'] },
			'/api/premium',
		);
		expect(result.valid).toBe(false);
		expect(result.error).toContain('Service mismatch');
		expect(result.error).toContain('/api/premium');
	});

	it('skips service check when expectedService not provided', () => {
		const result = verifyCaveats({ ...base, caveats: ['service=/api/basic'] });
		expect(result.valid).toBe(true);
	});

	it('rejects on expires_at even when service matches', () => {
		const past = Math.floor(Date.now() / 1000) - 1;
		const result = verifyCaveats(
			{ ...base, caveats: [`expires_at=${past}`, 'service=/api/v1'] },
			'/api/v1',
		);
		expect(result.valid).toBe(false);
		expect(result.error).toContain('Token expired');
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

describe('createBridgeL402', () => {
	const BRIDGE_KEY = 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';

	it('returns a macaroon and preimage', () => {
		const result = createBridgeL402({
			rootKey: BRIDGE_KEY,
			proofSecrets: ['secret1', 'secret2'],
			resourcePath: '/api/resource',
		});
		expect(typeof result.macaroon).toBe('string');
		expect(result.macaroon.length).toBeGreaterThan(0);
		expect(typeof result.preimage).toBe('string');
		expect(result.preimage.length).toBeGreaterThan(0);
	});

	it('produces unique preimage for same inputs on each call', () => {
		const params = { rootKey: BRIDGE_KEY, proofSecrets: ['s1', 's2'], resourcePath: '/api' };
		const result1 = createBridgeL402(params);
		const result2 = createBridgeL402(params);
		expect(result1.preimage).not.toBe(result2.preimage);
	});

	it('produces unique macaroon identifier for same inputs on each call', () => {
		const params = { rootKey: BRIDGE_KEY, proofSecrets: ['s1', 's2'], resourcePath: '/api' };
		const result1 = createBridgeL402(params);
		const result2 = createBridgeL402(params);
		expect(result1.macaroon).not.toBe(result2.macaroon);
	});

	it('macaroon verifies with the root key', () => {
		const result = createBridgeL402({
			rootKey: BRIDGE_KEY,
			proofSecrets: ['s1'],
			resourcePath: '/api/test',
		});
		const payload = verifyMacaroon(result.macaroon, BRIDGE_KEY);
		expect(payload).not.toBeNull();
		expect(payload!.caveats).toContain('service=/api/test');
		expect(payload!.caveats).toContain('payment_method=cashu_p2pk');
	});

	it('includes expires_at caveat when ttlSeconds > 0', () => {
		const before = Math.floor(Date.now() / 1000);
		const result = createBridgeL402({
			rootKey: BRIDGE_KEY,
			proofSecrets: ['s1'],
			resourcePath: '/api/test',
			ttlSeconds: 3600,
		});
		const payload = verifyMacaroon(result.macaroon, BRIDGE_KEY);
		expect(payload).not.toBeNull();
		const expiryCaveat = payload!.caveats.find((c) => c.startsWith('expires_at='));
		expect(expiryCaveat).toBeDefined();
		const expiresAt = parseInt(expiryCaveat!.split('=')[1], 10);
		expect(expiresAt).toBeGreaterThanOrEqual(before + 3600);
	});

	it('omits expires_at caveat when ttlSeconds is 0', () => {
		const result = createBridgeL402({
			rootKey: BRIDGE_KEY,
			proofSecrets: ['s1'],
			resourcePath: '/api/test',
			ttlSeconds: 0,
		});
		const payload = verifyMacaroon(result.macaroon, BRIDGE_KEY);
		expect(payload).not.toBeNull();
		const expiryCaveat = payload!.caveats.find((c) => c.startsWith('expires_at='));
		expect(expiryCaveat).toBeUndefined();
	});
});
