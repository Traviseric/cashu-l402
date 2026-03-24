---
id: 4
title: "Implement caveat semantic verification (expiry, service, payment_method checks)"
priority: P1
severity: high
status: completed
source: gap_analyzer
file: src/l402-server.ts
line: 36
created: "2026-02-28T00:00:00Z"
execution_hint: sequential
context_group: settlement_wiring
group_reason: "Touches l402-server.ts and types.ts; verification logic closely related to task 001 (smart verify flow)"
---

# Implement caveat semantic verification (expiry, service, payment_method checks)

**Priority:** P1 (high)
**Source:** gap_analyzer
**Location:** src/l402-server.ts:36-52, src/types.ts

## Problem

`verifyMacaroon` only checks the HMAC **signature** — it does NOT verify the semantic content of caveats:

```typescript
// src/l402-server.ts:36-52 — current implementation:
export function verifyMacaroon(token: string, rootKey: string): MacaroonPayload | null {
  // ... decodes + checks HMAC ...
  return JSON.parse(decoded.payload) as MacaroonPayload;
  // Caveats are returned but NEVER checked
}
```

And `verifyL402Payment` uses `verifyMacaroon` but similarly ignores caveat semantics:
- No `expires_at` check → expired tokens are accepted
- No `service=` check → tokens for `/api/basic` are accepted for `/api/premium`
- No `payment_method=` check → any issued macaroon is accepted regardless of payment method

This means:
1. Expired bridge L402 macaroons (with `expires_at=<past_timestamp>`) are accepted indefinitely
2. A token issued for one service can be used for another
3. There is no programmatic way for integrators to enforce access policies

The `createBridgeL402` function correctly adds `expires_at` and `service=` caveats, but `verifyMacaroon` never enforces them.

## How to Fix

### Step 1 — Add `verifyCaveats()` utility to `src/l402-server.ts`

```typescript
/**
 * Verify caveat semantics for a parsed macaroon payload.
 * Checks expires_at (time), service (resource match), and any custom caveats.
 *
 * @param payload - Parsed MacaroonPayload (from verifyMacaroon)
 * @param expectedService - Optional: require service= caveat to match this value
 * @returns { valid: boolean; error?: string }
 */
export function verifyCaveats(
  payload: MacaroonPayload,
  expectedService?: string,
): { valid: boolean; error?: string } {
  const now = Math.floor(Date.now() / 1000);

  for (const caveat of payload.caveats) {
    const [key, ...rest] = caveat.split('=');
    const value = rest.join('=');

    if (key === 'expires_at') {
      const expiresAt = parseInt(value, 10);
      if (isNaN(expiresAt) || now > expiresAt) {
        return { valid: false, error: `Token expired at ${value}` };
      }
    }

    if (key === 'service' && expectedService !== undefined) {
      if (value !== expectedService) {
        return { valid: false, error: `Service mismatch: expected ${expectedService}, got ${value}` };
      }
    }
  }

  return { valid: true };
}
```

### Step 2 — Export `verifyCaveats` from `src/index.ts`

Add to barrel export so integrators can use it directly.

### Step 3 — Add caveat verification to `verifyL402Payment`

In `verifyL402Payment` (after checking preimage), call `verifyCaveats`:

```typescript
const payload = verifyMacaroon(params.macaroon, params.rootKey);
if (!payload) {
  return { success: false, type: 'l402', error: 'Invalid macaroon signature' };
}

// Check caveat semantics
const caveatCheck = verifyCaveats(payload, params.expectedService);
if (!caveatCheck.valid) {
  return { success: false, type: 'l402', error: caveatCheck.error };
}
```

Add optional `expectedService?: string` to `verifyL402Payment` params.

### Step 4 — Add tests

Add test cases in `l402-server.test.ts`:
- Expired token with `expires_at` in the past → rejected
- Valid token with future `expires_at` → accepted
- Token for wrong service → rejected when `expectedService` is checked
- Token without `expires_at` → accepted (backwards compatible)

## Acceptance Criteria

- [ ] `verifyCaveats(payload, expectedService?)` function added to `l402-server.ts`
- [ ] Expired `expires_at` caveat causes verification to fail
- [ ] `service=` mismatch causes verification to fail when `expectedService` provided
- [ ] `verifyL402Payment` accepts optional `expectedService` and calls `verifyCaveats`
- [ ] Backwards compatible — tokens without `expires_at` still pass
- [ ] `verifyCaveats` exported from `src/index.ts`
- [ ] Tests for all caveat check scenarios
- [ ] All 177 existing tests still pass

## Notes

_Generated from gap_analyzer — "verifyMacaroon checks signature but ignores caveat semantics (expiry, service match, budget)". The `expires_at` caveat is already produced by `createBridgeL402` but never enforced at verification time._
