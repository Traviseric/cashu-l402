/**
 * Tests for error codes (task 005), logging hooks (task 006), and rate limit hooks (task 007).
 */
import { describe, expect, it, vi } from 'vitest';
import { getEncodedToken } from '@cashu/cashu-ts';
import { createBridgeKeyPair } from '../bridge-keys.js';
import { verifyCashuPaymentOffline, verifyCashuPaymentSmart } from '../cashu-paywall.js';
import { CashuL402ErrorCode } from '../types.js';
import type { BridgeVerifyConfig, CashuPaywallConfig, LogEntry } from '../types.js';
import { createMockMintKeyset, createMockP2PKProofWithDLEQ } from './helpers/mock-mint-keys.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const bridgeKP = createBridgeKeyPair();
const mockMint = createMockMintKeyset();
const ROOT_KEY = 'test-root-key-hooks';

const basePaywall: CashuPaywallConfig = {
	priceSats: 1,
	mintUrl: 'https://mock.mint',
};

const baseBridge: BridgeVerifyConfig = {
	bridgePubkey: bridgeKP.publicKey,
	mintKeysets: [mockMint.keyset],
	rootKey: ROOT_KEY,
};

function makeToken(proofs: unknown[], mintUrl = 'https://mock.mint') {
	return getEncodedToken({ mint: mintUrl, proofs: proofs as any, unit: 'sat' });
}

// ---------------------------------------------------------------------------
// Task 005 — Error codes
// ---------------------------------------------------------------------------

describe('CashuL402ErrorCode', () => {
	it('has at least 10 distinct codes', () => {
		const codes = Object.values(CashuL402ErrorCode);
		expect(codes.length).toBeGreaterThanOrEqual(10);
		// all unique
		expect(new Set(codes).size).toBe(codes.length);
	});

	it('returns EMPTY_TOKEN code for empty token (offline)', () => {
		// An empty proofs array encodes to a token with 0 proofs
		const token = makeToken([]);
		const result = verifyCashuPaymentOffline(token, basePaywall, baseBridge);
		expect(result.paid).toBe(false);
		expect(result.code).toBe(CashuL402ErrorCode.EMPTY_TOKEN);
	});

	it('returns WRONG_MINT code for mismatched mint (offline)', () => {
		const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
		const token = makeToken([proof], 'https://other.mint');
		const result = verifyCashuPaymentOffline(
			token,
			{ ...basePaywall, mintUrl: 'https://mock.mint' },
			baseBridge,
		);
		expect(result.paid).toBe(false);
		expect(result.code).toBe(CashuL402ErrorCode.WRONG_MINT);
	});

	it('returns INSUFFICIENT_AMOUNT code when proofs are too small (offline)', () => {
		const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint, 1);
		const token = makeToken([proof]);
		const result = verifyCashuPaymentOffline(
			token,
			{ ...basePaywall, priceSats: 1000 },
			baseBridge,
		);
		expect(result.paid).toBe(false);
		expect(result.code).toBe(CashuL402ErrorCode.INSUFFICIENT_AMOUNT);
	});
});

// ---------------------------------------------------------------------------
// Task 006 — Logging hooks
// ---------------------------------------------------------------------------

