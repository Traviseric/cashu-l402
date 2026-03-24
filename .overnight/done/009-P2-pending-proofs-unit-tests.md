---
id: 9
title: "Create pending-proofs.test.ts with unit tests for createPendingProofStore"
priority: P2
severity: medium
status: completed
source: gap_analyzer
file: src/__tests__/pending-proofs.test.ts
line: 0
created: "2026-02-28T00:00:00Z"
execution_hint: parallel
context_group: test_coverage
group_reason: "Test-only new file, independent of source code changes; same group as task 008"
---

# Create pending-proofs.test.ts with unit tests for createPendingProofStore

**Priority:** P2 (medium)
**Source:** gap_analyzer
**Location:** src/pending-proofs.ts (tested), src/__tests__/pending-proofs.test.ts (to create)

## Problem

`src/pending-proofs.ts` exports `createPendingProofStore()` with the following interface:
- `register(proof, kind, metadata?)` — store a pending proof
- `resolve(secret, resolution)` — mark a proof as resolved
- `expire(secret)` — expire a proof past its deadline
- `get(secret)` — retrieve a single pending proof
- `getPending()` — list all pending proofs
- `pendingCount()` — count pending proofs
- `clear()` — clear all proofs

**There is no `pending-proofs.test.ts` file.** The module is only tested indirectly via `conditional-verify.test.ts`, which does not cover all methods. Any regression in `register`, `resolve`, `expire`, `clear`, `get`, `getPending`, or `pendingCount` would go unnoticed.

## How to Fix

Create `src/__tests__/pending-proofs.test.ts` with comprehensive unit tests:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createPendingProofStore } from '../../pending-proofs.js';

describe('createPendingProofStore', () => {
  let store: ReturnType<typeof createPendingProofStore>;

  beforeEach(() => {
    store = createPendingProofStore();
  });

  describe('register', () => {
    it('stores a PoS proof and returns it via get()', () => { ... });
    it('stores an escrow proof', () => { ... });
    it('initial status is pending', () => { ... });
    it('register with deadline stores deadline correctly', () => { ... });
  });

  describe('resolve', () => {
    it('marks a registered proof as resolved', () => { ... });
    it('stores resolution data', () => { ... });
    it('returns false for unknown secret', () => { ... });
  });

  describe('expire', () => {
    it('marks a registered proof as expired', () => { ... });
    it('returns false for unknown secret', () => { ... });
  });

  describe('get', () => {
    it('returns null for unknown secret', () => { ... });
    it('returns proof after register', () => { ... });
  });

  describe('getPending', () => {
    it('returns only proofs with pending status', () => { ... });
    it('excludes resolved proofs', () => { ... });
    it('excludes expired proofs', () => { ... });
  });

  describe('pendingCount', () => {
    it('returns 0 for empty store', () => { ... });
    it('increments when proofs are registered', () => { ... });
    it('decrements when proofs are resolved', () => { ... });
  });

  describe('clear', () => {
    it('removes all proofs', () => { ... });
    it('pendingCount is 0 after clear', () => { ... });
  });

  describe('onResolve callback', () => {
    it('calls onResolve when proof is resolved', () => { ... });
  });
});
```

Read `src/pending-proofs.ts` to understand the exact API and type signatures before writing the tests.

## Acceptance Criteria

- [ ] `src/__tests__/pending-proofs.test.ts` created
- [ ] Tests cover: `register`, `resolve`, `expire`, `get`, `getPending`, `pendingCount`, `clear`
- [ ] Tests cover the `onResolve` callback (if implemented)
- [ ] Edge cases: unknown secret, empty store, status transitions
- [ ] All tests pass (new file adds to the test suite without breaking existing 177 tests)

## Notes

_Generated from gap_analyzer — "No dedicated test file for pending-proofs.ts exists. The module is tested indirectly via conditional-verify.test.ts but has no focused unit tests."_
