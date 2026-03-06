---
id: 13
title: "Sanitize error messages in production to prevent information leakage"
priority: P2
severity: medium
status: pending
source: security_audit
file: src/l402/middleware.ts
line: 66
created: "2026-02-28T06:00:00"
execution_hint: sequential
context_group: l402_module
group_reason: "Touches src/l402/middleware.ts — same module as task 7"
---

# Sanitize error messages in production to prevent information leakage

**Priority:** P2 (medium)
**Source:** security_audit (CWE-209)
**Location:** src/l402/middleware.ts:66

## Problem

Error responses propagate raw internal error messages directly to clients. For example, messages like `"Invalid macaroon signature"`, `"Token mint not in trusted list"`, or `"Macaroon has expired"` reveal internal implementation details that help attackers distinguish between different failure modes and craft targeted attacks.

**Code with issue:**
```typescript
} catch (err) {
  const message = err instanceof Error ? err.message : 'Invalid L402 credentials';
  res.status(401).json({ error: message });
}
```

The same pattern likely exists in `src/integration/cashu-l402-middleware.ts`.

## How to Fix

In production (`NODE_ENV === 'production'`), return generic error messages to clients while logging the detailed error server-side:

```typescript
} catch (err) {
  const internalMessage = err instanceof Error ? err.message : 'Unknown error';
  // Log server-side for debugging
  console.error('[L402] Authentication failed:', internalMessage);

  // Return generic message to client in production
  const clientMessage =
    process.env['NODE_ENV'] === 'production'
      ? 'Authentication failed'
      : internalMessage;

  res.status(401).json({ error: clientMessage });
}
```

Apply the same pattern to any other middleware files that propagate internal error messages.

## Acceptance Criteria

- [ ] In `NODE_ENV=production`, 401 responses return generic `"Authentication failed"` message
- [ ] In development, detailed error messages are preserved for easier debugging
- [ ] Internal errors are logged server-side in both environments
- [ ] All existing tests still pass (tests likely run without `NODE_ENV=production`)
- [ ] `npm run build` compiles clean

## Notes

_Generated from security_audit finding (CWE-209 generation of error message containing sensitive information)._
