---
id: 14
title: "Remove timing side-channel in isLockedToBridge (offline-verify.ts)"
priority: P1
severity: medium
status: completed
source: project_declared
file: src/offline-verify.ts
line: 43
created: "2026-03-19T00:20:00"
execution_hint: sequential
context_group: security_hardening
group_reason: "Security fix; pair with tasks 015 and 016 for a security hardening pass"
---

# Remove timing side-channel in isLockedToBridge (offline-verify.ts)

**Priority:** P1 (medium severity)
**Source:** AUDIT-006 / project_declared (AGENT_TASKS.md)
**Location:** src/offline-verify.ts:43

## Problem

`isLockedToBridge()` contains a length pre-check before `timingSafeEqual`:

```typescript
if (proofPubkey.length !== expectedPubkey.length) return false;

try {
    return timingSafeEqual(Buffer.from(proofPubkey, 'hex'), Buffer.from(expectedPubkey, 'hex'));
} catch {
    return false;
}
```

The early `return false` on length mismatch creates a timing side-channel (CWE-208). Callers can
distinguish "wrong length" from "right length but wrong key" via response time difference. While
secp256k1 compressed pubkeys are always 66 hex chars in practice, any malformed/attacker-controlled
input with a different length leaks this fact via timing.

The fix is simple: remove the early-exit length guard and let `timingSafeEqual` throw a
`RangeError` when buffer lengths differ, then catch that uniformly — same `return false` path
as any other failure, but no timing leak.

**Code with issue:**
```typescript
if (proofPubkey.length !== expectedPubkey.length) return false;  // ← early exit = timing leak

try {
    return timingSafeEqual(Buffer.from(proofPubkey, 'hex'), Buffer.from(expectedPubkey, 'hex'));
} catch {
    return false;
}
```

## How to Fix

Delete line 43 (`if (proofPubkey.length !== expectedPubkey.length) return false;`). The existing
`try/catch` already catches the `RangeError` that `timingSafeEqual` throws when buffers have
different lengths — returning `false` uniformly.

After fix:
```typescript
try {
    return timingSafeEqual(Buffer.from(proofPubkey, 'hex'), Buffer.from(expectedPubkey, 'hex'));
} catch {
    return false;
}
```

Add 1 test in `src/__tests__/offline-verify.test.ts` asserting that calling `isLockedToBridge`
with a mismatched-length pubkey (e.g. a 64-char hex string instead of 66-char) returns `false`
without throwing.

## Acceptance Criteria

- [ ] `if (proofPubkey.length !== expectedPubkey.length) return false;` line is removed
- [ ] Existing tests still pass (no regression)
- [ ] New test: mismatched-length pubkey input returns `false` without throwing
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes

## Notes

_Generated from AGENT_TASKS.md AUDIT-006. CWE-208 timing side-channel. Previously deferred in run-2
with weak reasoning (secp256k1 keys are fixed-length in practice); project owner re-listed as P1._
