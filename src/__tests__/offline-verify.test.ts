import { describe, expect, it } from 'vitest';
import { getEncodedToken } from '@cashu/cashu-ts';
import { createBridgeKeyPair } from '../bridge-keys.js';
import {
	hasValidDleqProof,
	isEligibleForOfflineVerify,
	isLockedToBridge,
	verifyProofOffline,
	verifyTokenOffline,
} from '../offline-verify.js';
import {
	createMockMintKeyset,
	createMockP2PKProofWithDLEQ,
	createMockProofTamperedDLEQ,
	createMockProofWithoutDLEQ,
	createMockProofWrongPubkey,
	createMockUnconditionalProof,
} from './helpers/mock-mint-keys.js';

// Shared fixtures
const bridgeKP = createBridgeKeyPair();
const mockMint = createMockMintKeyset();

describe('isLockedToBridge', () => {
	it('returns true for proof locked to bridge pubkey', () => {
		const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
		expect(isLockedToBridge(proof, bridgeKP.publicKey)).toBe(true);
	});

	it('returns false for proof locked to wrong pubkey', () => {
		const { proof } = createMockProofWrongPubkey(mockMint);
		expect(isLockedToBridge(proof, bridgeKP.publicKey)).toBe(false);
	});

	it('returns false for unconditional proof (no P2PK)', () => {
		const { proof } = createMockUnconditionalProof(mockMint);
		expect(isLockedToBridge(proof, bridgeKP.publicKey)).toBe(false);
	});

	it('returns false for non-JSON secret', () => {
		expect(isLockedToBridge({ secret: 'not-json' }, bridgeKP.publicKey)).toBe(false);
	});

	it('handles case-insensitive hex comparison', () => {
		const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
		expect(isLockedToBridge(proof, bridgeKP.publicKey.toUpperCase())).toBe(true);
	});
});

describe('hasValidDleqProof', () => {
	it('returns true for valid DLEQ proof', () => {
		const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
		expect(hasValidDleqProof(proof as any, mockMint.keyset)).toBe(true);
	});

	it('returns false for proof without DLEQ', () => {
		const { proof } = createMockProofWithoutDLEQ(bridgeKP.publicKey, mockMint);
		expect(hasValidDleqProof(proof as any, mockMint.keyset)).toBe(false);
	});

	it('returns false for tampered DLEQ', () => {
		const { proof } = createMockProofTamperedDLEQ(bridgeKP.publicKey, mockMint);
		expect(hasValidDleqProof(proof as any, mockMint.keyset)).toBe(false);
	});
});

describe('verifyProofOffline', () => {
	const config = {
		bridgePubkey: bridgeKP.publicKey,
		mintKeysets: [mockMint.keyset],
	};

	it('passes for valid P2PK + DLEQ proof', () => {
		const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
		const result = verifyProofOffline(proof as any, config);
		expect(result.valid).toBe(true);
		expect(result.p2pkValid).toBe(true);
		expect(result.dleqValid).toBe(true);
	});

	it('fails for proof locked to wrong pubkey', () => {
		const { proof } = createMockProofWrongPubkey(mockMint);
		const result = verifyProofOffline(proof as any, config);
		expect(result.valid).toBe(false);
		expect(result.p2pkValid).toBe(false);
		expect(result.error).toContain('not P2PK-locked');
	});

	it('fails for proof without DLEQ (requireDleq=true)', () => {
		const { proof } = createMockProofWithoutDLEQ(bridgeKP.publicKey, mockMint);
		const result = verifyProofOffline(proof as any, config);
		expect(result.valid).toBe(false);
		expect(result.p2pkValid).toBe(true);
		expect(result.dleqValid).toBe(false);
		expect(result.error).toContain('missing DLEQ');
	});

	it('passes for proof without DLEQ when requireDleq=false', () => {
		const { proof } = createMockProofWithoutDLEQ(bridgeKP.publicKey, mockMint);
		const result = verifyProofOffline(proof as any, { ...config, requireDleq: false });
		expect(result.valid).toBe(true);
		expect(result.p2pkValid).toBe(true);
		expect(result.dleqValid).toBe(false);
	});

	it('fails for tampered DLEQ', () => {
		const { proof } = createMockProofTamperedDLEQ(bridgeKP.publicKey, mockMint);
		const result = verifyProofOffline(proof as any, config);
		expect(result.valid).toBe(false);
		expect(result.p2pkValid).toBe(true);
		expect(result.dleqValid).toBe(false);
		expect(result.error).toContain('DLEQ proof verification failed');
	});

	it('fails for unconditional proof', () => {
		const { proof } = createMockUnconditionalProof(mockMint);
		const result = verifyProofOffline(proof as any, config);
		expect(result.valid).toBe(false);
		expect(result.p2pkValid).toBe(false);
	});

	it('fails when keyset ID does not match', () => {
		const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
		const wrongKeyset = { ...mockMint.keyset, id: 'wrong-id' };
		const result = verifyProofOffline(proof as any, {
			...config,
			mintKeysets: [wrongKeyset],
		});
		expect(result.valid).toBe(false);
		expect(result.error).toContain('No matching keyset');
	});
});

