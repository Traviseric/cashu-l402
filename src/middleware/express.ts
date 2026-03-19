/**
 * Express middleware for Cashu L402 payment gating.
 *
 * Uses structural typing — no hard express dependency required.
 * Add `express` to your project's dependencies to use this middleware.
 */
import { verifyCashuPaymentSmart } from '../cashu-paywall.js';
import { createL402Challenge, verifyL402Token } from '../l402-server.js';
import type { BridgeVerifyConfig, CashuPaywallConfig, CreateInvoiceFn } from '../types.js';

/** Minimal structural subset of Express Request used by this middleware. */
interface Request {
	headers: Record<string, string | string[] | undefined>;
	url: string;
}

/** Minimal structural subset of Express Response used by this middleware. */
interface Response {
	status(code: number): this;
	set(key: string, value: string): this;
	json(body: unknown): this;
}

/** Express-style next function. */
type NextFunction = (err?: unknown) => void;

export interface ExpressCashuL402Options extends CashuPaywallConfig {
	/** Root key for signing and verifying macaroons (required) */
	rootKey: string;
	/** Callback to create a Lightning invoice for L402 challenges (required) */
	createInvoice: CreateInvoiceFn;
	/** Resource path used in macaroon caveats (default: request URL) */
	resourcePath?: string;
	/** Optional bridge config for offline DLEQ verification */
	bridgeConfig?: BridgeVerifyConfig;
}

/**
 * Express middleware factory for Cashu L402 payment gating.
 *
 * Checks `Authorization: L402 <macaroon>:<preimage>` and `X-Cashu: <token>` headers.
 * Issues HTTP 402 with `WWW-Authenticate` when neither is present or valid.
 *
 * Usage:
 * ```ts
 * app.use('/protected', expressCashuL402(config));
 * ```
 */
export function expressCashuL402(options: ExpressCashuL402Options) {
	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		const auth = req.headers['authorization'] as string | undefined;

		// L402 token path: Authorization: L402 <macaroon>:<preimage>
		if (auth?.startsWith('L402 ')) {
			const credentials = auth.slice(5);
			const colonIdx = credentials.indexOf(':');
			if (colonIdx !== -1) {
				const macaroon = credentials.slice(0, colonIdx);
				const preimage = credentials.slice(colonIdx + 1);
				const result = await verifyL402Token({
					macaroon,
					preimage,
					rootKey: options.rootKey,
				});
				if (result.success) {
					next();
					return;
				}
			}
		}

		// Cashu ecash path: X-Cashu header
		const cashuToken = req.headers['x-cashu'] as string | undefined;
		if (cashuToken) {
			const result = await verifyCashuPaymentSmart(cashuToken, options, options.bridgeConfig);
			if (result.paid) {
				next();
				return;
			}
		}

		// Issue 402 challenge
		const resourcePath = options.resourcePath ?? req.url ?? '/';
		const challenge = await createL402Challenge({
			amount: options.priceSats,
			resourcePath,
			rootKey: options.rootKey,
			createInvoice: options.createInvoice,
		});

		res
			.status(402)
			.set('WWW-Authenticate', challenge.wwwAuthenticate)
			.json({ error: 'Payment required', challenge: challenge.wwwAuthenticate });
	};
}
