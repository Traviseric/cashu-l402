---
id: 12
title: "Add explicit CORS configuration to Express app"
priority: P2
severity: medium
status: pending
source: security_audit
file: src/index.ts
line: 1
created: "2026-02-28T06:00:00"
execution_hint: parallel
context_group: security_hardening
group_reason: "Express middleware additions — independent of other tasks"
---

# Add explicit CORS configuration to Express app

**Priority:** P2 (medium)
**Source:** security_audit (CWE-942)
**Location:** src/index.ts

## Problem

The application does not configure CORS headers. Without explicit CORS policy, the security boundary is unclear: depending on the execution environment, Express may return permissive headers by default, or the absence of CORS headers may block legitimate browser-based clients. For a payment API, using `origin: '*'` would allow any website to make cross-origin requests and read payment responses — a significant risk for a service that handles financial transactions.

**Code with issue:**
```typescript
// No CORS configuration present
app.use(express.json());
```

## How to Fix

Install the `cors` package and configure it explicitly. The allowed origins should come from an environment variable:

```bash
npm install cors
npm install --save-dev @types/cors
```

```typescript
import cors from 'cors';

const ALLOWED_ORIGINS = process.env['CORS_ORIGINS']
  ? process.env['CORS_ORIGINS'].split(',').map((o) => o.trim())
  : [];

app.use(
  cors({
    origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : false,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false, // no cookies for a payment API
  })
);
```

If `CORS_ORIGINS` is not set, CORS is disabled (no cross-origin browser access). Set `CORS_ORIGINS=https://yourapp.com` to enable it for known clients.

Add `cors` to `package.json` dependencies.

## Acceptance Criteria

- [ ] `cors` package is installed and listed in `package.json` dependencies
- [ ] CORS origins are configured from `CORS_ORIGINS` env var (not hardcoded)
- [ ] Default behavior (no env var set) disables cross-origin access
- [ ] `origin: '*'` is never used
- [ ] All existing tests still pass
- [ ] `npm run build` compiles clean

## Notes

_Generated from security_audit finding (CWE-942 permissive CORS policy)._
