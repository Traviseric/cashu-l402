import { Request, Response, NextFunction } from 'express';
import { CashuClient } from '../cashu/client';
import { validateToken } from '../cashu/validation';
import { TokenRegistry } from './token-registry';
import type { CashuL402Config } from './config';

export { CashuL402Config };

/**
 * Express middleware that gates access behind a Cashu ecash payment.
 *
 * ## Request flow
 *
 * ### Unauthenticated request
 * - Returns `402 Payment Required` with a `WWW-Authenticate: Cashu …` header
 *   and a JSON body describing how to obtain a token from the configured mint.
 *
 * ### Authenticated request (`Authorization: Cashu <encoded_token>`)
 * 1. Validates token format, mint trust, and value (offline — no network call).
 * 2. Checks the local `TokenRegistry` to catch immediate replay attempts.
 * 3. Redeems the token against the mint (swaps proofs — the mint enforces
 *    double-spend prevention atomically at this step).
 * 4. Marks the token in the local registry as an extra guard.
 * 5. Calls `next()` on success, or returns `401`/`402` on failure.
 *
 * @param config - Mint URL, required amount, trusted mints, and optional registry.
 * @param registry - Optional external TokenRegistry (useful for sharing across routes).
 */
export function cashuL402Middleware(
  config: CashuL402Config,
  registry?: TokenRegistry
) {
  const client = new CashuClient(config.mintUrl);
  const tokenRegistry = registry ?? new TokenRegistry(config.tokenTtlMs);
  const trustedMints = config.trustedMints ?? [config.mintUrl];

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers['authorization'];

    if (authHeader?.startsWith('Cashu ')) {
      const encodedToken = authHeader.slice(6).trim();

      // 1. Offline validation: format, mint trust, amount
      const validation = validateToken(encodedToken, trustedMints);
      if (!validation.valid) {
        res.status(401).json({ error: validation.error ?? 'Invalid Cashu token' });
        return;
      }

      if (validation.amount < config.requiredAmount) {
        res.status(402).json({
          error: 'Insufficient token value',
          required: config.requiredAmount,
          provided: validation.amount,
        });
        return;
      }

      // 2. Local registry — reject immediately if already recorded as spent
      if (tokenRegistry.isSpent(encodedToken)) {
        res.status(401).json({ error: 'Token already spent' });
        return;
      }

      // 3. Redeem with mint (enforces double-spend at the cryptographic level)
      try {
        await client.redeemToken(encodedToken);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Token redemption failed';
        res.status(401).json({ error: message });
        return;
      }

      // 4. Record spent locally so subsequent in-flight requests are rejected fast
      tokenRegistry.markSpent(encodedToken);

      next();
      return;
    }

    // No Cashu token — issue a 402 payment challenge
    res
      .status(402)
      .set(
        'WWW-Authenticate',
        `Cashu mint="${config.mintUrl}", amount="${config.requiredAmount}"`
      )
      .json({
        error: 'Payment Required',
        paymentMethods: {
          cashu: {
            mintUrl: config.mintUrl,
            amount: config.requiredAmount,
          },
        },
      });
  };
}
