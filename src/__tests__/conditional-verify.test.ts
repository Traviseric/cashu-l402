import { describe, expect, it } from 'vitest';
import { getEncodedToken } from '@cashu/cashu-ts';
import { createBridgeKeyPair } from '../bridge-keys.js';
import { verifyCashuPaymentOffline } from '../cashu-paywall.js';
import { verifyMacaroon } from '../l402-server.js';
import type { BridgeVerifyConfig, CashuPaywallConfig } from '../types.js';
import { createMockMintKeyset, createMockP2PKProofWithDLEQ } from './helpers/mock-mint-keys.js';

// Shared fixtures
const bridgeKP = createBridgeKeyPair();
const mockMint = createMockMintKeyset();
const ROOT_KEY = 'test-root-key-for-bridge-l402';

const paywallConfig: CashuPaywallConfig = {
	priceSats: 1,
	mintUrl: 'https://mock.mint',
	description: '/api/premium',
};

const bridgeConfig: BridgeVerifyConfig = {
	bridgePubkey: bridgeKP.publicKey,
	mintKeysets: [mockMint.keyset],
	rootKey: ROOT_KEY,
};

function makeToken(proofs: any[], mintUrl = 'https://mock.mint') {
	return getEncodedToken({ mint: mintUrl, proofs, unit: 'sat' });
}

/**
 * Create a P2PK proof with a locktime tag baked into the NUT-10 secret.
 * The locktime is included before blinding so the DLEQ proof remains valid.
 */
function createProofWithLocktime(locktime: number) {
	return createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint, 1, [
		['locktime', String(locktime)],
	]);
}

describe('conditional-verify (Phase 2C)', () => {
	describe('basic offline verification', () => {
		it('issues bridge L402 for valid P2PK + DLEQ proof', () => {
			const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
			const token = makeToken([proof]);

			const result = verifyCashuPaymentOffline(token, paywallConfig, bridgeConfig);
			expect(result.paid).toBe(true);
			expect(result.method).toBe('offline');
			expect(result.p2pkVerified).toBe(true);
			expect(result.dleqVerified).toBe(true);
			expect(result.bridgeL402).toBeDefined();
		});

		it('bridge L402 macaroon is verifiable', () => {
			const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
			const token = makeToken([proof]);

			const result = verifyCashuPaymentOffline(token, paywallConfig, bridgeConfig);
			expect(result.bridgeL402).toBeDefined();

			// Verify the macaroon is signed correctly
			const payload = verifyMacaroon(result.bridgeL402!, ROOT_KEY);
			expect(payload).not.toBeNull();
			expect(payload!.caveats).toContain('payment_method=cashu_p2pk');
			expect(payload!.caveats).toContain('service=/api/premium');
		});

		it('rejects wrong mint URL', () => {
			const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
			const token = makeToken([proof], 'https://wrong.mint');

			const result = verifyCashuPaymentOffline(token, paywallConfig, bridgeConfig);
			expect(result.paid).toBe(false);
			expect(result.error).toContain('Unexpected mint');
		});

		it('rejects insufficient amount', () => {
			const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
			const token = makeToken([proof]);
			const expensiveConfig = { ...paywallConfig, priceSats: 999 };

			const result = verifyCashuPaymentOffline(token, expensiveConfig, bridgeConfig);
			expect(result.paid).toBe(false);
			expect(result.error).toContain('Insufficient amount');
		});
	});

	describe('TTL clamping from locktime', () => {
		it('clamps TTL to locktime when locktime is set', () => {
			const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
			const { proof } = createProofWithLocktime(futureTime);
			const token = makeToken([proof]);

			const result = verifyCashuPaymentOffline(token, paywallConfig, bridgeConfig);
			expect(result.paid).toBe(true);

			// Verify the macaroon has an expires_at caveat
			const payload = verifyMacaroon(result.bridgeL402!, ROOT_KEY);
			expect(payload).not.toBeNull();
			const expiresAtCaveat = payload!.caveats.find((c) => c.startsWith('expires_at='));
			expect(expiresAtCaveat).toBeDefined();

			// The expires_at should be no later than futureTime
			const expiresAt = Number.parseInt(expiresAtCaveat!.split('=')[1], 10);
			expect(expiresAt).toBeLessThanOrEqual(futureTime);
		});

		it('rejects expired locktime', () => {
			const pastTime = Math.floor(Date.now() / 1000) - 100; // 100 seconds ago
			const { proof } = createProofWithLocktime(pastTime);
			const token = makeToken([proof]);

			const result = verifyCashuPaymentOffline(token, paywallConfig, bridgeConfig);
			expect(result.paid).toBe(false);
			expect(result.error).toContain('locktime has expired');
		});

		it('uses minimum locktime across multiple proofs', () => {
			const nearFuture = Math.floor(Date.now() / 1000) + 1800; // 30 min
			const farFuture = Math.floor(Date.now() / 1000) + 7200; // 2 hours
			const { proof: p1 } = createProofWithLocktime(nearFuture);
			const { proof: p2 } = createProofWithLocktime(farFuture);
			const token = makeToken([p1, p2]);

			const result = verifyCashuPaymentOffline(token, paywallConfig, bridgeConfig);
			expect(result.paid).toBe(true);

			const payload = verifyMacaroon(result.bridgeL402!, ROOT_KEY);
			const expiresAtCaveat = payload!.caveats.find((c) => c.startsWith('expires_at='));
			const expiresAt = Number.parseInt(expiresAtCaveat!.split('=')[1], 10);
			// Should be clamped to the nearer locktime
			expect(expiresAt).toBeLessThanOrEqual(nearFuture);
		});
	});

	describe('condition caveats in macaroon', () => {
		it('embeds condition_kind caveat for P2PK proofs', () => {
			const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
			const token = makeToken([proof]);

			const result = verifyCashuPaymentOffline(token, paywallConfig, bridgeConfig);
			expect(result.paid).toBe(true);

			const payload = verifyMacaroon(result.bridgeL402!, ROOT_KEY);
			expect(payload!.caveats).toContain('condition_kind=P2PK');
		});

		it('embeds locktime caveat when present', () => {
			const futureTime = Math.floor(Date.now() / 1000) + 3600;
			const { proof } = createProofWithLocktime(futureTime);
			const token = makeToken([proof]);

			const result = verifyCashuPaymentOffline(token, paywallConfig, bridgeConfig);
			expect(result.paid).toBe(true);

			const payload = verifyMacaroon(result.bridgeL402!, ROOT_KEY);
			expect(payload!.caveats).toContain(`locktime=${futureTime}`);
		});

		it('deduplicates condition caveats across proofs', () => {
			const { proof: p1 } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
			const { proof: p2 } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
			const token = makeToken([p1, p2]);

			const result = verifyCashuPaymentOffline(token, paywallConfig, bridgeConfig);
			const payload = verifyMacaroon(result.bridgeL402!, ROOT_KEY);
			// condition_kind=P2PK should appear only once
			const p2pkCaveats = payload!.caveats.filter((c) => c === 'condition_kind=P2PK');
			expect(p2pkCaveats).toHaveLength(1);
		});
	});
});
