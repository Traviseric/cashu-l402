---
id: 16
title: "Add log injection protection to onLog calls in cashu-paywall.ts"
priority: P2
severity: low
status: completed
source: project_declared
file: src/cashu-paywall.ts
line: 238
created: "2026-03-19T00:20:00"
execution_hint: sequential
context_group: security_hardening
group_reason: "Security fix; pair with tasks 014 and 015 for a security hardening pass"
---

# Add log injection protection to onLog calls in cashu-paywall.ts

**Priority:** P2 (low severity)
**Source:** AUDIT-009 / project_declared (AGENT_TASKS.md)
**Location:** src/cashu-paywall.ts:238

## Problem

`verifyCashuPaymentOffline()` passes unvalidated external data (e.g., `mintUrl`, `config.mintUrl`)
directly into `onLog` callback context without length or character validation:

```typescript
bridgeConfig.onLog?.({
    level: 'warn',
    event: 'wrong_mint',
    context: { got: mintUrl, expected: config.mintUrl }
});
```

If an attacker provides a crafted `mintUrl` (from the incoming Cashu token) containing log
injection sequences (e.g., newlines, ANSI escape codes, or HTML if the integrator renders
logs to a web UI), it could corrupt log output or cause XSS in integrators that render logs
as HTML (CWE-117).

The fix: add a simple sanitization helper that truncates strings to max 500 chars and strips
control characters before they enter the log context. Also add a JSDoc warning on `LogFn`
type telling integrators to sanitize context values when rendering to HTML.

**Code with issue:**
```typescript
// mintUrl comes from the decoded token — attacker-controlled
bridgeConfig.onLog?.({ level: 'warn', event: 'wrong_mint', context: { got: mintUrl, expected: config.mintUrl } });
```

## How to Fix

Add a small inline sanitization helper (no external deps):

```typescript
/** Sanitize a string for safe inclusion in log context: truncate + strip control chars. */
function sanitizeLogValue(v: string, maxLen = 500): string {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control char strip
    return v.slice(0, maxLen).replace(/[\x00-\x1F\x7F]/g, '');
}
```

Apply it wherever externally-sourced strings go into `onLog` context:

```typescript
bridgeConfig.onLog?.({
    level: 'warn',
    event: 'wrong_mint',
    context: { got: sanitizeLogValue(mintUrl ?? ''), expected: sanitizeLogValue(config.mintUrl ?? '') }
});
```

Also update the `LogFn` / `LogEntry` JSDoc in `src/types.ts` with a warning:

```typescript
/**
 * @remarks Integrators must sanitize `context` values before rendering to HTML —
 * context strings originate from external token data and may contain untrusted content.
 */
```

Scan `cashu-paywall.ts` for all `onLog` calls that include externally-sourced strings
(mintUrl, proof amounts from tokens, etc.) and apply `sanitizeLogValue` to each.

## Acceptance Criteria

- [ ] `sanitizeLogValue` helper added (or equivalent inline truncation+strip)
- [ ] All `onLog` calls in `cashu-paywall.ts` that include external strings use the sanitizer
- [ ] JSDoc warning added to `LogFn` / `LogEntry` type in `src/types.ts`
- [ ] No new external dependencies added
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes

## Notes

_Generated from AGENT_TASKS.md AUDIT-009. CWE-117 log injection. Previously deferred in run-2
with reasoning "integrator's responsibility"; project owner re-listed as P2 in AGENT_TASKS.md._