describe('verifyTokenOffline', () => {
	const config = {
		bridgePubkey: bridgeKP.publicKey,
		mintKeysets: [mockMint.keyset],
	};

	function encodeToken(proofs: any[], mintUrl = 'https://mock.mint') {
		return getEncodedToken({ mint: mintUrl, proofs, unit: 'sat' });
	}

	it('passes for token with valid P2PK + DLEQ proofs', () => {
		const { proof: p1 } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
		const { proof: p2 } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
		const token = encodeToken([p1, p2]);

		const result = verifyTokenOffline(token, config);
		expect(result.allValid).toBe(true);
		expect(result.validCount).toBe(2);
		expect(result.invalidCount).toBe(0);
	});

	it('fails if any proof is invalid', () => {
		const { proof: good } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
		const { proof: bad } = createMockProofWrongPubkey(mockMint);
		const token = encodeToken([good, bad]);

		const result = verifyTokenOffline(token, config);
		expect(result.allValid).toBe(false);
		expect(result.validCount).toBe(1);
		expect(result.invalidCount).toBe(1);
	});

	it('fails for empty token', () => {
		const result = verifyTokenOffline('', config);
		expect(result.allValid).toBe(false);
		expect(result.results).toHaveLength(0);
	});

	it('fails for invalid token string', () => {
		const result = verifyTokenOffline('not-a-token', config);
		expect(result.allValid).toBe(false);
	});

	it('returns per-proof results', () => {
		const { proof: p1 } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
		const { proof: p2 } = createMockProofTamperedDLEQ(bridgeKP.publicKey, mockMint);
		const token = encodeToken([p1, p2]);

		const result = verifyTokenOffline(token, config);
		expect(result.results).toHaveLength(2);
		expect(result.results[0].valid).toBe(true);
		expect(result.results[1].valid).toBe(false);
	});
});

describe('isEligibleForOfflineVerify', () => {
	function encodeToken(proofs: any[], mintUrl = 'https://mock.mint') {
		return getEncodedToken({ mint: mintUrl, proofs, unit: 'sat' });
	}

	it('returns true when all proofs have P2PK + DLEQ', () => {
		const { proof } = createMockP2PKProofWithDLEQ(bridgeKP.publicKey, mockMint);
		const token = encodeToken([proof]);
		expect(isEligibleForOfflineVerify(token, bridgeKP.publicKey)).toBe(true);
	});

	it('returns false when a proof lacks DLEQ', () => {
		const { proof } = createMockProofWithoutDLEQ(bridgeKP.publicKey, mockMint);
		const token = encodeToken([proof]);
		expect(isEligibleForOfflineVerify(token, bridgeKP.publicKey)).toBe(false);
	});

	it('returns false for unconditional proofs', () => {
		const { proof } = createMockUnconditionalProof(mockMint);
		const token = encodeToken([proof]);
		expect(isEligibleForOfflineVerify(token, bridgeKP.publicKey)).toBe(false);
	});

	it('returns false for invalid token', () => {
		expect(isEligibleForOfflineVerify('bad-token', bridgeKP.publicKey)).toBe(false);
	});

	it('returns false for proof locked to wrong pubkey', () => {
		const { proof } = createMockProofWrongPubkey(mockMint);
		const token = encodeToken([proof]);
		expect(isEligibleForOfflineVerify(token, bridgeKP.publicKey)).toBe(false);
	});
});
