# @te-btc/cashu-l402

Cashu ecash ↔ L402 settlement bridge. Atomic exchange between Cashu proofs and L402 access tokens.

## What

Framework-agnostic TypeScript library for gating API endpoints behind Bitcoin micropayments. Supports both:

- **L402** — Lightning invoice + macaroon token flow (HTTP 402)
- **Cashu NUT-24** — Ecash proof payment (blinded, instant, no LN round-trip)
- **Dual challenge** — Offer both payment methods simultaneously
- **Spending conditions** — Detect NUT-10/11/14 conditions (P2PK, HTLCs, time-locks, proof-of-service)

## Install

```bash
npm install @te-btc/cashu-l402
```

## Quick Start

### Server — Gate an endpoint

```typescript
import {
  createL402Challenge,
  verifyCashuPayment,
  detectPaymentMethod,
  buildDualChallenge,
} from '@te-btc/cashu-l402';

// In your route handler (Fastify, Express, Hono, etc.)
async function premiumEndpoint(req, res) {
  const auth = req.headers.authorization;
  const { method, token } = detectPaymentMethod(auth);

  if (method === 'cashu' && token) {
    const result = await verifyCashuPayment(token, {
      priceSats: 100,
      mintUrl: 'https://mint.example.com',
    });
    if (result.paid) return { data: 'premium content' };
  }

  // Issue 402 challenge
  const headers = buildDualChallenge({ priceSats: 100, mintUrl: 'https://mint.example.com' });
  res.status(402).headers(headers).send({ error: 'Payment required' });
}
```

### Client — Auto-pay with L402

```typescript
import { l402Fetch } from '@te-btc/cashu-l402';

// Provide your own Lightning payment function
const payInvoice = async (bolt11: string) => {
  const result = await myLndClient.sendPayment(bolt11);
  return { preimage: result.preimage, feeSats: result.fee };
};

// Fetch with automatic 402 handling
const response = await l402Fetch(
  'https://api.example.com/premium',
  payInvoice,
  {},
  1000, // max 1000 sats
);
```

## API

### Cashu Paywall (NUT-24)

| Function | Description |
|----------|-------------|
| `parseCashuAuthHeader(header)` | Extract token from `Cashu <token>` header |
| `buildCashuChallenge(config)` | Build `WWW-Authenticate` challenge |
| `verifyCashuPayment(token, config)` | Full verification + double-spend prevention |
| `detectPaymentMethod(header)` | Detect L402 vs Cashu vs none |
| `buildDualChallenge(config, l402?)` | Both challenges in one 402 response |

### L402 Server

| Function | Description |
|----------|-------------|
| `createL402Challenge(params)` | Generate macaroon + request invoice |
| `verifyL402Token(params)` | Verify macaroon signature + preimage |
| `signMacaroon(payload, rootKey)` | HMAC-SHA256 sign a macaroon |
| `verifyMacaroon(token, rootKey)` | Verify macaroon (timing-safe) |
| `verifyPreimage(preimage, rHash)` | SHA-256 preimage check (constant-time) |

### L402 Client

| Function | Description |
|----------|-------------|
| `parseL402Challenge(header)` | Parse macaroon + invoice from WWW-Authenticate |
| `buildL402Header(token)` | Build `L402 <mac>:<preimage>` header |
| `l402Fetch(url, payFn, opts?, max?)` | Auto-pay fetch with token caching |

### Spending Conditions

| Function | Description |
|----------|-------------|
| `parseNut10Secret(secret)` | Parse NUT-10 well-known secret format |
| `detectConditions(proof)` | Detect P2PK, HTLC, PoS, time-locks on a proof |
| `extractConditionCaveats(info)` | Convert conditions to macaroon caveats |
| `prevalidateCondition(proof, time?)` | Client-side locktime validation |

### Spend Router

| Function | Description |
|----------|-------------|
| `routePayment(params)` | Choose optimal backend (cashu/lightning/fedimint) |

## Ecosystem Positioning

This library occupies a unique niche — no standalone TypeScript L402+Cashu bridge exists.

| | @te-btc/cashu-l402 | x402 (Coinbase/Stripe) | aperture (Lightning Labs) |
|---|---|---|---|
| Settlement | Cashu ecash (blinded, instant) + Lightning fallback | USDC on EVM L2s | Lightning only |
| Privacy | Blinded bearer proofs (NUT-12 DLEQ) | On-chain (transparent) | Invoice-linked |
| Offline capable | Yes (P2PK+DLEQ local verification) | No (on-chain settlement) | No (LN routing required) |
| Spending conditions | NUT-10/11/14 (P2PK, HTLC, PoS, escrow) | None | Macaroon caveats only |
| Language | TypeScript (Node.js) | TypeScript + Go | Go |

**Complements Lightning Agent Tools** (Lightning Labs, Feb 2026) — agents use their MCP server for LN reconnaissance, our library for Cashu settlement. **Validates Fewsats pattern** — policy engine + L402 for safe agent payments. **Ahead of NIST** — AI Agent Standards Initiative (early 2026) is formalizing the security controls this library already implements.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to dist/ |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Run test suite |
| `npm run lint` | Lint with Biome |

## License

MIT
