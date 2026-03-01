import { verifyMacaroon, verifyPreimage } from './macaroon';
import type { L402Credentials, MacaroonData } from './types';

/**
 * Parse an Authorization header value of the form:
 *   L402 <macaroon_base64url>:<preimage_hex>
 *
 * Returns null if the header is absent or malformed.
 */
export function parseL402Header(authHeader: string | undefined): L402Credentials | null {
  if (!authHeader || !authHeader.startsWith('L402 ')) {
    return null;
  }

  const credentials = authHeader.slice(5).trim();
  const colonIdx = credentials.indexOf(':');
  if (colonIdx === -1) {
    return null;
  }

  const macaroon = credentials.slice(0, colonIdx);
  const preimage = credentials.slice(colonIdx + 1);

  if (!macaroon || !preimage) {
    return null;
  }

  return { macaroon, preimage };
}

/**
 * Verify L402 credentials:
 * 1. Decode and verify the macaroon signature (HMAC check).
 * 2. Confirm the macaroon is not expired.
 * 3. Verify sha256(preimage) == paymentHash embedded in the macaroon.
 *
 * Returns the macaroon data on success, throws on failure.
 */
export function verifyL402Credentials(
  macaroon: string,
  preimage: string,
  secret: string
): MacaroonData {
  // Throws if signature invalid or expired
  const data = verifyMacaroon(macaroon, secret);

  if (!verifyPreimage(data.paymentHash, preimage)) {
    throw new Error('Preimage does not satisfy payment hash');
  }

  return data;
}
