/**
 * Pending proof management for conditional proofs awaiting resolution.
 *
 * Handles proofs that require additional steps before settlement:
 * - PoS (Proof-of-Service): awaiting service hash submission
 * - Escrow: awaiting co-signature from trusted third party
 * - HTLC: awaiting preimage revelation
 *
 * Resolution logic is deferred to the integrator — this module provides
 * the in-memory store and callback interface. Actual PoS/escrow resolution
 * requires a custom mint, which is beyond the scope of this library.
 */

import { randomBytes } from 'node:crypto';
import { detectConditions } from './conditions.js';
import type { PendingProof } from './types.js';

/** Callback invoked when a pending proof is resolved */
export type OnResolveFn = (proof: PendingProof) => void | Promise<void>;

/**
 * Create a pending proof store.
 *
 * @param onResolve - Optional callback invoked when a proof is resolved
 */
export function createPendingProofStore(onResolve?: OnResolveFn) {
	const store = new Map<string, PendingProof>();

	/**
	 * Register a conditional proof for pending resolution.
	 *
	 * The proof must have a NUT-10 structured secret with a supported
	 * condition kind. Returns the pending proof ID, or null if the
	 * proof has no detectable conditions.
	 */
	function register(proof: {
		secret: string;
		C: string;
		amount: number;
		id: string;
	}): string | null {
		const conditions = detectConditions(proof);
		if (!conditions) return null;

		const id = randomBytes(16).toString('hex');
		const pending: PendingProof = {
			id,
			proof,
			conditionKind: conditions.kind,
			registeredAt: Date.now(),
			status: 'pending',
		};

		store.set(id, pending);
		return id;
	}

	/**
	 * Resolve a pending proof with the given resolution data.
	 *
	 * For PoS: the resolution is the service output hash.
	 * For Escrow: the resolution is the co-signature.
	 * For HTLC: the resolution is the preimage.
	 */
	async function resolve(id: string, resolution: string): Promise<boolean> {
		const pending = store.get(id);
		if (!pending || pending.status !== 'pending') return false;

		pending.status = 'resolved';
		pending.resolution = resolution;

		if (onResolve) {
			await onResolve(pending);
		}

		return true;
	}

	/**
	 * Mark a pending proof as expired.
	 */
	function expire(id: string): boolean {
		const pending = store.get(id);
		if (!pending || pending.status !== 'pending') return false;

		pending.status = 'expired';
		return true;
	}

	/**
	 * Get a pending proof by ID.
	 */
	function get(id: string): PendingProof | undefined {
		return store.get(id);
	}

	/**
	 * Get all pending proofs (status === 'pending').
	 */
	function getPending(): PendingProof[] {
		return [...store.values()].filter((p) => p.status === 'pending');
	}

	/**
	 * Get count of pending proofs.
	 */
	function pendingCount(): number {
		let count = 0;
		for (const p of store.values()) {
			if (p.status === 'pending') count++;
		}
		return count;
	}

	/**
	 * Clear all proofs. For testing.
	 */
	function clear(): void {
		store.clear();
	}

	return { register, resolve, expire, get, getPending, pendingCount, clear };
}
