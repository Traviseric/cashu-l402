---
id: 11
title: "Add nonce to bridge L402 preimage generation"
priority: P0
severity: critical
status: completed
source: security_audit
file: src/l402-server.ts
line: 312
created: "2026-02-28T02:00:00Z"
execution_hint: sequential
context_group: l402_server_security
group_reason: "Touches src/l402-server.ts — same file as any future caveat chaining work"
---

# Add nonce to bridge L402 preimage generation

**Priority:** P0 (critical)
**Source:** security_audit (AUDIT-001, CWE-330)
**Location:** src/l402-server.ts:312

## Problem

The `createBridgeL402` function in `src/l402-server.ts` generates the L402 preimage deterministically from the proof secrets alone:

```typescript
// src/l402-server.ts:311-318
// Deterministic preimage: HMAC-SHA256(rootKey, 'bridge:' + SHA256(sorted proof secrets))
const sortedSecrets = [...params.proofSecrets].sort();
const secretsDigest = createHash('sha256')
    .update(sortedSecrets.join(':'))
    .digest('hex');
const preimage = createHmac('sha256', params.rootKey)
    .update(`bridge:${secretsDigest}`)
    .digest('hex');
```

**Two security problems:**

1. **Replay attack**: The same set of proof secrets always produces the same preimage. An attacker who captures a valid `Authorization: L402 <macaroon>:<preimage>` header can replay it against any endpoint that accepts it — the preimage never changes for those proofs.

2. **Proof-of-payment bypass**: Anyone who knows the proof secrets (which are included in the token) can independently compute the preimage without ever going through the bridge verification flow. The preimage should be a bridge-issued secret that proves the bridge verified the proofs, not a value anyone can derive.

A nonce makes the preimage unique per verification event, preventing replay and decoupling the preimage from the proof contents.

## How to Fix

Add a random nonce to the preimage derivation. The nonce must be returned alongside the preimage so the macaroon identifier can embed it (for future verification if needed).

### Step 1 — Add nonce to preimage derivation in `src/l402-server.ts`

Replace the deterministic derivation with a nonce-based one:

```typescript
// Generate a random nonce for this issuance event
const nonce = randomBytes(16).toString('hex');

// Preimage: HMAC-SHA256(rootKey, 'bridge:' + nonce + ':' + SHA256(sorted proof secrets))
const sortedSecrets = [...params.proofSecrets].sort();
const secretsDigest = createHash('sha256')
    .update(sortedSecrets.join(':'))
    .digest('hex');
const preimage = createHmac('sha256', params.rootKey)
    .update(`bridge:${nonce}:${secretsDigest}`)
    .digest('hex');
```

The `identifier` (already a random 16-byte value at line 307) can double as the nonce if you want to avoid two separate random calls:

```typescript
const identifier = randomBytes(16).toString('hex');
// Reuse identifier as nonce — it's already unique per issuance
const preimage = createHmac('sha256', params.rootKey)
    .update(`bridge:${identifier}:${secretsDigest}`)
    .digest('hex');
```

This is the simpler approach — the `identifier` is already random per call, so using it as the nonce also binds the preimage to this specific macaroon issuance event.

### Step 2 — Update tests

In `src/__tests__/l402-server.test.ts`, any test that calls `createBridgeL402` twice with the same inputs and asserts identical preimages must be updated — preimages are now unique per call.

Add a new test:
```typescript
it('produces unique preimage for same inputs on each call', () => {
  const params = { rootKey: 'key', proofSecrets: ['s1', 's2'], resourcePath: '/api' };
  const result1 = createBridgeL402(params);
  const result2 = createBridgeL402(params);
  expect(result1.preimage).not.toBe(result2.preimage);
});
```

## Acceptance Criteria

- [ ] `createBridgeL402` called twice with identical inputs produces different preimages
- [ ] Preimage still depends on proof secrets (same secrets + same nonce = same preimage — deterministic given nonce)
- [ ] Nonce is incorporated into HMAC derivation, not just appended to output
- [ ] Existing tests updated to not assume deterministic preimage
- [ ] New test added verifying uniqueness per call
- [ ] All tests pass (252 current tests)
- [ ] TypeScript typecheck passes

## Notes

_Generated from security_audit AUDIT-001 (CWE-330). The simplest fix is to bind the preimage to the `identifier` which is already a random bytes value generated per call at line 307._
