---
id: 6
title: "Add structured logging hooks to CashuPaywallConfig and BridgeVerifyConfig"
priority: P2
severity: medium
status: completed
source: feature_audit
file: src/types.ts
line: 0
created: "2026-02-28T00:00:00Z"
execution_hint: sequential
context_group: types_improvement
group_reason: "Touches src/types.ts config interfaces; same area as task 005 and 007"
---

# Add structured logging hooks to CashuPaywallConfig and BridgeVerifyConfig

**Priority:** P2 (medium)
**Source:** feature_audit + gap_analyzer
**Location:** src/types.ts, src/cashu-paywall.ts, src/l402-server.ts

## Problem

The library is completely silent. Integrators have no way to observe internal events (proof verified, settlement enqueued, macaroon issued, verification failed) without modifying library source code.

This makes production debugging, audit logging, and observability impossible without wrapping every function call in custom logic. In financial middleware, observability is critical.

```typescript
// Currently: no log output at all from any path
const result = await verifyCashuPaymentSmart(token, config, bridgeConfig);
// If this fails, why? Which step failed? No observable signal.
```

## How to Fix

### Step 1 — Add `LogFn` type and `onLog` callback to `src/types.ts`

```typescript
/** Log levels for library-internal events. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured log entry emitted by the library.
 * Integrators can pipe this to pino, winston, console, or any logger.
 */
export interface LogEntry {
  level: LogLevel;
  event: string;
  context?: Record<string, unknown>;
}

/** Optional logger callback. Called for key library events. */
export type LogFn = (entry: LogEntry) => void;
```

### Step 2 — Add `onLog` to config types

```typescript
export interface CashuPaywallConfig {
  mintUrl: string;
  priceSats: number;
  description?: string;
  onLog?: LogFn;  // ← add
}

export interface BridgeVerifyConfig {
  bridgePubkey: string;
  mintKeysets: MintKeyset[];
  rootKey: string;
  requireDleq?: boolean;
  location?: string;
  settlementQueue?: SettlementQueue;
  onLog?: LogFn;  // ← add
}
```

### Step 3 — Emit log events in key paths in `cashu-paywall.ts`

Add calls to `config.onLog?.()` at key decision points:

```typescript
// On successful offline verification:
config.onLog?.({ level: 'info', event: 'proof_verified_offline',
  context: { amountSats: totalAmount, proofCount: proofs.length, dleqVerified: true } });

// On DLEQ failure:
config.onLog?.({ level: 'warn', event: 'dleq_verification_failed',
  context: { error: firstError?.error } });

// On locktime expiry:
config.onLog?.({ level: 'warn', event: 'proof_locktime_expired',
  context: { locktimeUnix: minLocktime } });

// On settlement enqueue:
config.onLog?.({ level: 'debug', event: 'settlement_enqueued',
  context: { settlementId, proofCount: proofs.length } });
```

### Step 4 — Emit log events in `l402-server.ts`

```typescript
// On macaroon verification failure:
// On challenge expiry:
// On bridge L402 issuance:
```

## Acceptance Criteria

- [ ] `LogFn`, `LogLevel`, `LogEntry` types added to `src/types.ts`
- [ ] `onLog?: LogFn` added to `CashuPaywallConfig` and `BridgeVerifyConfig`
- [ ] At least 5 meaningful log events emitted across `cashu-paywall.ts` and `l402-server.ts`
- [ ] `onLog` is called with `?.()` (optional chaining — not required)
- [ ] Log events have meaningful `event` strings and relevant `context` fields
- [ ] All 177 existing tests still pass (onLog is optional, not required)
- [ ] Add a test verifying `onLog` is called on successful verification

## Notes

_Generated from feature_audit — "No structured logging hooks. The library is entirely silent — integrators have no way to observe internal events without modifying the library."_