describe('onLog callback (logging hooks)', () => {
	it('calls onLog with proof_verified_offline on successful offline verification', () => {
		const logs: LogEntry[] = [];
		const onLog = (entry: LogEntry) => logs.push(entry);

		const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
		const token = makeToken([proof]);

		const result = verifyCashuPaymentOffline(token, basePaywall, { ...baseBridge, onLog });

		expect(result.paid).toBe(true);
		const successLog = logs.find((l) => l.event === 'proof_verified_offline');
		expect(successLog).toBeDefined();
		expect(successLog?.level).toBe('info');
		expect(successLog?.context?.dleqVerified).toBe(true);
	});

	it('calls onLog with wrong_mint warning when mint does not match', () => {
		const logs: LogEntry[] = [];
		const onLog = (entry: LogEntry) => logs.push(entry);

		const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
		const token = makeToken([proof], 'https://other.mint');

		verifyCashuPaymentOffline(
			token,
			{ ...basePaywall, mintUrl: 'https://mock.mint' },
			{ ...baseBridge, onLog },
		);

		const warnLog = logs.find((l) => l.event === 'wrong_mint');
		expect(warnLog).toBeDefined();
		expect(warnLog?.level).toBe('warn');
	});

	it('calls onLog with locktime warning when proof locktime has expired', () => {
		const logs: LogEntry[] = [];
		const onLog = (entry: LogEntry) => logs.push(entry);

		const expiredLocktime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
		const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint, 1, [
			['locktime', String(expiredLocktime)],
		]);
		const token = makeToken([proof]);

		const result = verifyCashuPaymentOffline(token, basePaywall, { ...baseBridge, onLog });

		expect(result.paid).toBe(false);
		expect(result.code).toBe(CashuL402ErrorCode.LOCKTIME_EXPIRED);
		const warnLog = logs.find((l) => l.event === 'proof_locktime_expired');
		expect(warnLog).toBeDefined();
		expect(warnLog?.level).toBe('warn');
	});

	it('does not throw when onLog is not provided', () => {
		const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
		const token = makeToken([proof]);
		// No onLog — should not throw
		expect(() => verifyCashuPaymentOffline(token, basePaywall, baseBridge)).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Task 007 — Rate limiting hooks
// ---------------------------------------------------------------------------

describe('onRateLimit callback (rate limiting hooks)', () => {
	it('returns rate_limit_exceeded when onRateLimit returns false', async () => {
		const config: CashuPaywallConfig = {
			...basePaywall,
			onRateLimit: () => false,
		};

		const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
		const token = makeToken([proof]);

		const result = await verifyCashuPaymentSmart(token, config, baseBridge);
		expect(result.paid).toBe(false);
		expect(result.error).toBe('Rate limit exceeded');
		expect(result.code).toBe(CashuL402ErrorCode.RATE_LIMIT_EXCEEDED);
	});

	it('allows request when onRateLimit returns true', async () => {
		const config: CashuPaywallConfig = {
			...basePaywall,
			onRateLimit: () => true,
		};

		const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
		const token = makeToken([proof]);

		const result = await verifyCashuPaymentSmart(token, config, baseBridge);
		expect(result.paid).toBe(true);
	});

	it('supports async onRateLimit returning false', async () => {
		const config: CashuPaywallConfig = {
			...basePaywall,
			onRateLimit: async () => Promise.resolve(false),
		};

		const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
		const token = makeToken([proof]);

		const result = await verifyCashuPaymentSmart(token, config, baseBridge);
		expect(result.paid).toBe(false);
		expect(result.code).toBe(CashuL402ErrorCode.RATE_LIMIT_EXCEEDED);
	});

	it('passes requesterId to onRateLimit callback', async () => {
		const rateLimitFn = vi.fn().mockReturnValue(false);
		const config: CashuPaywallConfig = { ...basePaywall, onRateLimit: rateLimitFn };

		const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
		const token = makeToken([proof]);

		await verifyCashuPaymentSmart(token, config, baseBridge, 'user-123');

		expect(rateLimitFn).toHaveBeenCalledWith(
			expect.objectContaining({ requesterId: 'user-123' }),
		);
	});

	it('proceeds normally when onRateLimit is not provided', async () => {
		const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
		const token = makeToken([proof]);

		const result = await verifyCashuPaymentSmart(token, basePaywall, baseBridge);
		expect(result.paid).toBe(true);
	});

	it('calls onLog when rate limit is exceeded', async () => {
		const logs: LogEntry[] = [];
		const config: CashuPaywallConfig = {
			...basePaywall,
			onRateLimit: () => false,
			onLog: (entry) => logs.push(entry),
		};

		const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
		const token = makeToken([proof]);

		await verifyCashuPaymentSmart(token, config, baseBridge, 'attacker-ip');

		const warnLog = logs.find((l) => l.event === 'rate_limit_exceeded');
		expect(warnLog).toBeDefined();
		expect(warnLog?.level).toBe('warn');
	});
});
