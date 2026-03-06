---
id: 7
title: "Remove hardcoded L402 secret and enforce required configuration"
priority: P0
severity: critical
status: pending
source: security_audit
file: src/l402/middleware.ts
line: 18
created: "2026-02-28T06:00:00"
execution_hint: sequential
context_group: l402_module
group_reason: "Both touch src/l402/ — middleware.ts and types.ts"
---

# Remove hardcoded L402 secret and enforce required configuration

**Priority:** P0 (critical)
**Source:** security_audit (CWE-798, CWE-330)
**Location:** src/l402/middleware.ts:18, src/l402/types.ts:12

## Problem

Two closely related critical issues:

**Issue 1 — Hardcoded fallback secret (CWE-798):**
The L402 middleware falls back to a well-known hardcoded secret `'changeme-set-L402_SECRET'` when neither `config.secret` nor the `L402_SECRET` env var is provided. HMAC-SHA256 macaroons are signed with this known secret, meaning any attacker who knows the secret can forge valid macaroons and bypass payment verification entirely — without paying anything.

**Code with issue:**
```typescript
const secret = config.secret ?? process.env['L402_SECRET'] ?? 'changeme-set-L402_SECRET';
```

**Issue 2 — Optional secret type enables accidental insecure deployment (CWE-330):**
The `L402Config` type marks `secret` as optional with a documented fallback to the hardcoded value. This design makes it trivially easy for integrators to deploy without a secret configured.

**Code with issue:**
```typescript
/** Server secret used to sign/verify macaroons. Falls back to L402_SECRET env var. */
secret?: string;
```

## How to Fix

**In `src/l402/middleware.ts`:**

Remove the hardcoded default and throw a startup error if no secret is configured:
```typescript
const secret = config.secret ?? process.env['L402_SECRET'];
if (!secret) {
  throw new Error(
    'L402 secret is required. Set L402_SECRET environment variable or pass secret in config.'
  );
}
```

**In `src/l402/types.ts`:**

Either make `secret` required in the interface, or keep it optional but remove the misleading JSDoc that implies a fallback:
```typescript
export interface L402Config {
  price: number;
  description?: string;
  expirySeconds?: number;
  /**
   * Server secret for signing/verifying macaroons.
   * Must be set via this field or the L402_SECRET environment variable.
   * Throws at middleware initialization if neither is provided.
   */
  secret?: string;
  generateInvoice: (amount: number, description?: string) => Promise<{ invoice: string; paymentHash: string }>;
  verifyPayment?: (paymentHash: string, preimage: string) => Promise<boolean>;
}
```

Update tests to always pass a secret in test configs.

## Acceptance Criteria

- [ ] No hardcoded default secret exists anywhere in the codebase
- [ ] Middleware throws a clear error at startup if secret is not configured
- [ ] L402Config JSDoc accurately describes the requirement (no mention of hardcoded default)
- [ ] All existing tests still pass (update test fixtures to pass explicit secrets)
- [ ] `npm run build` compiles clean

## Notes

_Generated from security_audit findings (CWE-798 + CWE-330 merged — same root cause: hardcoded secret design)._
