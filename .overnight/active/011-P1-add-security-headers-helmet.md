---
id: 11
title: "Add helmet middleware for security response headers"
priority: P1
severity: high
status: pending
source: security_audit
file: src/index.ts
line: 1
created: "2026-02-28T06:00:00"
execution_hint: parallel
context_group: security_hardening
group_reason: "Express middleware additions — independent of other tasks"
---

# Add helmet middleware for security response headers

**Priority:** P1 (high)
**Source:** security_audit (CWE-116)
**Location:** src/index.ts

## Problem

The Express application does not set security-related HTTP response headers. Missing headers include:
- `Content-Security-Policy` — prevents XSS and injection attacks
- `X-Content-Type-Options: nosniff` — prevents MIME type sniffing
- `X-Frame-Options` — prevents clickjacking
- `Strict-Transport-Security` (HSTS) — enforces HTTPS
- `Referrer-Policy` — controls referrer information leakage
- `Permissions-Policy` — restricts browser features

These omissions expose consumers of the API to clickjacking, MIME sniffing, and information leakage attacks.

**Code with issue:**
```typescript
// No security headers middleware (helmet) present
app.use(express.json());
```

## How to Fix

Install `helmet` and add it as the first middleware:

```bash
npm install helmet
```

```typescript
import helmet from 'helmet';

const app = express();

// Security headers — must be first
app.use(helmet());
app.use(express.json());
// ... rest of app
```

For a payment API, the default `helmet()` configuration is appropriate. No CSP adjustments are needed for a pure REST API with no browser-rendered HTML.

Add `helmet` to `package.json` dependencies.

## Acceptance Criteria

- [ ] `helmet` is installed and listed in `package.json` dependencies
- [ ] `app.use(helmet())` is the first middleware applied to the Express app
- [ ] Security headers are present in all responses (verify with `curl -I`)
- [ ] All existing tests still pass
- [ ] `npm run build` compiles clean

## Notes

_Generated from security_audit finding (CWE-116 missing security headers)._
