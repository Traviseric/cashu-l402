---
id: 13
title: "Fix parseInt || undefined silently drops zero values in detectConditions"
priority: P2
severity: medium
status: completed
source: security_audit
file: src/conditions.ts
line: 66
created: "2026-02-28T02:00:00Z"
execution_hint: sequential
context_group: conditions_validation
group_reason: "Touches src/conditions.ts — same file as task 012 (NUT-10 parser validation)"
---

# Fix parseInt || undefined silently drops zero values in detectConditions

**Priority:** P2 (medium)
**Source:** security_audit (AUDIT-008, CWE-1025)
**Location:** src/conditions.ts:66

## Problem

`detectConditions()` uses `parseInt(...) || undefined` to parse numeric tag values:

```typescript
// src/conditions.ts:66-75
case 'locktime':
  info.locktime = Number.parseInt(values[0], 10) || undefined;
  break;
// ...
case 'n_sigs':
  info.nSigs = Number.parseInt(values[0], 10) || undefined;
  break;
```

The `|| undefined` pattern is broken because `0 || undefined` evaluates to `undefined`. This silently drops legitimate zero values:

- `locktime=0` means "already expired" (Unix epoch), but gets coerced to `undefined` → treated as "no locktime"
- `n_sigs=0` means "no signatures required" — edge case but valid in some multisig schemes

Additionally, there is no validation that the parsed value is a non-negative integer. Values like `locktime=-1` or `locktime=9999999999` pass through unchecked.

While `locktime=0` is an unusual edge case in practice, the coercion bug makes the code incorrect relative to the NUT-10/11 spec and creates a subtle inconsistency that could cause security bypasses in time-critical scenarios.

## How to Fix

Replace `|| undefined` with explicit NaN and range checking:

```typescript
// Before:
case 'locktime':
  info.locktime = Number.parseInt(values[0], 10) || undefined;
  break;
case 'n_sigs':
  info.nSigs = Number.parseInt(values[0], 10) || undefined;
  break;

// After:
case 'locktime': {
  const v = Number.parseInt(values[0], 10);
  info.locktime = !Number.isNaN(v) && v >= 0 ? v : undefined;
  break;
}
case 'n_sigs': {
  const v = Number.parseInt(values[0], 10);
  info.nSigs = !Number.isNaN(v) && v >= 1 ? v : undefined;
  break;
}
```

Note: `n_sigs` should require `>= 1` (at least one signature required is the minimum meaningful value for a multisig threshold). `locktime` starts at `0` (valid Unix epoch, means already expired).

## Acceptance Criteria

- [ ] `detectConditions()` correctly handles `locktime=0` (returns `locktime: 0`, not `undefined`)
- [ ] `detectConditions()` rejects `locktime=-1` or `locktime=NaN` (returns `undefined`)
- [ ] `detectConditions()` rejects `n_sigs=0` (returns `undefined` — 0 signatures is not meaningful)
- [ ] `detectConditions()` correctly handles `n_sigs=1` (returns `nSigs: 1`)
- [ ] Test cases added for the zero and invalid value edge cases
- [ ] No regressions in existing 252 tests
- [ ] TypeScript typecheck passes

## Notes

_Generated from security_audit AUDIT-008 (CWE-1025). This task and task 012 both touch `src/conditions.ts` — run sequentially (012 first, since it adds the size limit guard that makes this function safer overall). The `context_group: conditions_validation` ensures they run in the same sequential group._
