import request from 'supertest';
import express from 'express';
import { createHash } from 'crypto';
import { l402Middleware } from '../l402/middleware';
import { generateMacaroon, verifyMacaroon, verifyPreimage, randomPaymentHash } from '../l402/macaroon';
import { parseL402Header, verifyL402Credentials } from '../l402/verification';

const TEST_SECRET = 'test-server-secret-32-bytes-long!!';

// Build a valid preimage + paymentHash pair
function makePayment(): { preimage: string; paymentHash: string } {
  const preimage = randomPaymentHash(); // 32 random bytes hex
  const paymentHash = createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');
  return { preimage, paymentHash };
}

// Build a test Express app protected by l402Middleware
function makeApp(price = 10) {
  const app = express();
  app.use(express.json());

  const mockGenerateInvoice = jest.fn().mockImplementation(async () => {
    const { preimage, paymentHash } = makePayment();
    return { invoice: `lnbc${price}n1test_${preimage.slice(0, 8)}`, paymentHash };
  });

  app.get(
    '/protected',
    l402Middleware({
      price,
      description: 'Test endpoint',
      secret: TEST_SECRET,
      generateInvoice: mockGenerateInvoice,
    }),
    (_req, res) => res.json({ data: 'secret', success: true })
  );

  return { app, mockGenerateInvoice };
}

// ─── Macaroon unit tests ──────────────────────────────────────────────────────

describe('generateMacaroon / verifyMacaroon', () => {
  it('round-trips a macaroon with correct data', () => {
    const { paymentHash } = makePayment();
    const mac = generateMacaroon(paymentHash, 10, TEST_SECRET, 3600);
    const data = verifyMacaroon(mac, TEST_SECRET);

    expect(data.paymentHash).toBe(paymentHash);
    expect(data.amount).toBe(10);
    expect(data.expiry).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects a tampered macaroon', () => {
    const { paymentHash } = makePayment();
    const mac = generateMacaroon(paymentHash, 10, TEST_SECRET);
    const tampered = mac.slice(0, -4) + 'aaaa';
    expect(() => verifyMacaroon(tampered, TEST_SECRET)).toThrow('Invalid macaroon signature');
  });

  it('rejects a macaroon signed with wrong secret', () => {
    const { paymentHash } = makePayment();
    const mac = generateMacaroon(paymentHash, 10, 'wrong-secret');
    expect(() => verifyMacaroon(mac, TEST_SECRET)).toThrow('Invalid macaroon signature');
  });

  it('rejects an expired macaroon', () => {
    const { paymentHash } = makePayment();
    // expirySeconds = -1 forces immediate expiry
    const mac = generateMacaroon(paymentHash, 10, TEST_SECRET, -1);
    expect(() => verifyMacaroon(mac, TEST_SECRET)).toThrow('expired');
  });

  it('rejects non-base64url garbage', () => {
    expect(() => verifyMacaroon('not.a.real.macaroon', TEST_SECRET)).toThrow();
  });
});

describe('verifyPreimage', () => {
  it('accepts a valid preimage for its payment hash', () => {
    const { preimage, paymentHash } = makePayment();
    expect(verifyPreimage(paymentHash, preimage)).toBe(true);
  });

  it('rejects a wrong preimage', () => {
    const { paymentHash } = makePayment();
    const { preimage: wrongPreimage } = makePayment();
    expect(verifyPreimage(paymentHash, wrongPreimage)).toBe(false);
  });

  it('rejects non-hex input without throwing', () => {
    expect(verifyPreimage('deadbeef'.repeat(8), 'not-hex!!!')).toBe(false);
  });
});

// ─── Verification unit tests ─────────────────────────────────────────────────

describe('parseL402Header', () => {
  it('returns null for missing header', () => {
    expect(parseL402Header(undefined)).toBeNull();
  });

  it('returns null for wrong scheme', () => {
    expect(parseL402Header('Bearer token123')).toBeNull();
  });

  it('returns null for missing colon separator', () => {
    expect(parseL402Header('L402 macaroon_only')).toBeNull();
  });

  it('parses a well-formed L402 header', () => {
    const result = parseL402Header('L402 mac123:preimage456');
    expect(result).toEqual({ macaroon: 'mac123', preimage: 'preimage456' });
  });
});

describe('verifyL402Credentials', () => {
  it('verifies valid credentials end-to-end', () => {
    const { preimage, paymentHash } = makePayment();
    const mac = generateMacaroon(paymentHash, 10, TEST_SECRET);
    const data = verifyL402Credentials(mac, preimage, TEST_SECRET);
    expect(data.paymentHash).toBe(paymentHash);
  });

  it('throws on wrong preimage', () => {
    const { paymentHash } = makePayment();
    const { preimage: wrongPreimage } = makePayment();
    const mac = generateMacaroon(paymentHash, 10, TEST_SECRET);
    expect(() => verifyL402Credentials(mac, wrongPreimage, TEST_SECRET)).toThrow('Preimage');
  });
});

// ─── Middleware HTTP integration tests ───────────────────────────────────────

describe('L402 middleware', () => {
  it('returns 402 with WWW-Authenticate header when no auth provided', async () => {
    const { app } = makeApp(10);
    const res = await request(app).get('/protected');

    expect(res.status).toBe(402);
    expect(res.headers['www-authenticate']).toMatch(/^L402 macaroon="[^"]+", invoice="[^"]+"/);
    expect(res.body).toHaveProperty('macaroon');
    expect(res.body).toHaveProperty('invoice');
    expect(res.body.amount).toBe(10);
  });

  it('returns 401 for an invalid macaroon', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'L402 notamacaroon:notapreimage');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 for wrong preimage with valid macaroon', async () => {
    const { preimage: wrongPreimage } = makePayment();
    const { paymentHash } = makePayment();
    const mac = generateMacaroon(paymentHash, 10, TEST_SECRET);

    const { app } = makeApp();
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `L402 ${mac}:${wrongPreimage}`);

    expect(res.status).toBe(401);
  });

  it('returns 200 and calls next() for valid L402 credentials', async () => {
    const { preimage, paymentHash } = makePayment();
    const mac = generateMacaroon(paymentHash, 10, TEST_SECRET, 3600);

    const { app } = makeApp();
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `L402 ${mac}:${preimage}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: 'secret', success: true });
  });

  it('returns 401 for an expired macaroon', async () => {
    const { preimage, paymentHash } = makePayment();
    const expiredMac = generateMacaroon(paymentHash, 10, TEST_SECRET, -1);

    const { app } = makeApp();
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `L402 ${expiredMac}:${preimage}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
  });

  it('calls verifyPayment if provided and returns 401 when it fails', async () => {
    const { preimage, paymentHash } = makePayment();
    const mac = generateMacaroon(paymentHash, 10, TEST_SECRET);

    const app = express();
    app.use(express.json());
    const mockVerify = jest.fn().mockResolvedValue(false);

    app.get(
      '/protected',
      l402Middleware({
        price: 10,
        secret: TEST_SECRET,
        generateInvoice: async () => ({ invoice: 'lnbc10n1test', paymentHash }),
        verifyPayment: mockVerify,
      }),
      (_req, res) => res.json({ ok: true })
    );

    const res = await request(app)
      .get('/protected')
      .set('Authorization', `L402 ${mac}:${preimage}`);

    expect(res.status).toBe(401);
    expect(mockVerify).toHaveBeenCalledWith(paymentHash, preimage);
  });
});
