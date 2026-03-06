---
id: 10
title: "Add rate limiting middleware to all API routes"
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

# Add rate limiting middleware to all API routes

**Priority:** P1 (high)
**Source:** security_audit (CWE-307)
**Location:** src/index.ts

## Problem

There is no rate limiting on any endpoint. Attackers can:
- Issue unlimited requests to the 402-challenge endpoint to probe behavior
- Flood the token verification path to exhaust mint API quotas and cause real financial cost
- Attempt brute-force timing attacks against HMAC verification
- Trigger unbounded mint network calls with no throttling

Express has no built-in rate limiting. Without it, the service is trivially DoS-able.

**Code with issue:**
```typescript
// No rate limiting middleware present
app.use(express.json());
// routes follow immediately
```

## How to Fix

Install `express-rate-limit` and apply it to all routes (especially `/api/*`):

```bash
npm install express-rate-limit
npm install --save-dev @types/express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit';

// General rate limit: 60 requests per minute per IP
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Stricter limit for payment/API routes: 30 requests per minute
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

app.use(generalLimiter);
app.use('/api', apiLimiter);
```

Add `express-rate-limit` to `package.json` dependencies.

## Acceptance Criteria

- [ ] `express-rate-limit` is installed and listed in `package.json` dependencies
- [ ] Rate limiting is applied globally and with stricter limits on `/api/*`
- [ ] Rate limit responses return standard HTTP 429 with a JSON body
- [ ] Existing tests still pass (adjust test setup to bypass rate limiter in tests via `skip` or test-only config)
- [ ] `npm run build` compiles clean

## Notes

_Generated from security_audit finding (CWE-307 improper restriction of excessive authentication attempts)._
