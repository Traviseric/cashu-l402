/**
 * Bridge keypair management for P2PK proof locking.
 *
 * Uses secp256k1 from @noble/curves — the same curve used by Cashu NUT-11 P2PK.
 * Bridge advertises its public key; agents lock proofs to it before sending.
 */

import { randomBytes } from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1';
import type { BridgeKeyPair } from './types.js';

/**
 * Generate a new secp256k1 keypair for the bridge.
 *
 * The public key is compressed (33 bytes, hex-encoded).
 * Store the private key securely — it's needed for settlement.
 */
export function createBridgeKeyPair(): BridgeKeyPair {
	const privBytes = randomBytes(32);
	const privateKey = Buffer.from(privBytes).toString('hex');
	const pubBytes = secp256k1.getPublicKey(privBytes, true);
	const publicKey = Buffer.from(pubBytes).toString('hex');
	return { privateKey, publicKey };
}

/**
 * Derive the compressed public key from a hex-encoded private key.
 */
export function deriveBridgePublicKey(privateKeyHex: string): string {
	const privBytes = Buffer.from(privateKeyHex, 'hex');
	const pubBytes = secp256k1.getPublicKey(privBytes, true);
	return Buffer.from(pubBytes).toString('hex');
}

/**
 * Load a bridge keypair from an existing hex-encoded private key.
 */
export function loadBridgeKeyPair(privateKeyHex: string): BridgeKeyPair {
	return {
		privateKey: privateKeyHex,
		publicKey: deriveBridgePublicKey(privateKeyHex),
	};
}

/**
 * Validate that a hex string is a valid secp256k1 public key.
 *
 * Accepts both compressed (33 bytes) and uncompressed (65 bytes) formats.
 */
export function isValidPublicKey(hex: string): boolean {
	try {
		secp256k1.ProjectivePoint.fromHex(hex);
		return true;
	} catch {
		return false;
	}
}
