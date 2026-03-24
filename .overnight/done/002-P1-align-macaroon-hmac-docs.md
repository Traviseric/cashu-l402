---
id: 2
title: "Fix CLAUDE.md macaroon HMAC description to match actual implementation"
priority: P1
severity: high
status: completed
source: gap_analyzer
file: CLAUDE.md
line: 0
created: "2026-02-28T00:00:00Z"
execution_hint: parallel
context_group: docs_accuracy
group_reason: "Pure doc fix — no code changes, independent of all other tasks"
---

# Fix CLAUDE.md macaroon HMAC description to match actual implementation

**Priority:** P1 (high)
**Source:** gap_analyzer
**Location:** CLAUDE.md (Key Patterns section), src/l402-server.ts:25-30

## Problem

`CLAUDE.md` describes the macaroon implementation as using **per-caveat HMAC chaining** (standard macaroon spec):

> "Root key signs identifier → each caveat extends the HMAC chain → one-way hashing prevents caveat removal."

However, `src/l402-server.ts` uses a **single-blob HMAC** — the entire payload (identifier + location + all caveats as a JSON array) is serialized and signed once:

```typescript
// src/l402-server.ts:25-30 — actual implementation:
export function signMacaroon(payload: MacaroonPayload, rootKey: string): string {
  const payloadStr = JSON.stringify(payload);
  const sig = createHmac('sha256', rootKey).update(payloadStr).digest('hex');
  // ...
}
```

This diverges from the standard macaroon HMAC chaining scheme in two ways:
1. **Not per-caveat**: Standard macaroons derive a new signature per caveat (`sig_n = HMAC(sig_{n-1}, caveat)`). The current implementation cannot support caveat attenuation after issuance without access to the root key.
2. **Docs mislead integrators**: An integrator reading CLAUDE.md who expects standard macaroon behavior (e.g., client-side caveat narrowing, third-party caveats) will get unexpected results.

The implementation is **functionally secure** for tamper detection — HMAC over the entire payload prevents modification of any caveat. But it does not support the delegation/attenuation properties that per-caveat chaining enables (a Phase 5 feature).

## How to Fix

### Option A (Recommended for now): Update CLAUDE.md to accurately describe the implementation

Update the "Macaroon HMAC chaining" description in `CLAUDE.md` Key Patterns section to reflect reality:

Replace:
```
**Macaroon HMAC chaining**: Root key signs identifier → each caveat extends the HMAC chain → one-way hashing prevents caveat removal. Standard L402 caveats: service identifiers (endpoint tiers), capability scopes (allowed verbs), volume budgets (rate limiting via crypto), third-party caveats (payment hash as external proof requirement).
```

With:
```
**Macaroon signing (single-blob HMAC)**: Root key signs the entire serialized payload `{identifier, location, caveats[]}` as one JSON blob via HMAC-SHA256. This prevents tampering with any field (identifier, location, or any caveat) but does NOT support per-caveat attenuation after issuance — adding a caveat requires re-signing with the root key. Standard L402 caveats supported: `service=` (endpoint identifier), `expires_at=` (Unix timestamp), `payment_method=` (cashu_p2pk). Phase 5 will add true per-caveat HMAC chaining for delegation and third-party caveats.
```

### Step 2 — Add a TODO comment in `src/l402-server.ts`

In `signMacaroon`, add a comment:

```typescript
/**
 * Sign a macaroon payload with HMAC-SHA256.
 * NOTE: Signs the entire serialized payload as one blob (not per-caveat chaining).
 * This means caveats cannot be attenuated after issuance without the root key.
 * Per-caveat chaining is planned for Phase 5 (delegation/third-party caveat support).
 */
export function signMacaroon(payload: MacaroonPayload, rootKey: string): string {
```

## Acceptance Criteria

- [ ] CLAUDE.md accurately describes the single-blob HMAC approach
- [ ] CLAUDE.md does NOT claim per-caveat chaining (which doesn't exist yet)
- [ ] `signMacaroon` has a code comment noting the simplified approach vs. standard macaroon chaining
- [ ] Phase 5 caveat attenuation work is referenced as future work
- [ ] No code changes to the actual signing logic (this is a docs-only fix)

## Notes

_Generated from gap_analyzer — "CLAUDE.md claims per-caveat HMAC chaining but l402-server.ts signs the whole JSON blob at once". This is a doc fix; Option B (implementing true per-caveat chaining) is deferred to Phase 5 when third-party caveats and delegation are scoped._
