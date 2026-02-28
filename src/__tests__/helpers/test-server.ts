/**
 * Minimal node:http test server wiring library functions into real HTTP.
 *
 * Routes:
 *   GET /api/protected → L402/Cashu dual challenge or verified content
 *   GET /health        → 200 OK
 *
 * No framework dependency — stays framework-agnostic like the library itself.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
	buildDualChallenge,
	detectPaymentMethod,
} from '../../cashu-paywall.js';
import {
	createL402Challenge,
	parseL402AuthHeader,
	verifyL402Token,
} from '../../l402-server.js';
import type { CreateInvoiceFn, LookupInvoiceFn } from '../../types.js';

export const ROOT_KEY = 'integration-test-root-key-do-not-use-in-production';

export interface TestServerConfig {
	createInvoice: CreateInvoiceFn;
	lookupInvoice?: LookupInvoiceFn;
	priceSats?: number;
}

export interface TestServerHandle {
	server: Server;
	port: number;
	baseUrl: string;
	close: () => Promise<void>;
}

export async function startTestServer(config: TestServerConfig): Promise<TestServerHandle> {
	const priceSats = config.priceSats ?? 100;

	// Tokens that have been successfully verified — simulates a production
	// token store so cached L402 tokens work on repeat requests.
	const verifiedTokens = new Set<string>();

	async function handleProtected(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const authHeader = (req.headers.authorization as string) ?? null;
		const { method } = detectPaymentMethod(authHeader);

		// --- L402 auth ---
		if (method === 'l402') {
			const parsed = parseL402AuthHeader(authHeader);
			if (parsed) {
				const tokenKey = `${parsed.macaroon}:${parsed.preimage}`;

				// Fast path: already verified on a previous request
				if (verifiedTokens.has(tokenKey)) {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ data: 'Protected content', payment: 'l402' }));
					return;
				}

				const result = await verifyL402Token({
					macaroon: parsed.macaroon,
					preimage: parsed.preimage,
					rootKey: ROOT_KEY,
					lookupInvoice: config.lookupInvoice,
				});

				if (result.success) {
					verifiedTokens.add(tokenKey);
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ data: 'Protected content', payment: 'l402' }));
					return;
				}

				res.writeHead(401, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: result.error }));
				return;
			}
		}

		// --- Cashu auth (mock accept — real verify needs a running mint) ---
		if (method === 'cashu') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ data: 'Protected content', payment: 'cashu' }));
			return;
		}

		// --- No auth → issue dual challenge ---
		const challenge = await createL402Challenge({
			amount: priceSats,
			resourcePath: '/api/protected',
			rootKey: ROOT_KEY,
			createInvoice: config.createInvoice,
		});

		const cashuConfig = {
			priceSats,
			mintUrl: 'https://testnut.cashu.space',
			unit: 'sat',
			description: 'Test protected resource',
		};

		const dualHeaders = buildDualChallenge(cashuConfig, challenge.wwwAuthenticate);

		res.writeHead(402, {
			'Content-Type': 'application/json',
			...dualHeaders,
		});
		res.end(JSON.stringify({ error: 'Payment required' }));
	}

	const server = createServer(async (req, res) => {
		try {
			if (req.url === '/api/protected' && req.method === 'GET') {
				await handleProtected(req, res);
				return;
			}

			if (req.url === '/health') {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ status: 'ok' }));
				return;
			}

			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Not found' }));
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: message }));
		}
	});

	return new Promise((resolve) => {
		server.listen(0, '127.0.0.1', () => {
			const addr = server.address() as { port: number };
			resolve({
				server,
				port: addr.port,
				baseUrl: `http://127.0.0.1:${addr.port}`,
				close: () => new Promise<void>((r) => server.close(() => r())),
			});
		});
	});
}
