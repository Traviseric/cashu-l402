---
id: 7
title: "Add optional onRateLimit callback hook to CashuPaywallConfig"
priority: P2
severity: medium
status: completed
source: feature_audit
file: src/types.ts
line: 0
created: "2026-02-28T00:00:00Z"
execution_hint: sequential
context_group: types_improvement
group_reason: "Touches src/types.ts and cashu-paywall.ts; same feature area as tasks 005 and 006"
---

# Add optional onRateLimit callback hook to CashuPaywallConfig

**Priority:** P2 (medium)
**Source:** feature_audit + gap_analyzer
**Location:** src/types.ts, src/cashu-paywall.ts

## Problem

The library provides no hook point for rate limiting. Integrators who want to prevent abuse (e.g., replay attempts, proof spam, DDoS via expensive DLEQ verification) must implement external middleware with no coordination with the library's internal proof processing.

The library should call an optional `onRateLimit` callback before beginning proof verification, allowing integrators to plug in token-bucket, sliding-window, or per-IP rate limiters.

```typescript
// Currently: no way to reject before verification starts
const result = await verifyCashuPaymentSmart(token, config, bridgeConfig);
// Attacker can spam with invalid proofs, triggering DLEQ verification cost
```

## How to Fix

### Step 1 — Add `RateLimitContext` and `RateLimitFn` to `src/types.ts`

```typescript
/** Context passed to the rate limit callback. */
export interface RateLimitContext {
  /** IP or identifier for the requester (integrator-provided, passed through). */
  requesterId?: string;
  /** Which verification path was about to be attempted. */
  verifyMethod: 'online' | 'offline' | 'smart';
  /** Token length hint (not decoded for performance). */
  tokenLength: number;
}

/**
 * Rate limit callback. Return `true` to allow the request, `false` to reject.
 * Called BEFORE proof verification begins — keeps expensive DLEQ off the hot path.
 */
export type RateLimitFn = (ctx: RateLimitContext) => boolean | Promise<boolean>;
```

### Step 2 — Add `onRateLimit` to `CashuPaywallConfig`

```typescript
export interface CashuPaywallConfig {
  mintUrl: string;
  priceSats: number;
  description?: string;
  onLog?: LogFn;
  onRateLimit?: RateLimitFn;  // ← add
}
```

### Step 3 — Call `onRateLimit` at the top of `verifyCashuPaymentSmart`

```typescript
export async function verifyCashuPaymentSmart(
  token: string,
  config: CashuPaywallConfig,
  bridgeConfig?: BridgeVerifyConfig,
  requesterId?: string,  // optional: passed through to rate limiter
): Promise<CashuPaymentResultV2> {
  // Rate limit check (before any expensive work)
  if (config.onRateLimit) {
    const allowed = await config.onRateLimit({
      requesterId,
      verifyMethod: bridgeConfig ? 'smart' : 'online',
      tokenLength: token.length,
    });
    if (!allowed) {
      return {
        paid: false, amountSats: 0, proofs: [], method: 'online',
        error: 'Rate limit exceeded', code: CashuL402ErrorCode.RATE_LIMIT_EXCEEDED,
      };
    }
  }
  // ... rest of function
}
```

Note: Also add `RATE_LIMIT_EXCEEDED` to `CashuL402ErrorCode` if task 005 was completed first. If not, add it inline.

### Step 4 — Add a test

Verify `onRateLimit` returning `false` causes the function to return early with `paid: false` and `error: 'Rate limit exceeded'`.

## Acceptance Criteria

- [ ] `RateLimitContext` and `RateLimitFn` types added to `src/types.ts`
- [ ] `onRateLimit?: RateLimitFn` added to `CashuPaywallConfig`
- [ ] `verifyCashuPaymentSmart` calls `onRateLimit` before any proof decoding/verification
- [ ] Rate-limited result has `paid: false` and meaningful error
- [ ] `onRateLimit` returning `true` (or not being provided) allows request to proceed normally
- [ ] Test: rate limiter returning `false` → function returns early
- [ ] All 177 existing tests still pass

## Notes

_Generated from feature_audit — "No rate limiting hooks. The library provides no limiter callback interface for integrators to plug in token-bucket or sliding-window rate limiters."_
