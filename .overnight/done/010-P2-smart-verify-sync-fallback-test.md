---
id: 10
title: "Add test for verifyCashuPaymentSmart sync fallback path (non-P2PK proofs)"
priority: P2
severity: low
status: completed
source: feature_audit
file: src/__tests__/cashu-paywall.test.ts
line: 0
created: "2026-02-28T00:00:00Z"
execution_hint: parallel
context_group: test_coverage
group_reason: "Test-only change to cashu-paywall.test.ts; independent, same group as tasks 008 and 009"
---

# Add test for verifyCashuPaymentSmart sync fallback path (non-P2PK proofs)

**Priority:** P2 (low)
**Source:** feature_audit
**Location:** src/__tests__/cashu-paywall.test.ts, src/cashu-paywall.ts:348-364

## Problem

`verifyCashuPaymentSmart` has two execution paths:

1. **Offline path**: If `bridgeConfig` is provided AND `isEligibleForOfflineVerify()` returns true (token has P2PK locks), run DLEQ offline verification. Does NOT fall back on DLEQ failure.

2. **Sync fallback path**: If `bridgeConfig` is absent OR `isEligibleForOfflineVerify()` returns false (no P2PK locks), fall back to `verifyCashuPayment()` (sync, mint contact).

```typescript
// src/cashu-paywall.ts:353-364:
if (bridgeConfig && isEligibleForOfflineVerify(token, bridgeConfig.bridgePubkey)) {
  const result = verifyCashuPaymentOffline(token, config, bridgeConfig);
  if (result.paid) return result;
  return result; // No fallback for P2PK proofs — DLEQ failure = something wrong
}

// Fall back to synchronous verification
const syncResult = await verifyCashuPayment(token, config);
return { ...syncResult, method: 'online' };
```

**Path 2 (sync fallback for non-P2PK proofs) has no test.** This means:
- If `isEligibleForOfflineVerify` incorrectly categorizes proofs, it's undetected
- The `method: 'online'` spread in the sync fallback return is untested
- Regression risk: a change to `isEligibleForOfflineVerify` logic could silently route P2PK proofs to sync path

## How to Fix

Add test cases to `src/__tests__/cashu-paywall.test.ts` for `verifyCashuPaymentSmart`:

```typescript
describe('verifyCashuPaymentSmart — sync fallback', () => {
  it('uses sync path when no bridgeConfig provided', async () => {
    // Call verifyCashuPaymentSmart without bridgeConfig
    // Verify result.method === 'online'
    // Verify verifyCashuPayment was called (mock it)
  });

  it('uses sync path when token has no P2PK locks (not eligible for offline)', async () => {
    // Create a plain token without P2PK structured secrets
    // Call verifyCashuPaymentSmart with bridgeConfig
    // isEligibleForOfflineVerify returns false → sync path
    // Verify result.method === 'online'
  });

  it('sets method: online on sync result', async () => {
    // Verify the { ...syncResult, method: 'online' } spread works correctly
  });
});
```

Use `vi.mock` for `verifyCashuPayment` (the sync path) to avoid real mint contact in tests.

## Acceptance Criteria

- [ ] At least 2 new test cases for `verifyCashuPaymentSmart` sync fallback path
- [ ] Tests verify `result.method === 'online'` for the sync path
- [ ] Tests confirm sync path is taken when `bridgeConfig` is absent
- [ ] Tests confirm sync path is taken when proofs are not eligible for offline verify
- [ ] All 177 existing tests still pass

## Notes

_Generated from feature_audit — "verifyCashuPaymentSmart() smart routing fallback path (offline fails → falls back to sync) is not explicitly tested." Note: the P2PK-locked path does NOT fall back on DLEQ failure (by design — see comment in code). Only the non-P2PK-locked path falls back to sync._
