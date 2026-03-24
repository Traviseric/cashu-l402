---
id: 12
title: "Add size limit and tag element validation to parseNut10Secret"
priority: P1
severity: high
status: completed
source: security_audit
file: src/conditions.ts
line: 22
created: "2026-02-28T02:00:00Z"
execution_hint: sequential
context_group: conditions_validation
group_reason: "Touches src/conditions.ts — same file as task 013 (parseInt fix)"
---

# Add size limit and tag element validation to parseNut10Secret

**Priority:** P1 (high)
**Source:** security_audit (AUDIT-003, CWE-400)
**Location:** src/conditions.ts:22

## Problem

`parseNut10Secret()` calls `JSON.parse()` on proof secrets without size bounds, and does not validate that tag elements are strings:

```typescript
// src/conditions.ts:22-39
export function parseNut10Secret(secret: string): Nut10Secret | null {
  try {
    const parsed = JSON.parse(secret);  // ← no size limit
    if (!Array.isArray(parsed) || parsed.length < 2) return null;

    const [kind, body] = parsed;
    if (typeof kind !== 'string') return null;
    if (typeof body !== 'object' || body === null) return null;
    if (typeof body.nonce !== 'string') return null;
    if (typeof body.data !== 'string') return null;

    const tags: string[][] = Array.isArray(body.tags) ? body.tags : [];
    // ↑ tags is declared as string[][] but elements are never validated as string[]
    // ↑ a tag like [123, null, {}] passes through and is typed as string[]

    return { kind, nonce: body.nonce, data: body.data, tags };
  } catch {
    return null;
  }
}
```

**Two issues:**

1. **DoS via large JSON**: A malicious proof secret can be arbitrarily large JSON. Parsing megabyte-scale JSON in the hot verification path wastes CPU and memory. Node.js `JSON.parse` on very large inputs blocks the event loop.

2. **Type unsafety in tags**: The declared return type `string[][]` is not enforced. Tag arrays containing non-string elements (numbers, objects, nulls) are passed to callers without validation. Downstream code in `detectConditions()` iterates over tags assuming string values.

## How to Fix

### Step 1 — Add size limit before JSON.parse

```typescript
export function parseNut10Secret(secret: string): Nut10Secret | null {
  // Reject oversized secrets before parsing (prevent DoS)
  if (secret.length > 10_000) return null;

  try {
    const parsed = JSON.parse(secret);
    // ... rest of function
  }
}
```

### Step 2 — Validate tag elements as string[][]

Replace the unchecked tags assignment:

```typescript
// Before:
const tags: string[][] = Array.isArray(body.tags) ? body.tags : [];

// After:
const rawTags = Array.isArray(body.tags) ? body.tags : [];
const tags: string[][] = rawTags.filter(
  (t): t is string[] => Array.isArray(t) && t.every((e) => typeof e === 'string')
);
```

This ensures the returned `tags` truly satisfies `string[][]`. Malformed tag entries are dropped rather than passed through.

### Step 3 — Update tests

In `src/__tests__/conditions.test.ts`:
- Add test: `parseNut10Secret` returns `null` for a string longer than 10,000 characters
- Add test: tags containing non-string elements are filtered out (not passed through)
- Add test: tags containing non-array entries are filtered out

## Acceptance Criteria

- [ ] `parseNut10Secret` returns `null` for secrets with `length > 10_000`
- [ ] Tags containing non-array elements are filtered out
- [ ] Tags containing arrays with non-string elements are filtered out
- [ ] Valid well-formed NUT-10 secrets still parse correctly
- [ ] New test cases cover the size limit and tag validation paths
- [ ] All 252 existing tests pass
- [ ] TypeScript typecheck passes

## Notes

_Generated from security_audit AUDIT-003 (CWE-400). The 10,000 character limit is conservative — a valid NUT-10 secret with a 33-byte compressed pubkey, nonce, and a few tags is typically under 300 bytes. Anything over 10KB is almost certainly malicious or malformed._
