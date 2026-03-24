---
id: 1
title: "Wire settlement queue into verifyCashuPaymentOffline (populate settlementId)"
priority: P1
severity: high
status: completed
source: gap_analyzer
file: src/cashu-paywall.ts
line: 318
created: "2026-02-28T00:00:00Z"
execution_hint: sequential
context_group: settlement_wiring
group_reason: "Touches cashu-paywall.ts (core path) and types.ts; related to task 004 which also touches settlement flow"
---

# Wire settlement queue into verifyCashuPaymentOffline (populate settlementId)

**Priority:** P1 (high)
**Source:** gap_analyzer
**Location:** src/cashu-paywall.ts:318, src/types.ts, src/settlement-queue.ts

## Problem

`verifyCashuPaymentOffline` (and by extension `verifyCashuPaymentSmart`) successfully verifies proofs and issues a bridge L402 macaroon, but the `settlementId` field in `CashuPaymentResultV2` is **always `undefined`** — the settlement queue is never called.

The settlement queue module (`src/settlement-queue.ts`) exists and is fully implemented with `enqueue()`, `flush()`, and persistence hooks. However `cashu-paywall.ts` never imports it. The `settlementId` field was added to `CashuPaymentResultV2` in `src/types.ts` but is never populated:

```typescript
// src/types.ts — field exists but is never set:
export interface CashuPaymentResultV2 extends CashuPaymentResult {
  method: 'online' | 'offline';
  dleqVerified?: boolean;
  p2pkVerified?: boolean;
  settlementId?: string;   // ← always undefined
  bridgeL402?: string;
}

// src/cashu-paywall.ts line 318 — settlementId omitted from return:
return {
  paid: true,
  amountSats: totalAmount,
  proofs,
  method: 'offline',
  p2pkVerified: true,
  dleqVerified: true,
  bridgeL402: macaroon,
  // settlementId: ??? ← missing
};
```

This means integrators who rely on `result.settlementId` to track async settlement cannot use the returned value. The settlement queue and smart verification are completely decoupled.

## How to Fix

Add an optional `settlementQueue` reference to `BridgeVerifyConfig` in `src/types.ts`. After a successful offline verification in `verifyCashuPaymentOffline`, enqueue the proofs and capture the returned `settlementId`:

### Step 1 — Extend `BridgeVerifyConfig` in `src/types.ts`

```typescript
import type { SettlementQueue } from './settlement-queue.js';

export interface BridgeVerifyConfig {
  bridgePubkey: string;
  mintKeysets: MintKeyset[];
  rootKey: string;
  requireDleq?: boolean;
  location?: string;
  settlementQueue?: SettlementQueue;  // ← add this
}
```

### Step 2 — Enqueue after successful verification in `src/cashu-paywall.ts`

In `verifyCashuPaymentOffline`, after `createBridgeL402` succeeds and before the final `return`:

```typescript
// Enqueue to settlement queue if provided
let settlementId: string | undefined;
if (bridgeConfig.settlementQueue) {
  settlementId = bridgeConfig.settlementQueue.enqueue(proofs);
}

return {
  paid: true,
  amountSats: totalAmount,
  proofs,
  method: 'offline',
  p2pkVerified: true,
  dleqVerified: true,
  bridgeL402: macaroon,
  settlementId,
};
```

### Step 3 — Update tests

Add a test in `cashu-paywall.test.ts` (or create a new test file) that:
1. Passes a mock `settlementQueue` in `bridgeConfig`
2. Confirms `result.settlementId` is populated after successful offline verify
3. Confirms the mock `enqueue()` was called with the correct proofs

## Acceptance Criteria

- [ ] `BridgeVerifyConfig` has optional `settlementQueue?: SettlementQueue`
- [ ] `verifyCashuPaymentOffline` calls `settlementQueue.enqueue(proofs)` when provided
- [ ] `result.settlementId` is populated on success when queue is provided
- [ ] `result.settlementId` is `undefined` when no queue is provided (backwards compatible)
- [ ] Test verifying queue is called + settlementId populated
- [ ] No regressions (177 tests still pass)

## Notes

_Generated from gap_analyzer — "verifyCashuPaymentSmart does NOT auto-enqueue to settlement queue — settlementId in CashuPaymentResultV2 is always undefined"._
