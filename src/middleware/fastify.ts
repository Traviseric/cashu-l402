/**
 * Fastify preHandler middleware for Cashu L402 payment gating.
 *
 * Uses structural typing — no hard fastify dependency required.
 * Add `fastify` to your project's dependencies to use this middleware.
 */
import { verifyCashuPaymentSmart } from '../cashu-paywall.js';
import { createL402Challenge, verifyL402Token } from '../l402-server.js';
import type { BridgeVerifyConfig, CashuPaywallConfig, CreateInvoiceFn } from '../types.js';

/** Minimal structural subset of FastifyRequest used by this middleware. */
interface FastifyRequest {
	headers: Record<string, string | string[] | undefined>;
	url: string;
}

/** Minimal structural subset of FastifyReply used by this middleware. */
interface FastifyReply {
	code(statusCode: number): this;
	header(key: string, value: string): this;
	send(body: unknown): this;
}

export interface FastifyCashuL402Options extends CashuPaywallConfig {
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
 * Fastify preHandler hook factory for Cashu L402 payment gating.
 *
 * Checks `Authorization: L402 <macaroon>:<preimage>` and `X-Cashu: <token>` headers.
 * Issues HTTP 402 with `WWW-Authenticate` when neither is present or valid.
 *
 * Usage:
 * ```ts
 * fastify.addHook('preHandler', fastifyCashuL402(config));
 * ```
 */
export function fastifyCashuL402(options: FastifyCashuL402Options) {
	return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
		const auth = request.headers['authorization'] as string | undefined;

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
				if (result.success) return; // allow through
			}
		}

		// Cashu ecash path: X-Cashu header
		const cashuToken = request.headers['x-cashu'] as string | undefined;
		if (cashuToken) {
			const result = await verifyCashuPaymentSmart(cashuToken, options, options.bridgeConfig);
			if (result.paid) return; // allow through
		}

		// Issue 402 challenge
		const resourcePath = options.resourcePath ?? request.url ?? '/';
		const challenge = await createL402Challenge({
			amount: options.priceSats,
			resourcePath,
			rootKey: options.rootKey,
			createInvoice: options.createInvoice,
		});

		reply
			.code(402)
			.header('WWW-Authenticate', challenge.wwwAuthenticate)
			.send({ error: 'Payment required', challenge: challenge.wwwAuthenticate });
	};
}
