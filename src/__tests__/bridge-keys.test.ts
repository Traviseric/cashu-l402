import { describe, expect, it } from 'vitest';
import {
	createBridgeKeyPair,
	deriveBridgePublicKey,
	isValidPublicKey,
	loadBridgeKeyPair,
} from '../bridge-keys.js';

describe('bridge-keys', () => {
	describe('createBridgeKeyPair', () => {
		it('generates a valid keypair', () => {
			const kp = createBridgeKeyPair();
			expect(kp.privateKey).toHaveLength(64); // 32 bytes hex
			expect(kp.publicKey).toHaveLength(66); // 33 bytes compressed hex
			expect(kp.publicKey).toMatch(/^0[23]/); // compressed pubkey prefix
		});

		it('generates unique keypairs', () => {
			const kp1 = createBridgeKeyPair();
			const kp2 = createBridgeKeyPair();
			expect(kp1.privateKey).not.toBe(kp2.privateKey);
			expect(kp1.publicKey).not.toBe(kp2.publicKey);
		});

		it('public key is valid secp256k1 point', () => {
			const kp = createBridgeKeyPair();
			expect(isValidPublicKey(kp.publicKey)).toBe(true);
		});
	});

	describe('deriveBridgePublicKey', () => {
		it('derives matching public key from private key', () => {
			const kp = createBridgeKeyPair();
			const derived = deriveBridgePublicKey(kp.privateKey);
			expect(derived).toBe(kp.publicKey);
		});

		it('returns compressed format (33 bytes)', () => {
			const kp = createBridgeKeyPair();
			const derived = deriveBridgePublicKey(kp.privateKey);
			expect(derived).toHaveLength(66);
		});
	});

	describe('loadBridgeKeyPair', () => {
		it('loads keypair from existing private key', () => {
			const original = createBridgeKeyPair();
			const loaded = loadBridgeKeyPair(original.privateKey);
			expect(loaded.privateKey).toBe(original.privateKey);
			expect(loaded.publicKey).toBe(original.publicKey);
		});
	});

	describe('isValidPublicKey', () => {
		it('accepts valid compressed public key', () => {
			const kp = createBridgeKeyPair();
			expect(isValidPublicKey(kp.publicKey)).toBe(true);
		});

		it('rejects invalid hex', () => {
			expect(isValidPublicKey('not-hex')).toBe(false);
		});

		it('rejects empty string', () => {
			expect(isValidPublicKey('')).toBe(false);
		});

		it('rejects too-short hex', () => {
			expect(isValidPublicKey('02abcd')).toBe(false);
		});

		it('rejects point not on curve', () => {
			// Valid length but not a valid point
			expect(isValidPublicKey('02' + '00'.repeat(32))).toBe(false);
		});
	});
});
