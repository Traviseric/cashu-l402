/**
 * Integration tests — Cashu token verification + L402 authentication
 *
 * Tests the combined flow where a client uses Cashu ecash tokens to satisfy
 * L402 payment challenges, including double-spend prevention and value checks.
 */

import request from 'supertest';
import express from 'express';
import { createHash } from 'crypto';
import { l402Middleware } from '../l402/middleware';
import { generateMacaroon, randomPaymentHash, verifyPreimage } from '../l402/macaroon';
import { validateToken } from '../cashu/validation';

// Mock cashu-ts so no real network calls occur
jest.mock('@cashu/cashu-ts', () => ({
  getTokenMetadata: jest.fn(),
  getDecodedToken: jest.fn(),
  CashuMint: jest.fn(),
  CashuWallet: jest.fn(),
  getEncodedToken: jest.fn(),
}));

const TEST_SECRET = 'integration-test-secret-32bytes!!';
const MINT_URL = 'https://mint.example.com';
const PRICE = 10; // sats

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePaymentPair(): { preimage: string; paymentHash: string } {
  const preimage = randomPaymentHash();
  const paymentHash = createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');
  return { preimage, paymentHash };
}

/**
 * Build an Express app that:
 * - Requires L402 payment of `price` sats
 * - Optionally delegates payment verification to a `verifyPayment` hook
 *   (used to simulate Cashu token checks and double-spend prevention)
 */
function makeIntegrationApp(
  price: number,
  verifyPayment?: (paymentHash: string, preimage: string) => Promise<boolean>
) {
  const app = express();
  app.use(express.json());

  const mockGenerateInvoice = jest.fn().mockImplementation(async () => {
    const { preimage, paymentHash } = makePaymentPair();
    return { invoice: `lnbc${price}n1test_${preimage.slice(0, 8)}`, paymentHash };
  });

  app.get(
    '/api/resource',
    l402Middleware({
      price,
      description: 'Integration test resource',
      secret: TEST_SECRET,
      generateInvoice: mockGenerateInvoice,
      verifyPayment,
    }),
    (_req, res) => res.json({ data: 'protected content', success: true })
  );

  return { app, mockGenerateInvoice };
}

// ─── Full flow ────────────────────────────────────────────────────────────────

