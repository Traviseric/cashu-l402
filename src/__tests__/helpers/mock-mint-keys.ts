/**
 * Mock mint key generation and proof creation for tests.
 *
 * Creates valid BDHKE proofs with DLEQ using cashu-ts crypto sub-paths.
 * No real mint needed — we simulate the mint's signing operations.
 *
 * Flow:
 * 1. Generate mock mint keypair
 * 2. Client blinds secret (P2PK-formatted via NUT-10/11)
 * 3. Mint signs blinded message, creates DLEQ proof
 * 4. Client unblinds to get final proof
 * 5. Serialize to wallet-level types with serialized DLEQ
 */

import { randomBytes } from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1';
import { createRandomPrivateKey, pointFromHex } from '@cashu/cashu-ts/crypto/common';
import { blindMessage, constructProofFromPromise, serializeProof, unblindSignature } from '@cashu/cashu-ts/crypto/client';
import { createBlindSignature, getPubKeyFromPrivKey } from '@cashu/cashu-ts/crypto/mint';
import { createDLEQProof } from '@cashu/cashu-ts/crypto/mint/NUT12';
import { createP2PKsecret } from '@cashu/cashu-ts/crypto/client/NUT11';
import type { MintKeyset } from '../../types.js';

// Re-export Proof type from cashu-ts for convenience
export type { Proof } from '@cashu/cashu-ts';

/** Result of creating a mock mint keyset */
export interface MockMintKeyset {
	/** Keyset in the format needed by our OfflineVerifyConfig */
	keyset: MintKeyset;
	/** Mint private key (for creating more proofs) */
	mintPrivKey: Uint8Array;
	/** Mint public key hex */
	mintPubKeyHex: string;
}

/** Result of creating a mock proof */
export interface MockProofResult {
	/** Serialized proof with all fields as strings */
	proof: {
		id: string;
		amount: number;
		secret: string;
		C: string;
		dleq?: { s: string; e: string; r?: string };
	};
	/** The P2PK secret string */
	secret: string;
}

/**
 * Create a mock mint keyset with a single denomination.
 *
 * Generates a random mint keypair and builds a keyset with the specified
 * amount denomination. The keyset ID is deterministic from the keyset.
 */
export function createMockMintKeyset(amount = 1): MockMintKeyset {
	const mintPrivKey = createRandomPrivateKey();
	const mintPubKey = getPubKeyFromPrivKey(mintPrivKey);
	const mintPubKeyHex = Buffer.from(mintPubKey).toString('hex');

	// Use a simple keyset ID (in production, derived from keys via NUT-02)
	const keysetId = `00${randomBytes(6).toString('hex')}`;

	const keyset: MintKeyset = {
		id: keysetId,
		unit: 'sat',
		keys: { [amount]: mintPubKeyHex },
	};

	return { keyset, mintPrivKey, mintPubKeyHex };
}

/**
 * Create a mock mint keyset with multiple denominations (powers of 2).
 */
export function createMockMintKeysetMultiDenom(amounts: number[]): MockMintKeyset {
	const mintPrivKey = createRandomPrivateKey();
	const mintPubKey = getPubKeyFromPrivKey(mintPrivKey);
	const mintPubKeyHex = Buffer.from(mintPubKey).toString('hex');

	const keysetId = `00${randomBytes(6).toString('hex')}`;

	// For simplicity, all amounts use the same key (real mints derive per-amount keys)
	const keys: Record<number, string> = {};
	for (const amount of amounts) {
		keys[amount] = mintPubKeyHex;
	}

	const keyset: MintKeyset = { id: keysetId, unit: 'sat', keys };
	return { keyset, mintPrivKey, mintPubKeyHex };
}

/**
 * Build a P2PK NUT-10 secret with optional extra tags (e.g. locktime).
 */
function buildP2PKSecret(bridgePubkeyHex: string, extraTags?: string[][]): string {
	const baseSecret = createP2PKsecret(bridgePubkeyHex);
	if (!extraTags || extraTags.length === 0) return baseSecret;

	// Parse and add tags
	const parsed = JSON.parse(baseSecret);
	parsed[1].tags = [...(parsed[1].tags || []), ...extraTags];
	return JSON.stringify(parsed);
}

/**
 * Create a valid P2PK-locked proof with DLEQ.
 *
 * The proof is locked to the specified bridge pubkey and has a valid
 * DLEQ proof from the mock mint. Suitable for offline verification tests.
 *
 * @param bridgePubkeyHex - Bridge's compressed public key (hex)
 * @param mockMint - Mock mint keyset
 * @param amount - Proof amount (default: 1)
 * @param extraTags - Optional NUT-10 tags (e.g. [["locktime", "1709337600"]])
 */
