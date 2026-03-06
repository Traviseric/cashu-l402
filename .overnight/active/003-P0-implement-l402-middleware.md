---
id: 3
title: "Implement L402 (HTTP 402) middleware with macaroon + Lightning invoice"
priority: P0
severity: critical
status: completed
source: gap_analyzer
file: src/l402/
line: null
created: "2026-02-28T00:00:00"
execution_hint: sequential
context_group: core_protocol
group_reason: "Core protocol implementation — shares project context with task 002 (Cashu integration) and feeds into task 004 (integration layer)"
---

# Implement L402 (HTTP 402) middleware with macaroon + Lightning invoice

**Priority:** P0 (critical)
**Source:** gap_analyzer
**Location:** src/l402/

## Problem

The entire L402 protocol implementation is unbuilt. No source code, configuration, or dependency files exist. L402 (formerly LSAT) is the HTTP 402 Payment Required protocol — it uses macaroons combined with Lightning invoices to gate API access behind micropayments.

The standard flow is:
1. Client makes API request without payment credentials
2. Server responds with `402 Payment Required` + `WWW-Authenticate: L402 macaroon="...", invoice="lnbc..."`
3. Client pays the Lightning invoice, receives a payment preimage
4. Client sends request again with `Authorization: L402 <macaroon>:<preimage>`
5. Server verifies macaroon + preimage, grants access

**Current state:** No L402 code exists anywhere in the project.

## How to Fix

Create `src/l402/` module:

### 1. `src/l402/middleware.ts` — Express/Fastify middleware
```typescript
import { Request, Response, NextFunction } from 'express';

export interface L402Config {
  price: number;  // sats
  description: string;
  generateInvoice: (amount: number) => Promise<{ invoice: string; paymentHash: string }>;
  verifyPayment: (paymentHash: string, preimage: string) => Promise<boolean>;
}

export function l402Middleware(config: L402Config) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('L402 ')) {
      // Issue challenge
      const { invoice, paymentHash } = await config.generateInvoice(config.price);
      const macaroon = await generateMacaroon(paymentHash, config.price);

      res.status(402)
        .set('WWW-Authenticate', `L402 macaroon="${macaroon}", invoice="${invoice}"`)
        .json({ error: 'Payment required', invoice, macaroon });
      return;
    }

    // Verify L402 credentials
    const [, credentials] = authHeader.split(' ');
    const [macaroon, preimage] = credentials.split(':');

    if (await verifyL402(macaroon, preimage, config)) {
      next();
    } else {
      res.status(401).json({ error: 'Invalid L402 credentials' });
    }
  };
}
```

### 2. `src/l402/macaroon.ts` — Macaroon generation and verification
- Generate macaroons with payment hash caveat
- Verify macaroon signature and caveats
- Use a macaroon library (e.g., `macaroon` npm package) or implement basic HMAC-based tokens

### 3. `src/l402/types.ts` — Type definitions
- `L402Challenge` — macaroon + invoice in WWW-Authenticate header
- `L402Credentials` — macaroon + preimage in Authorization header
- `MacaroonCaveat` — key-value constraint in macaroon

### 4. `src/l402/verification.ts` — Credential verification
- Parse `Authorization: L402 <macaroon>:<preimage>` header
- Verify macaroon was issued by this server (HMAC check)
- Verify preimage hashes to payment hash in macaroon caveat

## Acceptance Criteria

- [ ] `src/l402/middleware.ts` exists as Express/Fastify middleware
- [ ] Returns `402 Payment Required` with proper `WWW-Authenticate` header on unauthenticated requests
- [ ] Generates valid macaroons containing payment hash caveat
- [ ] Verifies macaroon + preimage on authenticated requests
- [ ] Returns `401 Unauthorized` for invalid credentials
- [ ] Returns `200 OK` / calls `next()` for valid credentials
- [ ] Unit tests cover 402 challenge issuance and credential verification
- [ ] TypeScript types defined for all L402 data structures
- [ ] No regressions introduced

## Dependencies

- Requires task 001 (project scaffolding) to be completed first
- May need a macaroon library: `npm install macaroon` or similar

## Notes

_Generated from gap_analyzer findings. L402 spec reference: https://github.com/lightninglabs/L402_
