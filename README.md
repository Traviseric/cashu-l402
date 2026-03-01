# cashu-l402

Privacy-preserving API monetization using [Cashu ecash](https://cashu.space) tokens with the [L402](https://docs.lightning.engineering/the-lightning-network/l402) (HTTP 402 Payment Required) protocol.

## What is cashu-l402?

cashu-l402 is a Node.js/TypeScript library and server that enables **Lightning-gated API access** using Cashu ecash tokens as payment proof. Instead of requiring clients to present a raw Lightning payment preimage (which can be traced), clients present a **Cashu ecash token** — providing strong privacy guarantees via Chaumian blinding.

### Why Cashu instead of bare Lightning preimages?

| Feature | Standard L402 (Lightning preimage) | cashu-l402 (Cashu token) |
|---|---|---|
| Privacy | Mint/LSP can link payment to API call | Blinded signatures: mint cannot link issuance to redemption |
| Flexibility | One-shot — preimage used once | Tokens can be split, transferred, held |
| Offline use | Requires live Lightning connection | Tokens pre-purchased, used later |
| Fungibility | Per-payment secrets | Reusable token denominations |

## How it Works

### Standard L402 Flow
```
Client → GET /api/data → Server returns 402 + invoice
Client → pays Lightning invoice → gets preimage
Client → GET /api/data (Authorization: L402 macaroon:preimage) → 200 OK
```

### cashu-l402 Flow
```
Client → GET /api/data → Server returns 402 + mint URL + required amount
Client → mints Cashu tokens from trusted mint (or has tokens already)
Client → GET /api/data (Authorization: Cashu <encoded_token>) → 200 OK
Server → redeems token against mint (double-spend prevention) → grants access
```

## Installation

```bash
npm install cashu-l402
```

Or clone and run locally:

```bash
git clone https://github.sleep.example/cashu-l402
cd cashu-l402
npm install
```

## Quick Start

### Protect an Express route with Cashu payment

```typescript
import express from 'express';
import { cashuL402Middleware } from './integration/cashu-l402-middleware';

const app = express();
app.use(express.json());

// Protected route — requires valid Cashu token worth >= 10 sats
app.get('/api/data', cashuL402Middleware({
  mintUrl: process.env.CASHU_MINT_URL || 'https://mint.minibits.cash/Bitcoin',
  requiredAmount: 10, // 10 sats
  trustedMints: ['https://mint.minibits.cash/Bitcoin'],
}), (req, res) => {
  res.json({ data: 'Protected content', success: true });
});

app.listen(3000, () => console.log('cashu-l402 server running on port 3000'));
```

### Client usage

**Step 1 — Request the resource (will receive 402):**
```bash
curl http://localhost:3000/api/data
# HTTP 402 Payment Required
# {
#   "error": "Payment required",
#   "paymentMethods": {
#     "cashu": { "mintUrl": "https://mint.minibits.cash/Bitcoin", "amount": 10 }
#   }
# }
```

**Step 2 — Obtain a Cashu token from the mint (using cashu-ts or any Cashu wallet):**
```typescript
import { CashuMint, CashuWallet } from '@cashu/cashu-ts';

const mint = new CashuMint('https://mint.minibits.cash/Bitcoin');
const wallet = new CashuWallet(mint);
const { proofs } = await wallet.mintTokens(10, invoicePaymentHash);
const encodedToken = wallet.encodeToken({ token: [{ mint: mint.mintUrl, proofs }] });
```

**Step 3 — Use the token to access the resource:**
```bash
curl -H "Authorization: Cashu <encoded_token>" http://localhost:3000/api/data
# HTTP 200 OK
# { "data": "Protected content", "success": true }
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CASHU_MINT_URL` | `https://mint.minibits.cash/Bitcoin` | URL of the trusted Cashu mint |
| `REQUIRED_SATS` | `10` | Minimum token value (satoshis) to access protected routes |
| `PORT` | `3000` | HTTP server port |

### `cashuL402Middleware(config)` Options

```typescript
interface CashuL402Config {
  mintUrl: string;        // Cashu mint URL to issue challenges and verify tokens against
  requiredAmount: number; // Minimum satoshi value required for access
  trustedMints: string[]; // Whitelist of accepted mint URLs (tokens from other mints rejected)
}
```

## API Reference

### `cashuL402Middleware(config: CashuL402Config)`

Express middleware factory. Returns middleware that:
- Checks the `Authorization` header for a valid Cashu token
- Returns `402 Payment Required` with payment instructions if no token is present
- Redeems the token against the mint to prevent double-spend
- Calls `next()` if the token is valid and meets the required amount
- Returns `401 Unauthorized` for invalid tokens
- Returns `402 Payment Required` for tokens with insufficient value

### `l402Middleware(config: L402Config)`

Lower-level Express middleware for standard L402 (Lightning preimage) authentication.

```typescript
interface L402Config {
  price: number;         // Required payment amount in satoshis
  description?: string;  // Human-readable description of what is being purchased
  expirySeconds?: number; // Invoice/challenge expiry time
}
```

### Types

```typescript
// Cashu token representation
interface CashuToken {
  token: string;  // Encoded token string (cashuA...)
  mint: string;   // Mint URL
  amount: number; // Token value in satoshis
  unit: string;   // Token unit (e.g., "sat")
}

// L402 challenge (issued as HTTP 402 response)
interface L402Challenge {
  macaroon: string;  // Macaroon credential
  invoice: string;   // BOLT11 Lightning invoice
  amount: number;    // Required payment amount
}
```

## Protocol Details

### Authorization Header Formats

**Cashu token (this library's primary flow):**
```
Authorization: Cashu cashuAeyJ0...
```

**Standard L402 (also supported):**
```
Authorization: L402 <macaroon_hex>:<preimage_hex>
```

### HTTP 402 Response Format

When a client accesses a protected route without a valid token, the server returns:

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
WWW-Authenticate: Cashu mint="https://mint.minibits.cash/Bitcoin", amount="10"

{
  "error": "Payment required",
  "paymentMethods": {
    "cashu": {
      "mintUrl": "https://mint.minibits.cash/Bitcoin",
      "amount": 10
    }
  }
}
```

## Development

```bash
# Start development server with hot reload
npm run dev

# Build TypeScript to JavaScript
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint
npm run lint
```

## Related Projects

- **[@cashu/cashu-ts](https://github.com/cashubtc/cashu-ts)** — TypeScript Cashu wallet SDK used by this library
- **[Cashu NUTs](https://github.com/cashubtc/nuts)** — Cashu protocol specification (Notation, Usage, Terminology)
- **[L402 Protocol](https://docs.lightning.engineering/the-lightning-network/l402)** — HTTP 402 Payment Required specification by Lightning Labs
- **[cashu.space](https://cashu.space)** — Cashu ecash protocol overview and ecosystem
- **[nutshell](https://github.com/cashubtc/nutshell)** — Python reference Cashu mint implementation

## License

MIT
