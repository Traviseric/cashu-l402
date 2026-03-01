/**
 * Settlement queue for batch-settling P2PK-locked proofs with the mint.
 *
 * After offline verification, proofs are enqueued for later settlement.
 * The integrator calls flush() on their own schedule:
 *   - Express: setInterval
 *   - Serverless: per-Nth request
 *   - Worker: cron job
 *
 * Framework-agnostic — no timers, no auto-flush.
 */

import { randomBytes } from 'node:crypto';
import type {
	SettleFn,
	SettlementBatchResult,
	SettlementEntry,
	SettlementQueueConfig,
} from './types.js';

/**
 * Create a settlement queue instance.
 *
 * @param config - Optional hooks for persistence and resolution notification
 */
export function createSettlementQueue(config?: SettlementQueueConfig) {
	const entries = new Map<string, SettlementEntry>();
	let flushing = false;

	/**
	 * Enqueue a token for later settlement with the mint.
	 *
	 * @returns The settlement entry ID
	 */
	async function enqueue(params: {
		token: string;
		amountSats: number;
		mintUrl: string;
	}): Promise<string> {
		const id = randomBytes(16).toString('hex');
		const entry: SettlementEntry = {
			id,
			token: params.token,
			amountSats: params.amountSats,
			mintUrl: params.mintUrl,
			enqueuedAt: Date.now(),
			status: 'pending',
		};

		entries.set(id, entry);

		if (config?.onPersist) {
			await config.onPersist(entry);
		}

		return id;
	}

	/**
	 * Flush all pending entries by settling them with the mint.
	 *
	 * The integrator provides a settle function that handles the actual
	 * mint communication (e.g., wallet.receive() or mint.melt()).
	 *
	 * Entries that fail are marked as 'failed' with an error message.
	 * Already-settled or failed entries are skipped.
	 */
	async function flush(settle: SettleFn): Promise<SettlementBatchResult> {
		if (flushing) {
			return { settled: 0, failed: 0, errors: [{ id: 'flush', error: 'Flush already in progress' }] };
		}

		flushing = true;
		let settled = 0;
		let failed = 0;
		const errors: Array<{ id: string; error: string }> = [];

		try {
			const pending = [...entries.values()].filter((e) => e.status === 'pending');

			for (const entry of pending) {
				try {
					await settle(entry);
					entry.status = 'settled';
					settled++;

					if (config?.onResolve) {
						await config.onResolve(entry);
					}
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					entry.status = 'failed';
					entry.error = message;
					failed++;
					errors.push({ id: entry.id, error: message });

					if (config?.onResolve) {
						await config.onResolve(entry);
					}
				}
			}
		} finally {
			flushing = false;
		}

		return { settled, failed, errors };
	}

	/**
	 * Get the count of pending (unsettled) entries.
	 */
	function pendingCount(): number {
		let count = 0;
		for (const entry of entries.values()) {
			if (entry.status === 'pending') count++;
		}
		return count;
	}

	/**
	 * Get all entries (for inspection/debugging).
	 */
	function getEntries(): SettlementEntry[] {
		return [...entries.values()];
	}

	/**
	 * Get a specific entry by ID.
	 */
	function getEntry(id: string): SettlementEntry | undefined {
		return entries.get(id);
	}

	/**
	 * Clear all entries. For testing.
	 */
	function clear(): void {
		entries.clear();
	}

	return { enqueue, flush, pendingCount, getEntries, getEntry, clear };
}
