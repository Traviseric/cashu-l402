---
id: 8
title: "Add HTLC condition test cases to conditions.test.ts"
priority: P2
severity: low
status: completed
source: feature_audit
file: src/__tests__/conditions.test.ts
line: 0
created: "2026-02-28T00:00:00Z"
execution_hint: parallel
context_group: test_coverage
group_reason: "Test-only change, touches conditions.test.ts; independent of source code changes"
---

# Add HTLC condition test cases to conditions.test.ts

**Priority:** P2 (low)
**Source:** feature_audit
**Location:** src/__tests__/conditions.test.ts, src/conditions.ts

## Problem

HTLC spending condition support is implemented in `conditions.ts` — the HTLC kind is detected and hashlock tags are parsed. However, there are **zero HTLC-specific test cases** in `conditions.test.ts`:

```bash
$ grep -n "HTLC\|htlc\|hashlock" src/__tests__/conditions.test.ts
# No matches found
```

The `detectConditions()` and `extractConditionCaveats()` functions handle HTLC conditions but this code path is completely untested. Any regression in HTLC detection would go unnoticed.

## How to Fix

Add dedicated HTLC test cases to `src/__tests__/conditions.test.ts`. Each test should build a mock proof with an HTLC-structured secret and verify the output.

### Example test structure

Look at how existing P2PK tests are structured in `conditions.test.ts`, then add a similar `describe('HTLC conditions')` block:

```typescript
describe('detectConditions — HTLC', () => {
  it('detects HTLC condition from hashlock tag', () => {
    const proof = makeMockProofWithSecret(JSON.stringify([
      'P', // kind prefix for NUT-10
      {
        kind: 'HTLC',
        data: 'sha256_hash_of_preimage_hex',
        tags: [['hashlock', 'abcdef1234567890...']],
      }
    ]));
    const conditions = detectConditions(proof);
    expect(conditions).not.toBeNull();
    expect(conditions?.kind).toBe('HTLC');
    expect(conditions?.hashlock).toBeDefined();
  });

  it('extracts HTLC caveats from hashlock condition', () => {
    const conditions = { kind: 'HTLC', hashlock: 'abcdef...', locktime: undefined };
    const caveats = extractConditionCaveats(conditions);
    expect(caveats).toContainEqual({ key: 'hashlock', value: 'abcdef...' });
  });

  it('includes locktime caveat when HTLC has timelock', () => {
    const futureTime = Math.floor(Date.now() / 1000) + 3600;
    const conditions = { kind: 'HTLC', hashlock: 'abcdef...', locktime: futureTime };
    const caveats = extractConditionCaveats(conditions);
    expect(caveats.some(c => c.key === 'locktime')).toBe(true);
  });
});
```

Check the actual `conditions.ts` implementation first to understand the exact HTLC field structure before writing tests.

## Acceptance Criteria

- [ ] At least 3 HTLC-specific test cases added to `conditions.test.ts`
- [ ] Tests cover: HTLC detection, caveat extraction from hashlock, timelock caveat
- [ ] Tests use the same mock proof helpers already used in `conditions.test.ts`
- [ ] All 177 existing tests still pass + new HTLC tests pass

## Notes

_Generated from feature_audit — "HTLC spending condition support is only partially covered in conditions.ts — there are no dedicated HTLC-specific test cases in conditions.test.ts."_
