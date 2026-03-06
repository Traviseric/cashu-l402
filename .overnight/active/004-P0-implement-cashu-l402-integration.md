---
id: 4
title: "Implement Cashu-L402 integration layer (accept ecash tokens as payment proof)"
priority: P0
severity: critical
status: completed
source: gap_analyzer
file: src/integration/
line: null
created: "2026-02-28T00:00:00"
execution_hint: long_running
context_group: integration
group_reason: "Integration layer combining tasks 002 and 003 — requires both Cashu and L402 modules complete"
---

# Implement Cashu-L402 integration layer (accept ecash tokens as payment proof)

**Priority:** P0 (critical)
**Source:** gap_analyzer
**Location:** src/integration/

## Problem

The core value proposition of cashu-l402 — using Cashu ecash tokens instead of direct Lightning payment preimages for L402 authentication — has not been started. No source code exists.

The standard L402 flow requires clients to pay a Lightning invoice and present the preimage. The cashu-l402 innovation is to accept a **Cashu ecash token** as the payment proof instead, enabling:
- **Privacy**: The mint cannot link token issuance to API calls (Chaumian blinding)
- **Flexibility**: Tokens can be split, transferred, or held before use
- **Offline capability**: Tokens can be pre-purchased and used later

The integration must:
1. Issue L402 challenges that specify a Cashu token as acceptable payment (instead of/alongside Lightning preimage)
2. Accept and validate Cashu tokens in the `Authorization` header
3. Redeem tokens against the mint (preventing double-spend)
4. Gate API access based on validated token value

**Current state:** No integration code exists anywhere in the project.

## How to Fix

Create `src/integration/` module:

### 1. `src/integration/cashu-l402-middleware.ts` — Combined middleware
```typescript
import { CashuClient } from '../cashu/client';
import { l402Middleware } from '../l402/middleware';

export interface CashuL402Config {
  mintUrl: string;       // Cashu mint URL
  requiredAmount: number; // sats required for access
  trustedMints: string[]; // Allowed mints
}

export function cashuL402Middleware(config: CashuL402Config) {
  const cashuClient = new CashuClient(config.mintUrl);

  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];

    // Check for Cashu token in Authorization header
    // Format: "Cashu <encoded_token>" or "L402 <macaroon>:<cashu_token>"
    if (authHeader?.startsWith('Cashu ')) {
      const encodedToken = authHeader.slice(6);
      try {
        const { amount, valid } = await cashuClient.redeemToken(encodedToken);
        if (valid && amount >= config.requiredAmount) {
          return next();
        }
        return res.status(402).json({ error: 'Insufficient token value' });
      } catch (err) {
        return res.status(401).json({ error: 'Invalid Cashu token' });
      }
    }

    // Fall back to standard L402 challenge if no Cashu token
    const cashuMintQuote = await cashuClient.getMintQuote(config.requiredAmount);
    res.status(402)
      .set('WWW-Authenticate', `Cashu mint="${config.mintUrl}", amount="${config.requiredAmount}"`)
      .json({
        error: 'Payment required',
        paymentMethods: {
          cashu: { mintUrl: config.mintUrl, amount: config.requiredAmount },
        }
      });
  };
}
```

### 2. `src/integration/token-registry.ts` — Spent token tracking
- Track spent Cashu tokens to prevent double-spend
- Use in-memory store (Map) initially, with Redis/DB as extension point
- TTL-based expiry for spent token records

### 3. `src/integration/config.ts` — Configuration management
- Load mint URLs from environment variables
- Configure required payment amounts per route
- Validate trusted mint list

### 4. `src/index.ts` — Wire everything together
```typescript
import express from 'express';
import { cashuL402Middleware } from './integration/cashu-l402-middleware';

const app = express();
app.use(express.json());

// Protected route example
app.get('/api/data', cashuL402Middleware({
  mintUrl: process.env.CASHU_MINT_URL || 'https://mint.minibits.cash/Bitcoin',
  requiredAmount: 10, // 10 sats
  trustedMints: ['https://mint.minibits.cash/Bitcoin'],
}), (req, res) => {
  res.json({ data: 'Protected content', success: true });
});

app.listen(3000, () => console.log('cashu-l402 server running on port 3000'));
```

## Acceptance Criteria

- [ ] `src/integration/cashu-l402-middleware.ts` exists and combines Cashu + L402
- [ ] Server returns `402` with Cashu payment instructions for unauthenticated requests
- [ ] Server accepts valid Cashu tokens in Authorization header and grants access
- [ ] Redeems tokens against the mint (double-spend prevention)
- [ ] Tokens with insufficient value are rejected with appropriate error
- [ ] Spent token tracking prevents replay attacks
- [ ] `src/index.ts` demonstrates a working protected API endpoint
- [ ] Integration tests cover full request-payment-access flow
- [ ] Environment variable configuration works (`CASHU_MINT_URL`, `REQUIRED_SATS`)
- [ ] No regressions introduced

## Dependencies

- Requires task 001 (project scaffolding) to be completed first
- Requires task 002 (Cashu ecash integration) to be completed first
- Requires task 003 (L402 middleware) to be completed first

## Notes

_Generated from gap_analyzer findings. This is the core value-add of the project — privacy-preserving API monetization using Cashu ecash instead of bare Lightning preimages._
