import { Request, Response, NextFunction } from 'express';
import { generateMacaroon } from './macaroon';
import { parseL402Header, verifyL402Credentials } from './verification';
import type { L402Config } from './types';

const DEFAULT_EXPIRY_SECONDS = 3600;

/**
 * Express middleware that enforces L402 payment before allowing access.
 *
 * Flow:
 *  1. No Authorization header → respond 402 with WWW-Authenticate challenge
 *  2. Authorization: L402 <macaroon>:<preimage> → verify credentials
 *     - Valid → call next()
 *     - Invalid → respond 401
 */
export function l402Middleware(config: L402Config) {
  const secret = config.secret ?? process.env['L402_SECRET'] ?? 'changeme-set-L402_SECRET';
  const expirySeconds = config.expirySeconds ?? DEFAULT_EXPIRY_SECONDS;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers['authorization'];
    const credentials = parseL402Header(authHeader);

    // No credentials — issue a 402 challenge
    if (!credentials) {
      let invoice: string;
      let paymentHash: string;
      try {
        const result = await config.generateInvoice(config.price, config.description);
        invoice = result.invoice;
        paymentHash = result.paymentHash;
      } catch (err) {
        res.status(500).json({ error: 'Failed to generate invoice' });
        return;
      }

      const macaroon = generateMacaroon(paymentHash, config.price, secret, expirySeconds);

      res.status(402)
        .set('WWW-Authenticate', `L402 macaroon="${macaroon}", invoice="${invoice}"`)
        .json({
          error: 'Payment Required',
          macaroon,
          invoice,
          amount: config.price,
        });
      return;
    }

    // Credentials present — verify them
    try {
      const macaroonData = verifyL402Credentials(credentials.macaroon, credentials.preimage, secret);

      // Optionally run caller-supplied payment verification (e.g. check node)
      if (config.verifyPayment) {
        const ok = await config.verifyPayment(macaroonData.paymentHash, credentials.preimage);
        if (!ok) {
          res.status(401).json({ error: 'Payment verification failed' });
          return;
        }
      }

      next();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid L402 credentials';
      res.status(401).json({ error: message });
    }
  };
}
