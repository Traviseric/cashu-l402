import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPendingProofStore } from '../pending-proofs.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConditionalProof(kind = 'P2PK', extra: string[][] = []) {
	return {
		secret: JSON.stringify([
			kind,
			{
				nonce: 'testnonce',
				data: '02abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
				tags: extra,
			},
		]),
		C: '02point',
		amount: 10,
		id: 'keyset_001',
	};
}

function makeUnconditionalProof() {
	return { secret: 'plain-secret', C: '02point', amount: 10, id: 'keyset_001' };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createPendingProofStore', () => {
	let store: ReturnType<typeof createPendingProofStore>;

	beforeEach(() => {
		store = createPendingProofStore();
	});

	// -----------------------------------------------------------------------
	describe('register', () => {
		it('returns a non-null id for a conditional proof', () => {
			const id = store.register(makeConditionalProof());
			expect(id).not.toBeNull();
			expect(typeof id).toBe('string');
			expect(id!.length).toBeGreaterThan(0);
		});

		it('returns null for an unconditional (plain-secret) proof', () => {
			const id = store.register(makeUnconditionalProof());
			expect(id).toBeNull();
		});

		it('sets initial status to pending', () => {
			const id = store.register(makeConditionalProof())!;
			const entry = store.get(id);
			expect(entry?.status).toBe('pending');
		});

		it('stores the correct conditionKind', () => {
			const id = store.register(makeConditionalProof('P2PK'))!;
			expect(store.get(id)?.conditionKind).toBe('P2PK');
		});

		it('stores HTLC kind correctly', () => {
			const id = store.register(makeConditionalProof('HTLC'))!;
			expect(store.get(id)?.conditionKind).toBe('HTLC');
		});

		it('stores PoS kind correctly', () => {
			const id = store.register(makeConditionalProof('PoS'))!;
			expect(store.get(id)?.conditionKind).toBe('PoS');
		});

		it('preserves the proof data', () => {
			const proof = makeConditionalProof();
			const id = store.register(proof)!;
			const entry = store.get(id);
			expect(entry?.proof).toEqual(proof);
		});

		it('sets registeredAt to a recent timestamp', () => {
			const before = Date.now();
			const id = store.register(makeConditionalProof())!;
			const after = Date.now();
			const entry = store.get(id);
			expect(entry?.registeredAt).toBeGreaterThanOrEqual(before);
			expect(entry?.registeredAt).toBeLessThanOrEqual(after);
		});

		it('generates unique ids for separate registrations', () => {
			const id1 = store.register(makeConditionalProof())!;
			const id2 = store.register(makeConditionalProof())!;
			expect(id1).not.toBe(id2);
		});
	});

	// -----------------------------------------------------------------------
	describe('resolve', () => {
		it('returns true and sets status to resolved', async () => {
			const id = store.register(makeConditionalProof())!;
			const ok = await store.resolve(id, 'preimage_hex');
			expect(ok).toBe(true);
			expect(store.get(id)?.status).toBe('resolved');
		});

		it('stores the resolution data', async () => {
			const id = store.register(makeConditionalProof())!;
			await store.resolve(id, 'my_resolution');
			expect(store.get(id)?.resolution).toBe('my_resolution');
		});

		it('returns false for unknown id', async () => {
			const ok = await store.resolve('nonexistent-id', 'data');
			expect(ok).toBe(false);
		});

		it('returns false if already resolved', async () => {
			const id = store.register(makeConditionalProof())!;
			await store.resolve(id, 'first');
			const second = await store.resolve(id, 'second');
			expect(second).toBe(false);
		});

		it('returns false if already expired', async () => {
			const id = store.register(makeConditionalProof())!;
			store.expire(id);
			const ok = await store.resolve(id, 'data');
			expect(ok).toBe(false);
		});
	});

	// -----------------------------------------------------------------------
	describe('expire', () => {
		it('returns true and sets status to expired', () => {
			const id = store.register(makeConditionalProof())!;
			const ok = store.expire(id);
			expect(ok).toBe(true);
			expect(store.get(id)?.status).toBe('expired');
		});

		it('returns false for unknown id', () => {
			expect(store.expire('nonexistent-id')).toBe(false);
		});

		it('returns false if already resolved', async () => {
			const id = store.register(makeConditionalProof())!;
			await store.resolve(id, 'data');
			expect(store.expire(id)).toBe(false);
		});

		it('returns false if already expired', () => {
			const id = store.register(makeConditionalProof())!;
			store.expire(id);
			expect(store.expire(id)).toBe(false);
		});
	});

	// -----------------------------------------------------------------------
	describe('get', () => {
		it('returns undefined for unknown id', () => {
			expect(store.get('no-such-id')).toBeUndefined();
		});

		it('returns the proof entry after register', () => {
			const id = store.register(makeConditionalProof())!;
			const entry = store.get(id);
			expect(entry).toBeDefined();
			expect(entry?.id).toBe(id);
		});

		it('still returns the entry after resolve (not removed)', async () => {
			const id = store.register(makeConditionalProof())!;
			await store.resolve(id, 'data');
			expect(store.get(id)).toBeDefined();
		});
	});

	// -----------------------------------------------------------------------
	describe('getPending', () => {
		it('returns empty array for fresh store', () => {
			expect(store.getPending()).toEqual([]);
		});

		it('returns only pending-status proofs', () => {
			store.register(makeConditionalProof());
			store.register(makeConditionalProof());
			expect(store.getPending()).toHaveLength(2);
		});

		it('excludes resolved proofs', async () => {
			const id = store.register(makeConditionalProof())!;
			store.register(makeConditionalProof()); // stays pending
			await store.resolve(id, 'data');
			expect(store.getPending()).toHaveLength(1);
		});

		it('excludes expired proofs', () => {
			const id = store.register(makeConditionalProof())!;
			store.register(makeConditionalProof()); // stays pending
			store.expire(id);
			expect(store.getPending()).toHaveLength(1);
		});
	});

	// -----------------------------------------------------------------------
	describe('pendingCount', () => {
		it('returns 0 for empty store', () => {
			expect(store.pendingCount()).toBe(0);
		});

		it('increments when proofs are registered', () => {
			store.register(makeConditionalProof());
			expect(store.pendingCount()).toBe(1);
			store.register(makeConditionalProof());
			expect(store.pendingCount()).toBe(2);
		});

		it('does not change for unconditional proofs (register returns null)', () => {
			store.register(makeUnconditionalProof());
			expect(store.pendingCount()).toBe(0);
		});

		it('decrements when a proof is resolved', async () => {
			const id = store.register(makeConditionalProof())!;
			expect(store.pendingCount()).toBe(1);
			await store.resolve(id, 'data');
			expect(store.pendingCount()).toBe(0);
		});

		it('decrements when a proof is expired', () => {
			const id = store.register(makeConditionalProof())!;
			store.expire(id);
			expect(store.pendingCount()).toBe(0);
		});
	});

	// -----------------------------------------------------------------------
	describe('clear', () => {
		it('removes all proofs', () => {
			store.register(makeConditionalProof());
			store.register(makeConditionalProof());
			store.clear();
			expect(store.getPending()).toEqual([]);
		});

		it('resets pendingCount to 0', () => {
			store.register(makeConditionalProof());
			store.register(makeConditionalProof());
			store.clear();
			expect(store.pendingCount()).toBe(0);
		});

		it('makes previously registered ids return undefined', () => {
			const id = store.register(makeConditionalProof())!;
			store.clear();
			expect(store.get(id)).toBeUndefined();
		});
	});

	// -----------------------------------------------------------------------
	describe('onResolve callback', () => {
		it('calls onResolve when a proof is resolved', async () => {
			const onResolve = vi.fn();
			const s = createPendingProofStore(onResolve);
			const id = s.register(makeConditionalProof())!;
			await s.resolve(id, 'resolution_data');
			expect(onResolve).toHaveBeenCalledOnce();
			expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({ id, status: 'resolved' }));
		});

		it('does not call onResolve when expire() is used', () => {
			const onResolve = vi.fn();
			const s = createPendingProofStore(onResolve);
			const id = s.register(makeConditionalProof())!;
			s.expire(id);
			expect(onResolve).not.toHaveBeenCalled();
		});

		it('does not call onResolve when resolve returns false (unknown id)', async () => {
			const onResolve = vi.fn();
			const s = createPendingProofStore(onResolve);
			await s.resolve('no-such-id', 'data');
			expect(onResolve).not.toHaveBeenCalled();
		});

		it('awaits async onResolve', async () => {
			const events: string[] = [];
			const onResolve = vi.fn(async () => {
				await Promise.resolve();
				events.push('resolved');
			});
			const s = createPendingProofStore(onResolve);
			const id = s.register(makeConditionalProof())!;
			await s.resolve(id, 'data');
			expect(events).toEqual(['resolved']);
		});
	});
});
