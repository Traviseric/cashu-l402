import { getDecodedToken, getTokenMetadata } from '@cashu/cashu-ts';

export interface TokenValidationResult {
  valid: boolean;
  amount: number;
  mint: string;
  unit: string;
  error?: string;
}

/**
 * Validates a Cashu token: checks format, decodeability, and optionally trusted mints.
 */
export function validateToken(
  encodedToken: string,
  trustedMints?: string[]
): TokenValidationResult {
  if (!encodedToken || typeof encodedToken !== 'string') {
    return { valid: false, amount: 0, mint: '', unit: '', error: 'Token must be a non-empty string' };
  }

  // Must start with cashu (cashuA or cashuB prefix)
  if (!encodedToken.startsWith('cashu')) {
    return { valid: false, amount: 0, mint: '', unit: '', error: 'Token must start with "cashu"' };
  }

  let metadata: { amount: number; mint: string; unit: string };
  try {
    metadata = getTokenMetadata(encodedToken);
  } catch (err) {
    return { valid: false, amount: 0, mint: '', unit: '', error: 'Failed to decode token: invalid format' };
  }

  // Verify we can also fully decode it
  try {
    getDecodedToken(encodedToken);
  } catch (err) {
    return { valid: false, amount: 0, mint: '', unit: '', error: 'Token decoding failed' };
  }

  const { amount, mint, unit } = metadata;

  if (!mint) {
    return { valid: false, amount: 0, mint: '', unit: '', error: 'Token has no mint URL' };
  }

  if (amount <= 0) {
    return { valid: false, amount: 0, mint, unit, error: 'Token amount must be positive' };
  }

  // Check trusted mints if provided
  if (trustedMints && trustedMints.length > 0) {
    const mintUrl = mint.replace(/\/$/, '');
    const trusted = trustedMints.some(
      (m) => m.replace(/\/$/, '') === mintUrl
    );
    if (!trusted) {
      return {
        valid: false,
        amount,
        mint,
        unit,
        error: `Mint "${mint}" is not in the trusted mints list`,
      };
    }
  }

  return { valid: true, amount, mint, unit };
}
