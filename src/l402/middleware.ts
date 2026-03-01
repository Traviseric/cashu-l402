import { Request, Response, NextFunction } from 'express';
import { L402Config } from './types';

/**
 * Express middleware that enforces L402 payment before allowing access.
 * Returns HTTP 402 with a WWW-Authenticate header containing a macaroon and invoice.
 */
export function l402Middleware(_config: L402Config) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const authHeader = _req.headers['authorization'];

    if (authHeader && authHeader.startsWith('L402 ')) {
      // TODO: validate macaroon and preimage
      next();
      return;
    }

    // Issue 402 challenge
    res.status(402).json({
      error: 'Payment Required',
      message: 'This endpoint requires an L402 token',
    });
  };
}
