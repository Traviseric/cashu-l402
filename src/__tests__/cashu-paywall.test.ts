import { describe, expect, it, vi } from 'vitest';
import {
	buildCashuChallenge,
	buildDualChallenge,
	detectPaymentMethod,
	parseCashuAuthHeader,
	verifyCashuPaymentSmart,
} from '../cashu-paywall.js';
import type { BridgeVerifyConfig, CashuPaywallConfig } from '../types.js';

// vi.mock is hoisted — use vi.hoisted() to share constants with the factory.
const { MOCK_MINT_URL, mockDecodedToken } = vi.hoisted(() => {
	const MOCK_MINT_URL = 'https://mock.mint';
	const mockDecodedToken = {
		token: [
			{
				mint: MOCK_MINT_URL,
				proofs: [{ amount: 100, secret: 'plain-hex-secret', C: '02abc123', id: 'test001' }],
			},
		],
	};
	return { MOCK_MINT_URL, mockDecodedToken };
});

// Mock cashu-ts for verifyCashuPaymentSmart sync fallback tests.
// - getDecodedToken: returns a controlled v3-format decoded token (plain proofs, not P2PK)
// - CashuWallet/CashuMint: avoid real mint contact
// - All other exports use real implementations via importOriginal spread.
vi.mock('@cashu/cashu-ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@cashu/cashu-ts')>();
	return {
		...actual,
		getDecodedToken: vi.fn().mockReturnValue(mockDecodedToken),
		CashuMint: vi.fn().mockImplementation(() => ({})),
		CashuWallet: vi.fn().mockImplementation(() => ({
			loadMint: vi.fn().mockResolvedValue(undefined),
			checkProofsStates: vi.fn().mockResolvedValue([{ state: 'UNSPENT' }]),
			receive: vi.fn().mockResolvedValue(undefined),
		})),
	};
});

describe('parseCashuAuthHeader', () => {
	it('extracts token from valid Cashu header', () => {
		const result = parseCashuAuthHeader('Cashu cashuAeyJ0b2tlbi...');
		expect(result).toBe('cashuAeyJ0b2tlbi...');
	});

	it('is case-insensitive', () => {
		expect(parseCashuAuthHeader('CASHU abc123')).toBe('abc123');
		expect(parseCashuAuthHeader('cashu abc123')).toBe('abc123');
	});

	it('returns null for non-Cashu headers', () => {
		expect(parseCashuAuthHeader('Bearer token123')).toBeNull();
		expect(parseCashuAuthHeader('L402 mac:preimage')).toBeNull();
	});

	it('returns null for null/empty input', () => {
		expect(parseCashuAuthHeader(null)).toBeNull();
		expect(parseCashuAuthHeader('')).toBeNull();
	});

	it('returns null for Cashu prefix with no token', () => {
		expect(parseCashuAuthHeader('Cashu ')).toBeNull();
		expect(parseCashuAuthHeader('Cashu   ')).toBeNull();
	});

	it('trims whitespace', () => {
		expect(parseCashuAuthHeader('  Cashu   token123  ')).toBe('token123');
	});
});

describe('buildCashuChallenge', () => {
	it('builds correct challenge string', () => {
		const result = buildCashuChallenge({
			priceSats: 100,
			mintUrl: 'https://mint.example.com',
		});
		expect(result).toBe('Cashu mint="https://mint.example.com", amount="100", unit="sat"');
	});

	it('includes description when provided', () => {
		const result = buildCashuChallenge({
			priceSats: 50,
			mintUrl: 'https://mint.example.com',
			description: 'Premium API access',
		});
		expect(result).toContain('description="Premium API access"');
	});

	it('uses custom unit', () => {
		const result = buildCashuChallenge({
			priceSats: 1000,
			mintUrl: 'https://mint.example.com',
			unit: 'msat',
		});
		expect(result).toContain('unit="msat"');
	});
});

describe('detectPaymentMethod', () => {
	it('detects Cashu payment', () => {
		const result = detectPaymentMethod('Cashu cashuAtoken...');
		expect(result.method).toBe('cashu');
		expect(result.token).toBe('cashuAtoken...');
	});

	it('detects L402 payment', () => {
		const result = detectPaymentMethod('L402 macaroon:preimage');
		expect(result.method).toBe('l402');
		expect(result.token).toBe('macaroon:preimage');
	});

	it('returns none for unrecognized', () => {
		expect(detectPaymentMethod('Bearer xyz')).toEqual({ method: 'none', token: null });
		expect(detectPaymentMethod(null)).toEqual({ method: 'none', token: null });
	});
});

describe('buildDualChallenge', () => {
	it('includes Cashu challenge', () => {
		const result = buildDualChallenge({ priceSats: 100, mintUrl: 'https://mint.example.com' });
		expect(result['WWW-Authenticate']).toContain('Cashu mint=');
	});

	it('includes both challenges when L402 provided', () => {
		const result = buildDualChallenge(
			{ priceSats: 100, mintUrl: 'https://mint.example.com' },
			'L402 macaroon="abc", invoice="lnbc..."',
		);
		expect(result['WWW-Authenticate']).toContain('Cashu mint=');
		expect(result['WWW-Authenticate']).toContain('L402 macaroon=');
	});
});

// ---------------------------------------------------------------------------
// verifyCashuPaymentSmart — sync fallback path
// CashuWallet is mocked above to avoid real mint contact.
// ---------------------------------------------------------------------------

describe('verifyCashuPaymentSmart — sync fallback', () => {
	const config: CashuPaywallConfig = { priceSats: 100, mintUrl: MOCK_MINT_URL };

	// Token string is arbitrary — getDecodedToken is mocked to return mockDecodedToken above.
	// mockDecodedToken has plain (non-P2PK) proofs → isEligibleForOfflineVerify returns false.
	const plainToken = 'cashuAmocktoken';

	it('uses sync path and sets method: online when no bridgeConfig provided', async () => {
		const result = await verifyCashuPaymentSmart(plainToken, config);
		expect(result.method).toBe('online');
		expect(result.paid).toBe(true);
		expect(result.amountSats).toBe(100);
	});

	it('uses sync path when proofs are not P2PK-locked (ineligible for offline)', async () => {
		// bridgeConfig present but proofs have plain secrets → isEligibleForOfflineVerify = false
		const bridgeConfig: BridgeVerifyConfig = {
			bridgePubkey: '02' + 'a'.repeat(64),
			mintKeysets: [],
			rootKey: 'test-root-key',
		};
		const result = await verifyCashuPaymentSmart(plainToken, config, bridgeConfig);
		expect(result.method).toBe('online');
		expect(result.paid).toBe(true);
	});

	it('spreads syncResult fields and adds method: online', async () => {
		const result = await verifyCashuPaymentSmart(plainToken, config);
		// Verifies the { ...syncResult, method: 'online' } spread preserves paid, amountSats, proofs
		expect(result.method).toBe('online');
		expect(result.paid).toBe(true);
		expect(result.amountSats).toBe(100);
		expect(Array.isArray(result.proofs)).toBe(true);
	});

	it('returns paid: false with method: online when amount is insufficient', async () => {
		const expensiveConfig: CashuPaywallConfig = { priceSats: 9999, mintUrl: MOCK_MINT_URL };
		const result = await verifyCashuPaymentSmart(plainToken, expensiveConfig);
		expect(result.method).toBe('online');
		expect(result.paid).toBe(false);
		expect(result.error).toContain('Insufficient');
	});
});
