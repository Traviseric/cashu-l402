import { describe, expect, it, vi } from 'vitest';
import { createSettlementQueue } from '../settlement-queue.js';
import type { SettlementEntry } from '../types.js';

describe('settlement-queue', () => {
	describe('enqueue', () => {
		it('adds an entry and returns an ID', async () => {
			const queue = createSettlementQueue();
			const id = await queue.enqueue({
				token: 'cashuA...',
				amountSats: 100,
				mintUrl: 'https://mint.test',
			});
			expect(id).toHaveLength(32); // 16 bytes hex
			expect(queue.pendingCount()).toBe(1);
		});

		it('generates unique IDs', async () => {
			const queue = createSettlementQueue();
			const id1 = await queue.enqueue({ token: 'a', amountSats: 1, mintUrl: 'https://m' });
			const id2 = await queue.enqueue({ token: 'b', amountSats: 2, mintUrl: 'https://m' });
			expect(id1).not.toBe(id2);
		});

		it('calls onPersist hook', async () => {
			const onPersist = vi.fn();
			const queue = createSettlementQueue({ onPersist });
			await queue.enqueue({ token: 'a', amountSats: 1, mintUrl: 'https://m' });
			expect(onPersist).toHaveBeenCalledOnce();
			expect(onPersist.mock.calls[0][0]).toMatchObject({
				token: 'a',
				amountSats: 1,
				status: 'pending',
			});
		});
	});

	describe('pendingCount', () => {
		it('returns 0 for empty queue', () => {
			const queue = createSettlementQueue();
			expect(queue.pendingCount()).toBe(0);
		});

		it('counts only pending entries', async () => {
			const queue = createSettlementQueue();
			await queue.enqueue({ token: 'a', amountSats: 1, mintUrl: 'https://m' });
			await queue.enqueue({ token: 'b', amountSats: 2, mintUrl: 'https://m' });
			expect(queue.pendingCount()).toBe(2);

			// Settle one
			await queue.flush(async () => {
				/* no-op = success */
			});
			expect(queue.pendingCount()).toBe(0);
		});
	});

	describe('flush', () => {
		it('settles all pending entries', async () => {
			const queue = createSettlementQueue();
			await queue.enqueue({ token: 'a', amountSats: 10, mintUrl: 'https://m' });
			await queue.enqueue({ token: 'b', amountSats: 20, mintUrl: 'https://m' });

			const result = await queue.flush(async () => {});
			expect(result.settled).toBe(2);
			expect(result.failed).toBe(0);
			expect(result.errors).toHaveLength(0);
		});

		it('marks failed entries with error', async () => {
			const queue = createSettlementQueue();
			await queue.enqueue({ token: 'a', amountSats: 10, mintUrl: 'https://m' });

			const result = await queue.flush(async () => {
				throw new Error('Mint unreachable');
			});

			expect(result.settled).toBe(0);
			expect(result.failed).toBe(1);
			expect(result.errors[0].error).toBe('Mint unreachable');
		});

		it('handles partial failures', async () => {
			const queue = createSettlementQueue();
			const id1 = await queue.enqueue({ token: 'good', amountSats: 10, mintUrl: 'https://m' });
			const id2 = await queue.enqueue({ token: 'bad', amountSats: 20, mintUrl: 'https://m' });

			let callIndex = 0;
			const result = await queue.flush(async (entry) => {
				callIndex++;
				if (entry.token === 'bad') throw new Error('Bad token');
			});

			expect(result.settled).toBe(1);
			expect(result.failed).toBe(1);
			expect(queue.pendingCount()).toBe(0); // Both resolved (one settled, one failed)
		});

		it('calls onResolve hook for each entry', async () => {
			const onResolve = vi.fn();
			const queue = createSettlementQueue({ onResolve });
			await queue.enqueue({ token: 'a', amountSats: 10, mintUrl: 'https://m' });

			await queue.flush(async () => {});
			expect(onResolve).toHaveBeenCalledOnce();
			expect(onResolve.mock.calls[0][0]).toMatchObject({ status: 'settled' });
		});

		it('calls onResolve for failures too', async () => {
			const onResolve = vi.fn();
			const queue = createSettlementQueue({ onResolve });
			await queue.enqueue({ token: 'a', amountSats: 10, mintUrl: 'https://m' });

			await queue.flush(async () => {
				throw new Error('fail');
			});
			expect(onResolve).toHaveBeenCalledOnce();
			expect(onResolve.mock.calls[0][0]).toMatchObject({ status: 'failed' });
		});

		it('skips already-settled entries', async () => {
			const queue = createSettlementQueue();
			await queue.enqueue({ token: 'a', amountSats: 10, mintUrl: 'https://m' });

			// First flush settles it
			await queue.flush(async () => {});
			expect(queue.pendingCount()).toBe(0);

			// Second flush has nothing to do
			const settle = vi.fn();
			const result = await queue.flush(settle);
			expect(result.settled).toBe(0);
			expect(settle).not.toHaveBeenCalled();
		});

		it('prevents concurrent flushes', async () => {
			const queue = createSettlementQueue();
			await queue.enqueue({ token: 'a', amountSats: 10, mintUrl: 'https://m' });

			// Start two flushes at once
			const slow = queue.flush(async () => {
				await new Promise((r) => setTimeout(r, 50));
			});
			const fast = queue.flush(async () => {});

			const [slowResult, fastResult] = await Promise.all([slow, fast]);
			expect(slowResult.settled).toBe(1);
			expect(fastResult.errors[0].error).toBe('Flush already in progress');
		});
	});

	describe('getEntry', () => {
		it('returns entry by ID', async () => {
			const queue = createSettlementQueue();
			const id = await queue.enqueue({ token: 'a', amountSats: 10, mintUrl: 'https://m' });
			const entry = queue.getEntry(id);
			expect(entry).toBeDefined();
			expect(entry!.token).toBe('a');
			expect(entry!.status).toBe('pending');
		});

		it('returns undefined for unknown ID', () => {
			const queue = createSettlementQueue();
			expect(queue.getEntry('nonexistent')).toBeUndefined();
		});
	});

	describe('clear', () => {
		it('removes all entries', async () => {
			const queue = createSettlementQueue();
			await queue.enqueue({ token: 'a', amountSats: 10, mintUrl: 'https://m' });
			await queue.enqueue({ token: 'b', amountSats: 20, mintUrl: 'https://m' });
			expect(queue.pendingCount()).toBe(2);

			queue.clear();
			expect(queue.pendingCount()).toBe(0);
			expect(queue.getEntries()).toHaveLength(0);
		});
	});
});