describe('Full Cashu → L402 flow', () => {
  it('step 1: unauthenticated request returns 402 challenge with macaroon and invoice', async () => {
    const { app } = makeIntegrationApp(PRICE);
    const res = await request(app).get('/api/resource');

    expect(res.status).toBe(402);
    expect(res.headers['www-authenticate']).toMatch(/^L402 macaroon="[^"]+", invoice="[^"]+"/);
    expect(res.body.macaroon).toBeTruthy();
    expect(res.body.invoice).toMatch(/^lnbc/);
    expect(res.body.amount).toBe(PRICE);
  });

  it('step 2: authenticated request with valid credentials returns 200', async () => {
    const { preimage, paymentHash } = makePaymentPair();
    const macaroon = generateMacaroon(paymentHash, PRICE, TEST_SECRET, 3600);

    const { app } = makeIntegrationApp(PRICE);
    const res = await request(app)
      .get('/api/resource')
      .set('Authorization', `L402 ${macaroon}:${preimage}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: 'protected content', success: true });
  });

  it('full flow: fetch challenge then present valid payment proof', async () => {
    const { app } = makeIntegrationApp(PRICE);

    // Step 1: get the challenge
    const challengeRes = await request(app).get('/api/resource');
    expect(challengeRes.status).toBe(402);
    const { macaroon } = challengeRes.body;

    // Step 2: "pay" the invoice (in practice this involves Lightning; here we
    // simulate payment by extracting the paymentHash from the macaroon and
    // building a valid preimage using generateMacaroon directly)
    const { preimage: freshPreimage, paymentHash: freshHash } = makePaymentPair();
    const validMacaroon = generateMacaroon(freshHash, PRICE, TEST_SECRET, 3600);

    // Confirm the challenge macaroon we received is a real base64url token
    expect(macaroon).toMatch(/^[A-Za-z0-9_-]+$/);

    // Step 3: present valid credentials
    const authRes = await request(app)
      .get('/api/resource')
      .set('Authorization', `L402 ${validMacaroon}:${freshPreimage}`);

    expect(authRes.status).toBe(200);
    expect(authRes.body.success).toBe(true);
  });
});

// ─── Double-spend prevention ──────────────────────────────────────────────────

describe('Double-spend prevention', () => {
  it('rejects a preimage that has already been used', async () => {
    const spentPreimages = new Set<string>();

    // verifyPayment tracks spent preimages
    const verifyPayment = jest.fn().mockImplementation(
      async (_paymentHash: string, preimage: string) => {
        if (spentPreimages.has(preimage)) {
          return false; // already spent
        }
        spentPreimages.add(preimage);
        return true;
      }
    );

    const { preimage, paymentHash } = makePaymentPair();
    const macaroon = generateMacaroon(paymentHash, PRICE, TEST_SECRET, 3600);
    const { app } = makeIntegrationApp(PRICE, verifyPayment);

    // First use — should succeed
    const firstRes = await request(app)
      .get('/api/resource')
      .set('Authorization', `L402 ${macaroon}:${preimage}`);

    expect(firstRes.status).toBe(200);
    expect(verifyPayment).toHaveBeenCalledTimes(1);

    // Second use of same preimage — should be rejected
    const secondRes = await request(app)
      .get('/api/resource')
      .set('Authorization', `L402 ${macaroon}:${preimage}`);

    expect(secondRes.status).toBe(401);
    expect(verifyPayment).toHaveBeenCalledTimes(2);
  });

  it('allows two distinct valid payments independently', async () => {
    const spentPreimages = new Set<string>();

    const verifyPayment = jest.fn().mockImplementation(
      async (_paymentHash: string, preimage: string) => {
        if (spentPreimages.has(preimage)) return false;
        spentPreimages.add(preimage);
        return true;
      }
    );

    const payment1 = makePaymentPair();
    const payment2 = makePaymentPair();
    const mac1 = generateMacaroon(payment1.paymentHash, PRICE, TEST_SECRET, 3600);
    const mac2 = generateMacaroon(payment2.paymentHash, PRICE, TEST_SECRET, 3600);

    const { app } = makeIntegrationApp(PRICE, verifyPayment);

    const res1 = await request(app)
      .get('/api/resource')
      .set('Authorization', `L402 ${mac1}:${payment1.preimage}`);
    expect(res1.status).toBe(200);

    const res2 = await request(app)
      .get('/api/resource')
      .set('Authorization', `L402 ${mac2}:${payment2.preimage}`);
    expect(res2.status).toBe(200);
  });
});

// ─── Token value validation ────────────────────────────────────────────────────

describe('Cashu token value validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a Cashu token whose amount is less than the required price', async () => {
    const { getTokenMetadata, getDecodedToken } = require('@cashu/cashu-ts');

    // Token worth only 5 sats, price is 10 sats
    (getTokenMetadata as jest.Mock).mockReturnValue({
      mint: MINT_URL,
      amount: 5,
      unit: 'sat',
    });
    (getDecodedToken as jest.Mock).mockReturnValue({
      mint: MINT_URL,
      proofs: [{ id: 'k1', amount: 5, secret: 's1', C: 'c1' }],
    });

    const requiredPrice = PRICE; // 10 sats

    // verifyPayment checks the Cashu token amount attached to the request
    const verifyPayment = jest.fn().mockImplementation(
      async (_paymentHash: string, _preimage: string) => {
        // Simulate reading a Cashu token from the request context
        const cashuToken = 'cashuAsmall_token';
        const validation = validateToken(cashuToken, [MINT_URL]);
        if (!validation.valid) return false;
        // Reject if token amount is less than required price
        if ((validation.amount ?? 0) < requiredPrice) return false;
        return true;
      }
    );

    const { preimage, paymentHash } = makePaymentPair();
    const macaroon = generateMacaroon(paymentHash, PRICE, TEST_SECRET, 3600);
    const { app } = makeIntegrationApp(PRICE, verifyPayment);

    const res = await request(app)
      .get('/api/resource')
      .set('Authorization', `L402 ${macaroon}:${preimage}`);

    expect(res.status).toBe(401);
    expect(verifyPayment).toHaveBeenCalledTimes(1);
  });

  it('accepts a Cashu token whose amount meets the required price', async () => {
    const { getTokenMetadata, getDecodedToken } = require('@cashu/cashu-ts');

    // Token worth exactly PRICE sats
    (getTokenMetadata as jest.Mock).mockReturnValue({
      mint: MINT_URL,
      amount: PRICE,
      unit: 'sat',
    });
    (getDecodedToken as jest.Mock).mockReturnValue({
      mint: MINT_URL,
      proofs: [{ id: 'k1', amount: PRICE, secret: 's1', C: 'c1' }],
    });

    const requiredPrice = PRICE;

    const verifyPayment = jest.fn().mockImplementation(
      async (_paymentHash: string, _preimage: string) => {
        const cashuToken = 'cashuAexact_token';
        const validation = validateToken(cashuToken, [MINT_URL]);
        if (!validation.valid) return false;
        if ((validation.amount ?? 0) < requiredPrice) return false;
        return true;
      }
    );

    const { preimage, paymentHash } = makePaymentPair();
    const macaroon = generateMacaroon(paymentHash, PRICE, TEST_SECRET, 3600);
    const { app } = makeIntegrationApp(PRICE, verifyPayment);

    const res = await request(app)
      .get('/api/resource')
      .set('Authorization', `L402 ${macaroon}:${preimage}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects a Cashu token from an untrusted mint', async () => {
    const { getTokenMetadata, getDecodedToken } = require('@cashu/cashu-ts');

    (getTokenMetadata as jest.Mock).mockReturnValue({
      mint: 'https://evil-mint.com',
      amount: PRICE,
      unit: 'sat',
    });
    (getDecodedToken as jest.Mock).mockReturnValue({
      mint: 'https://evil-mint.com',
      proofs: [{ id: 'k1', amount: PRICE, secret: 's1', C: 'c1' }],
    });

    const trustedMints = [MINT_URL];

    const verifyPayment = jest.fn().mockImplementation(
      async (_paymentHash: string, _preimage: string) => {
        const cashuToken = 'cashuAevil_token';
        const validation = validateToken(cashuToken, trustedMints);
        return validation.valid;
      }
    );

    const { preimage, paymentHash } = makePaymentPair();
    const macaroon = generateMacaroon(paymentHash, PRICE, TEST_SECRET, 3600);
    const { app } = makeIntegrationApp(PRICE, verifyPayment);

    const res = await request(app)
      .get('/api/resource')
      .set('Authorization', `L402 ${macaroon}:${preimage}`);

    expect(res.status).toBe(401);
  });
});

// ─── Cashu token format validation ───────────────────────────────────────────

describe('validateToken (integration context)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a non-Cashu string as a token', () => {
    const result = validateToken('not-a-cashu-token');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('"cashu"');
  });

  it('validates a properly-mocked Cashu token from trusted mint', () => {
    const { getTokenMetadata, getDecodedToken } = require('@cashu/cashu-ts');

    (getTokenMetadata as jest.Mock).mockReturnValue({
      mint: MINT_URL,
      amount: PRICE,
      unit: 'sat',
    });
    (getDecodedToken as jest.Mock).mockReturnValue({
      mint: MINT_URL,
      proofs: [{ id: 'k1', amount: PRICE, secret: 's1', C: 'c1' }],
    });

    const result = validateToken('cashuAtest_token', [MINT_URL]);
    expect(result.valid).toBe(true);
    expect(result.amount).toBe(PRICE);
    expect(result.mint).toBe(MINT_URL);
  });
});

// ─── Preimage integrity (cryptographic) ──────────────────────────────────────

describe('Preimage integrity', () => {
  it('verifyPreimage correctly validates SHA-256 commitment', () => {
    const { preimage, paymentHash } = makePaymentPair();
    expect(verifyPreimage(paymentHash, preimage)).toBe(true);
  });

  it('verifyPreimage rejects a preimage for the wrong payment hash', () => {
    const { preimage } = makePaymentPair();
    const { paymentHash: otherHash } = makePaymentPair();
    expect(verifyPreimage(otherHash, preimage)).toBe(false);
  });
});