export function createMockP2PKProofWithDLEQ(
	bridgePubkeyHex: string,
	mockMint: MockMintKeyset,
	amount = 1,
	extraTags?: string[][],
): MockProofResult {
	// Create NUT-10/11 P2PK secret locked to bridge pubkey
	const p2pkSecret = buildP2PKSecret(bridgePubkeyHex, extraTags);
	const secretBytes = new TextEncoder().encode(p2pkSecret);

	// Blind the secret
	const { B_, r } = blindMessage(secretBytes);

	// Mint signs the blinded message
	const blindSig = createBlindSignature(B_, mockMint.mintPrivKey, amount, mockMint.keyset.id);

	// Mint creates DLEQ proof
	const dleq = createDLEQProof(B_, mockMint.mintPrivKey);

	// Unblind to get the final signature point
	const mintPoint = pointFromHex(mockMint.mintPubKeyHex);
	const rawProof = constructProofFromPromise(blindSig, r, secretBytes, mintPoint);
	const serialized = serializeProof(rawProof);

	// Serialize DLEQ with blinding factor r (needed for reblind verification)
	const proof = {
		...serialized,
		dleq: {
			s: Buffer.from(dleq.s).toString('hex'),
			e: Buffer.from(dleq.e).toString('hex'),
			r: r.toString(16).padStart(64, '0'),
		},
	};

	return { proof, secret: p2pkSecret };
}

/**
 * Create a P2PK-locked proof WITHOUT DLEQ.
 *
 * Has a valid P2PK lock but no DLEQ proof. Used to test the fallback
 * to synchronous verification when DLEQ is missing.
 */
export function createMockProofWithoutDLEQ(
	bridgePubkeyHex: string,
	mockMint: MockMintKeyset,
	amount = 1,
): MockProofResult {
	const p2pkSecret = createP2PKsecret(bridgePubkeyHex);
	const secretBytes = new TextEncoder().encode(p2pkSecret);

	const { B_, r } = blindMessage(secretBytes);
	const blindSig = createBlindSignature(B_, mockMint.mintPrivKey, amount, mockMint.keyset.id);

	const mintPoint = pointFromHex(mockMint.mintPubKeyHex);
	const rawProof = constructProofFromPromise(blindSig, r, secretBytes, mintPoint);
	const serialized = serializeProof(rawProof);

	// No dleq field
	return { proof: serialized, secret: p2pkSecret };
}

/**
 * Create a proof locked to a DIFFERENT pubkey (not the bridge).
 *
 * Has valid DLEQ but wrong P2PK lock. Used to test rejection of
 * proofs not locked to the bridge.
 */
export function createMockProofWrongPubkey(
	mockMint: MockMintKeyset,
	amount = 1,
): MockProofResult {
	// Generate a random "wrong" pubkey
	const wrongPrivKey = randomBytes(32);
	const wrongPubKey = Buffer.from(secp256k1.getPublicKey(wrongPrivKey, true)).toString('hex');

	return createMockP2PKProofWithDLEQ(wrongPubKey, mockMint, amount);
}

/**
 * Create a proof with an unconditional secret (no P2PK lock).
 *
 * Used to test that non-P2PK proofs are rejected by offline verification
 * and fall back to the synchronous path.
 */
export function createMockUnconditionalProof(
	mockMint: MockMintKeyset,
	amount = 1,
): MockProofResult {
	// Random 32-byte secret (not NUT-10 formatted)
	const secretHex = randomBytes(32).toString('hex');
	const secretBytes = new TextEncoder().encode(secretHex);

	const { B_, r } = blindMessage(secretBytes);
	const blindSig = createBlindSignature(B_, mockMint.mintPrivKey, amount, mockMint.keyset.id);
	const dleq = createDLEQProof(B_, mockMint.mintPrivKey);

	const mintPoint = pointFromHex(mockMint.mintPubKeyHex);
	const rawProof = constructProofFromPromise(blindSig, r, secretBytes, mintPoint);
	const serialized = serializeProof(rawProof);

	const proof = {
		...serialized,
		dleq: {
			s: Buffer.from(dleq.s).toString('hex'),
			e: Buffer.from(dleq.e).toString('hex'),
			r: r.toString(16).padStart(64, '0'),
		},
	};

	return { proof, secret: secretHex };
}

/**
 * Create a proof with a tampered DLEQ (invalid signature).
 */
export function createMockProofTamperedDLEQ(
	bridgePubkeyHex: string,
	mockMint: MockMintKeyset,
	amount = 1,
): MockProofResult {
	const result = createMockP2PKProofWithDLEQ(bridgePubkeyHex, mockMint, amount);

	// Tamper with the DLEQ s value
	if (result.proof.dleq) {
		const tampered = randomBytes(32).toString('hex');
		result.proof.dleq = { ...result.proof.dleq, s: tampered };
	}

	return result;
}
