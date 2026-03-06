---
id: 6
title: "Add test suite covering Cashu integration, L402 middleware, and integration layer"
priority: P1
severity: high
status: completed
source: gap_analyzer
file: src/__tests__/
line: null
created: "2026-02-28T00:00:00"
execution_hint: sequential
context_group: testing
group_reason: "Testing task — must follow tasks 002, 003, 004 to have code to test"
---

# Add test suite covering Cashu integration, L402 middleware, and integration layer

**Priority:** P1 (high)
**Source:** gap_analyzer
**Location:** src/__tests__/

## Problem

No test files of any kind exist in the project. A library implementing cryptographic protocols (Cashu ecash) and security-critical middleware (L402 authentication) must have tests to:
- Prevent regressions in payment handling code
- Verify security properties (token validation, double-spend prevention)
- Document expected behavior

**Current state:** No test files of any kind exist.

## How to Fix

Add test suite using Jest (or Vitest):

### 1. `src/__tests__/cashu.test.ts` — Cashu integration tests
```typescript
import { CashuClient } from '../cashu/client';
import { validateToken } from '../cashu/validation';

describe('CashuClient', () => {
  it('should request a mint quote and return a Lightning invoice', async () => {
    // Mock the cashu-ts mint API
    const client = new CashuClient('https://testmint.example.com');
    const result = await client.getMintQuote(10);
    expect(result.invoice).toMatch(/^lnbc/);
    expect(result.quote).toBeTruthy();
  });

  it('should reject malformed tokens', async () => {
    const client = new CashuClient('https://testmint.example.com');
    await expect(client.redeemToken('not-a-valid-token')).rejects.toThrow();
  });
});

describe('validateToken', () => {
  it('should reject tokens from untrusted mints', () => {
    // ...
  });
});
```

### 2. `src/__tests__/l402.test.ts` — L402 middleware tests
```typescript
import request from 'supertest';
import express from 'express';
import { l402Middleware } from '../l402/middleware';

describe('L402 middleware', () => {
  it('should return 402 with WWW-Authenticate header when no auth provided', async () => {
    const app = express();
    app.get('/test', l402Middleware({ price: 10, ... }), (req, res) => res.json({ ok: true }));
    const res = await request(app).get('/test');
    expect(res.status).toBe(402);
    expect(res.headers['www-authenticate']).toMatch(/L402/);
  });

  it('should return 401 for invalid credentials', async () => { /* ... */ });
  it('should call next() for valid L402 credentials', async () => { /* ... */ });
});
```

### 3. `src/__tests__/integration.test.ts` — End-to-end integration tests
- Test full Cashu token → API access flow
- Test double-spend prevention (same token used twice should fail)
- Test insufficient token value rejection

### Package.json additions:
```json
"scripts": {
  "test": "jest --coverage",
  "test:watch": "jest --watch"
},
"jest": {
  "preset": "ts-jest",
  "testEnvironment": "node"
}
```

## Acceptance Criteria

- [ ] `src/__tests__/cashu.test.ts` exists with unit tests for Cashu module
- [ ] `src/__tests__/l402.test.ts` exists with unit tests for L402 middleware
- [ ] `src/__tests__/integration.test.ts` exists with integration tests
- [ ] `npm test` runs all tests without error
- [ ] Coverage includes token validation, 402 challenge flow, and credential verification
- [ ] Double-spend prevention is tested
- [ ] Tests use mocks for external Lightning/mint API calls
- [ ] No regressions introduced

## Dependencies

- Requires tasks 001, 002, 003, 004 to be completed first (need code to test)

## Notes

_Generated from gap_analyzer findings. Security-critical payment code requires comprehensive tests._
