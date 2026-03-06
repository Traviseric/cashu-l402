---
id: 9
title: "Add maximum size limit to TokenRegistry to prevent memory DoS"
priority: P1
severity: high
status: pending
source: security_audit
file: src/integration/token-registry.ts
line: 15
created: "2026-02-28T06:00:00"
execution_hint: sequential
context_group: integration_module
group_reason: "Touches src/integration/token-registry.ts — same integration module as tasks 8, 14"
---

# Add maximum size limit to TokenRegistry to prevent memory DoS

**Priority:** P1 (high)
**Source:** security_audit (CWE-400)
**Location:** src/integration/token-registry.ts:15

## Problem

The `TokenRegistry` stores spent token keys in an in-memory `Map` with no upper bound on size. The TTL cleanup runs on access (`isSpent`, `markSpent`, `size`), but an attacker can send a high volume of unique (invalid or forged) tokens to fill the registry with entries that persist for 24 hours (the default TTL). Each entry is a small string, but millions of entries add up rapidly, exhausting server memory and causing a Denial of Service.

**Code with issue:**
```typescript
private readonly spentTokens = new Map<string, number>(); // key -> expiry (unix ms)
private readonly ttlMs: number = 24 * 60 * 60 * 1000; // 24 hours
```

The TTL-based cleanup only removes *expired* entries. During the 24-hour window, unbounded new entries can accumulate.

## How to Fix

Add a `maxEntries` parameter and enforce it in `markSpent()`. When the limit is reached, reject new registrations with a `429 Too Many Requests`-friendly error, or evict the oldest entries using an LRU strategy:

```typescript
const DEFAULT_MAX_ENTRIES = 100_000;

export class TokenRegistry {
  private readonly spentTokens = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs = 24 * 60 * 60 * 1000, maxEntries = DEFAULT_MAX_ENTRIES) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  markSpent(tokenKey: string): void {
    this.cleanup();
    if (this.spentTokens.size >= this.maxEntries) {
      // Evict the oldest entry (Map preserves insertion order)
      const oldestKey = this.spentTokens.keys().next().value;
      if (oldestKey !== undefined) {
        this.spentTokens.delete(oldestKey);
      }
    }
    this.spentTokens.set(tokenKey, Date.now() + this.ttlMs);
  }

  // ... rest of class unchanged
}
```

Alternatively, throw a `RegistryFullError` in `markSpent()` and let the middleware return 429.

## Acceptance Criteria

- [ ] `TokenRegistry` has a configurable `maxEntries` limit (default 100,000)
- [ ] When the limit is reached, the oldest entry is evicted (LRU) before adding the new one
- [ ] Unit tests cover: normal use, boundary at maxEntries, eviction behavior
- [ ] All existing tests still pass
- [ ] `npm run build` compiles clean

## Notes

_Generated from security_audit finding (CWE-400 uncontrolled resource consumption)._
