import { describe, expect, it } from 'vitest';
import {
	CashuPaywallConfigSchema,
	ConditionInfoSchema,
	CreateL402ChallengeParamsSchema,
	MacaroonPayloadSchema,
	Nut10SecretSchema,
	RoutePaymentParamsSchema,
	VerifyL402TokenParamsSchema,
} from '../schemas.js';

describe('CashuPaywallConfigSchema', () => {
	it('accepts valid config', () => {
		const result = CashuPaywallConfigSchema.parse({
			priceSats: 100,
			mintUrl: 'https://mint.example.com',
		});
		expect(result.priceSats).toBe(100);
		expect(result.mintUrl).toBe('https://mint.example.com');
	});

	it('accepts config with optional fields', () => {
		const result = CashuPaywallConfigSchema.parse({
			priceSats: 50,
			mintUrl: 'https://mint.example.com',
			unit: 'msat',
			description: 'Premium API',
		});
		expect(result.unit).toBe('msat');
		expect(result.description).toBe('Premium API');
	});

	it('rejects zero priceSats', () => {
		expect(() =>
			CashuPaywallConfigSchema.parse({ priceSats: 0, mintUrl: 'https://mint.example.com' }),
		).toThrow();
	});

	it('rejects negative priceSats', () => {
		expect(() =>
			CashuPaywallConfigSchema.parse({ priceSats: -10, mintUrl: 'https://mint.example.com' }),
		).toThrow();
	});

	it('rejects non-integer priceSats', () => {
		expect(() =>
			CashuPaywallConfigSchema.parse({ priceSats: 10.5, mintUrl: 'https://mint.example.com' }),
		).toThrow();
	});

	it('rejects invalid URL', () => {
		expect(() =>
			CashuPaywallConfigSchema.parse({ priceSats: 100, mintUrl: 'not-a-url' }),
		).toThrow();
	});

	it('rejects missing required fields', () => {
		expect(() => CashuPaywallConfigSchema.parse({})).toThrow();
		expect(() => CashuPaywallConfigSchema.parse({ priceSats: 100 })).toThrow();
	});
});

describe('CreateL402ChallengeParamsSchema', () => {
	it('accepts valid params', () => {
		const result = CreateL402ChallengeParamsSchema.parse({
			amount: 1000,
			resourcePath: '/api/premium',
			rootKey: 'deadbeef',
		});
		expect(result.amount).toBe(1000);
	});

	it('accepts with optional fields', () => {
		const result = CreateL402ChallengeParamsSchema.parse({
			amount: 500,
			resourcePath: '/api/v1',
			rootKey: 'key123',
			location: 'my-service',
			caveats: ['service=api', 'tier=pro'],
			ttlSeconds: 3600,
		});
		expect(result.caveats).toHaveLength(2);
		expect(result.ttlSeconds).toBe(3600);
	});

	it('rejects zero amount', () => {
		expect(() =>
			CreateL402ChallengeParamsSchema.parse({
				amount: 0,
				resourcePath: '/api',
				rootKey: 'key',
			}),
		).toThrow();
	});

	it('rejects empty resourcePath', () => {
		expect(() =>
			CreateL402ChallengeParamsSchema.parse({
				amount: 100,
				resourcePath: '',
				rootKey: 'key',
			}),
		).toThrow();
	});
});

describe('VerifyL402TokenParamsSchema', () => {
	it('accepts valid params', () => {
		const result = VerifyL402TokenParamsSchema.parse({
			macaroon: 'mac123',
			preimage: 'pre456',
			rootKey: 'key789',
		});
		expect(result.macaroon).toBe('mac123');
	});

	it('rejects empty strings', () => {
		expect(() =>
			VerifyL402TokenParamsSchema.parse({ macaroon: '', preimage: 'pre', rootKey: 'key' }),
		).toThrow();
	});
});

describe('MacaroonPayloadSchema', () => {
	it('accepts valid payload', () => {
		const result = MacaroonPayloadSchema.parse({
			identifier: 'id-123',
			location: 'cashu-l402',
			caveats: ['service=api'],
		});
		expect(result.identifier).toBe('id-123');
	});

	it('accepts empty caveats array', () => {
		const result = MacaroonPayloadSchema.parse({
			identifier: 'id',
			location: 'loc',
			caveats: [],
		});
		expect(result.caveats).toEqual([]);
	});
});

describe('Nut10SecretSchema', () => {
	it('accepts valid NUT-10 secret', () => {
		const result = Nut10SecretSchema.parse({
			kind: 'P2PK',
			nonce: 'abc',
			data: '02deadbeef',
			tags: [['sigflag', 'SIG_ALL']],
		});
		expect(result.kind).toBe('P2PK');
	});

	it('rejects empty kind', () => {
		expect(() =>
			Nut10SecretSchema.parse({ kind: '', nonce: 'a', data: 'b', tags: [] }),
		).toThrow();
	});
});

describe('ConditionInfoSchema', () => {
	it('accepts full condition info', () => {
		const result = ConditionInfoSchema.parse({
			kind: 'P2PK',
			data: '02key',
			tags: [['locktime', '1709337600']],
			locktime: 1709337600,
			nSigs: 2,
			pubkeys: ['02a', '02b'],
			sigAll: true,
		});
		expect(result.nSigs).toBe(2);
	});

	it('accepts minimal condition info', () => {
		const result = ConditionInfoSchema.parse({
			kind: 'HTLC',
			data: 'hashlock',
			tags: [],
		});
		expect(result.kind).toBe('HTLC');
	});
});

describe('RoutePaymentParamsSchema', () => {
	it('accepts minimal params', () => {
		const result = RoutePaymentParamsSchema.parse({ amount: 500 });
		expect(result.amount).toBe(500);
	});

	it('accepts full params', () => {
		const result = RoutePaymentParamsSchema.parse({
			amount: 10_000,
			privacyLevel: 'maximum',
			availableBackends: ['cashu', 'lightning', 'fedimint'],
		});
		expect(result.privacyLevel).toBe('maximum');
	});

	it('rejects invalid privacy level', () => {
		expect(() =>
			RoutePaymentParamsSchema.parse({ amount: 100, privacyLevel: 'ultra' }),
		).toThrow();
	});

	it('rejects invalid backend', () => {
		expect(() =>
			RoutePaymentParamsSchema.parse({ amount: 100, availableBackends: ['bitcoin'] }),
		).toThrow();
	});

	it('rejects negative amount', () => {
		expect(() => RoutePaymentParamsSchema.parse({ amount: -1 })).toThrow();
	});
});
