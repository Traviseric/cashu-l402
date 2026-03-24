---
id: 15
title: "Sanitize verbose invoice error message in l402-client.ts"
priority: P2
severity: medium
status: completed
source: project_declared
file: src/l402-client.ts
line: 130
created: "2026-03-19T00:20:00"
execution_hint: sequential
context_group: security_hardening
group_reason: "Security fix; pair with tasks 014 and 016 for a security hardening pass"
---

# Sanitize verbose invoice error message in l402-client.ts

**Priority:** P2 (medium severity)
**Source:** AUDIT-007 / project_declared (AGENT_TASKS.md)
**Location:** src/l402-client.ts:130

## Problem

`l402Fetch()` throws a detailed error that exposes the integrator's `maxCostSats` spending policy:

```typescript
throw new Error(
    `L402 invoice amount (${decoded} sats) exceeds max cost (${maxCostSats} sats)`,
);
```

This error message reveals the application's internal spending limit to any code that catches and
forwards it (e.g., API error responses, crash reporters). If an integrator propagates this error
to a client or logs it without sanitization, it leaks budget configuration (CWE-209).

The fix: replace the interpolated message with a generic one and optionally log the amounts at
debug level using the existing `onLog`-style callback pattern if one is available in context.

**Code with issue:**
```typescript
if (decoded !== null && decoded > maxCostSats) {
    throw new Error(
        `L402 invoice amount (${decoded} sats) exceeds max cost (${maxCostSats} sats)`,
    );
}
```

## How to Fix

Replace the thrown message with a generic string:

```typescript
if (decoded !== null && decoded > maxCostSats) {
    throw new Error('L402 invoice exceeds maximum allowed cost');
}
```

If the `l402Fetch` function has access to an `onLog` callback (check the function signature —
it may need to be added as an optional config param), log the amounts at debug level:

```typescript
// optional debug log — only if onLog is in scope
onLog?.({ level: 'debug', event: 'invoice_cost_exceeded', context: { invoiceSats: decoded, maxSats: maxCostSats } });
throw new Error('L402 invoice exceeds maximum allowed cost');
```

If `l402Fetch` has no `onLog` parameter currently, just replace the message — don't add new
parameters to avoid API breakage.

## Acceptance Criteria

- [ ] Error message no longer contains `${decoded}` or `${maxCostSats}` interpolated values
- [ ] Generic message is thrown: `'L402 invoice exceeds maximum allowed cost'` (or similar generic string)
- [ ] Existing tests updated if they assert the old error message text
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes

## Notes

_Generated from AGENT_TASKS.md AUDIT-007. CWE-209 information exposure. Previously deferred in
run-2 with reasoning "client-side code only"; project owner re-listed as P2 in AGENT_TASKS.md._
