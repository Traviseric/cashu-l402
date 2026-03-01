/**
 * TokenRegistry — tracks spent Cashu tokens to prevent replay attacks.
 *
 * The Cashu mint itself enforces double-spend at the proof level via
 * wallet.receive(), but a local registry gives an extra layer of protection
 * and allows fast rejection without a network round-trip.
 *
 * Entries expire automatically after `ttlMs` (default 24 hours) so memory
 * does not grow unbounded.
 */
export class TokenRegistry {
  private readonly spentTokens = new Map<string, number>(); // key -> expiry (unix ms)
  private readonly ttlMs: number;

  constructor(ttlMs = 24 * 60 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  /** Returns true if the token has been marked as spent and the record has not yet expired. */
  isSpent(tokenKey: string): boolean {
    this.cleanup();
    return this.spentTokens.has(tokenKey);
  }

  /** Record a token as spent. Subsequent isSpent() calls will return true until TTL elapses. */
  markSpent(tokenKey: string): void {
    this.spentTokens.set(tokenKey, Date.now() + this.ttlMs);
  }

  /** Number of unexpired spent-token entries currently tracked. */
  get size(): number {
    this.cleanup();
    return this.spentTokens.size;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, expiry] of this.spentTokens) {
      if (now > expiry) {
        this.spentTokens.delete(key);
      }
    }
  }
}
