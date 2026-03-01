import { createHmac, timingSafeEqual, createHash, randomBytes } from 'crypto';
import type { MacaroonData } from './types';

const SEPARATOR = '.';

/**
 * Generate an HMAC-SHA256 macaroon encoding a payment hash, amount, and expiry.
 *
 * Format (base64url):  <identifier>.<hmac_hex>
 * where identifier is: <paymentHash>:<amount>:<expiryTimestamp>
 */
export function generateMacaroon(
  paymentHash: string,
  amount: number,
  secret: string,
  expirySeconds = 3600
): string {
  const expiry = Math.floor(Date.now() / 1000) + expirySeconds;
  const identifier = `${paymentHash}:${amount}:${expiry}`;
  const mac = createHmac('sha256', secret).update(identifier).digest('hex');
  const raw = `${identifier}${SEPARATOR}${mac}`;
  return Buffer.from(raw).toString('base64url');
}

/**
 * Decode and verify a macaroon. Returns the embedded data if valid.
 * Throws if the signature is invalid or the macaroon is expired.
 */
export function verifyMacaroon(encodedMacaroon: string, secret: string): MacaroonData {
  let raw: string;
  try {
    raw = Buffer.from(encodedMacaroon, 'base64url').toString('utf8');
  } catch {
    throw new Error('Invalid macaroon encoding');
  }

  const dotIndex = raw.lastIndexOf(SEPARATOR);
  if (dotIndex === -1) {
    throw new Error('Malformed macaroon: missing signature separator');
  }

  const identifier = raw.slice(0, dotIndex);
  const providedMac = raw.slice(dotIndex + 1);

  // Constant-time signature check
  const expectedMac = createHmac('sha256', secret).update(identifier).digest('hex');
  const expected = Buffer.from(expectedMac, 'hex');
  const provided = Buffer.from(providedMac, 'hex');
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new Error('Invalid macaroon signature');
  }

  const parts = identifier.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed macaroon identifier');
  }

  const [paymentHash, amountStr, expiryStr] = parts;
  const amount = parseInt(amountStr, 10);
  const expiry = parseInt(expiryStr, 10);

  if (isNaN(amount) || isNaN(expiry)) {
    throw new Error('Malformed macaroon: invalid amount or expiry');
  }

  if (Math.floor(Date.now() / 1000) > expiry) {
    throw new Error('Macaroon has expired');
  }

  return { paymentHash, amount, expiry };
}

/**
 * Verify that hex-encoded preimage satisfies the paymentHash
 * (i.e. SHA-256(preimage_bytes) == paymentHash_bytes).
 */
export function verifyPreimage(paymentHash: string, preimage: string): boolean {
  try {
    const preimageBytes = Buffer.from(preimage, 'hex');
    const hash = createHash('sha256').update(preimageBytes).digest('hex');
    const hashBuf = Buffer.from(hash, 'hex');
    const expectedBuf = Buffer.from(paymentHash, 'hex');
    if (hashBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(hashBuf, expectedBuf);
  } catch {
    return false;
  }
}

/** Generate a random hex payment hash (for testing / mock invoices). */
export function randomPaymentHash(): string {
  return randomBytes(32).toString('hex');
}
