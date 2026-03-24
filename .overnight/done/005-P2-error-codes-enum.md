---
id: 5
title: "Add ErrorCode enum to src/types.ts for 402 flow errors"
priority: P2
severity: medium
status: completed
source: feature_audit
file: src/types.ts
line: 0
created: "2026-02-28T00:00:00Z"
execution_hint: sequential
context_group: types_improvement
group_reason: "Touches src/types.ts; related to caveat verification task 004 which also adds new types"
---

# Add ErrorCode enum to src/types.ts for 402 flow errors

**Priority:** P2 (medium)
**Source:** feature_audit + gap_analyzer
**Location:** src/types.ts, src/cashu-paywall.ts, src/l402-server.ts

## Problem

All error returns in the library use plain string messages:

```typescript
// Examples from cashu-paywall.ts:
return { paid: false, ..., error: 'Empty token' };
return { paid: false, ..., error: `Unexpected mint: ${mintUrl}` };
return { paid: false, ..., error: 'Proof locktime has expired' };
return { paid: false, ..., error: 'Offline verification failed' };

// Examples from l402-server.ts:
return { success: false, type: 'l402', error: 'Invalid macaroon signature' };
return { success: false, type: 'l402', error: 'Unknown or expired challenge' };
```

This makes it impossible for integrators to programmatically distinguish error types (e.g., to return a 401 vs 422 vs 500 HTTP response, or to implement retry logic). Integrators must do fragile string matching on error messages.

## How to Fix

### Step 1 — Add `CashuL402ErrorCode` const enum to `src/types.ts`

```typescript
/** Standardized error codes for Cashu-L402 payment flows. */
export const CashuL402ErrorCode = {
  // Token/proof errors
  EMPTY_TOKEN: 'EMPTY_TOKEN',
  INSUFFICIENT_AMOUNT: 'INSUFFICIENT_AMOUNT',
  WRONG_MINT: 'WRONG_MINT',
  PROOF_ALREADY_SPENT: 'PROOF_ALREADY_SPENT',

  // Offline verification errors
  P2PK_LOCK_INVALID: 'P2PK_LOCK_INVALID',
  DLEQ_PROOF_INVALID: 'DLEQ_PROOF_INVALID',
  LOCKTIME_EXPIRED: 'LOCKTIME_EXPIRED',
  OFFLINE_VERIFY_FAILED: 'OFFLINE_VERIFY_FAILED',

  // Macaroon / L402 errors
  INVALID_MACAROON: 'INVALID_MACAROON',
  MACAROON_EXPIRED: 'MACAROON_EXPIRED',
  SERVICE_MISMATCH: 'SERVICE_MISMATCH',
  CHALLENGE_NOT_FOUND: 'CHALLENGE_NOT_FOUND',
  CHALLENGE_EXPIRED: 'CHALLENGE_EXPIRED',
  PREIMAGE_INVALID: 'PREIMAGE_INVALID',
} as const;

export type CashuL402ErrorCode = typeof CashuL402ErrorCode[keyof typeof CashuL402ErrorCode];
```

### Step 2 — Add `code` field to result types

In `CashuPaymentResult` and `PaymentResult` interfaces, add optional `code`:

```typescript
export interface CashuPaymentResult {
  paid: boolean;
  amountSats: number;
  proofs: Proof[];
  error?: string;         // human-readable message (keep for backwards compat)
  code?: CashuL402ErrorCode;  // ← add machine-readable code
}
```

### Step 3 — Populate `code` in error returns

Update the error return statements in `cashu-paywall.ts` and `l402-server.ts` to include the code:

```typescript
// cashu-paywall.ts:
return { paid: false, amountSats: 0, proofs: [], method: 'offline',
  error: 'Empty token', code: CashuL402ErrorCode.EMPTY_TOKEN };

// l402-server.ts:
return { success: false, type: 'l402', error: 'Invalid macaroon signature',
  code: CashuL402ErrorCode.INVALID_MACAROON };
```

### Step 4 — Export from index

Add `CashuL402ErrorCode` to `src/index.ts` barrel export.

## Acceptance Criteria

- [ ] `CashuL402ErrorCode` const object with at least 10 distinct error codes added to `src/types.ts`
- [ ] `CashuPaymentResult` and `PaymentResult` interfaces have optional `code?: CashuL402ErrorCode`
- [ ] Key error paths in `cashu-paywall.ts` and `l402-server.ts` populate `code`
- [ ] `CashuL402ErrorCode` exported from `src/index.ts`
- [ ] All 177 existing tests still pass (adding `code` is additive/optional)

## Notes

_Generated from feature_audit — "No standardized error codes enum. Errors are thrown as plain Error objects with string messages, making it hard for integrators to distinguish error types programmatically."_
