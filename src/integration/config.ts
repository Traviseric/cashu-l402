export interface CashuL402Config {
  /** URL of the trusted Cashu mint (e.g. "https://mint.minibits.cash/Bitcoin"). */
  mintUrl: string;
  /** Minimum token value (in sats) required for access. */
  requiredAmount: number;
  /**
   * Explicit list of trusted mint URLs. Defaults to [mintUrl] when omitted.
   * Tokens from mints not in this list are rejected before any network call.
   */
  trustedMints?: string[];
  /** TTL for the spent-token registry entries (milliseconds). Defaults to 24 h. */
  tokenTtlMs?: number;
}

/**
 * Load CashuL402Config from environment variables.
 * Falls back to sensible defaults when variables are absent.
 */
export function loadConfig(): CashuL402Config {
  const mintUrl =
    process.env['CASHU_MINT_URL'] ?? 'https://mint.minibits.cash/Bitcoin';
  const requiredAmount = parseInt(process.env['REQUIRED_SATS'] ?? '10', 10);

  return {
    mintUrl,
    requiredAmount,
    trustedMints: [mintUrl],
  };
}
