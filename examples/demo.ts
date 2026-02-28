/**
 * cashu-l402 Demo — runnable E2E demonstration.
 *
 * Shows the full L402 payment flow step-by-step with colored console output.
 * Zero Docker, zero LND — uses mock Lightning with real SHA-256 crypto.
 *
 * Run: npm run demo
 */

import {
	clearL402Cache,
	clearPendingChallenges,
	getL402CacheSize,
	l402Fetch,
	parseL402Challenge,
	routePayment,
} from '../src/index.js';
import { createMockLightning } from '../src/__tests__/helpers/mock-lightning.js';
import { startTestServer } from '../src/__tests__/helpers/test-server.js';

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

function step(n: number, msg: string): void {
	console.log(`${CYAN}[${n}]${RESET} ${msg}`);
}

function result(msg: string): void {
	console.log(`    ${GREEN}\u2192${RESET} ${msg}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	console.log(`\n${BOLD}=== cashu-l402 Demo ===${RESET}\n`);

	const ln = createMockLightning();
	const srv = await startTestServer({
		createInvoice: ln.createInvoice,
		lookupInvoice: ln.lookupInvoice,
		priceSats: 100,
	});

	console.log(`Server running at ${CYAN}${srv.baseUrl}${RESET}\n`);

	try {
		// ---------------------------------------------------------------
		// Flow 1: Manual L402 Payment (step-by-step)
		// ---------------------------------------------------------------
		console.log(`${BOLD}--- Flow 1: L402 Payment ---${RESET}`);

		step(1, `GET /api/protected ${DIM}(no credentials)${RESET}`);
		const res402 = await fetch(`${srv.baseUrl}/api/protected`);
		result(`${YELLOW}${res402.status} Payment Required${RESET}`);

		const wwwAuth = res402.headers.get('WWW-Authenticate')!;
		const challenge = parseL402Challenge(wwwAuth);
		result(
			`WWW-Authenticate: L402 macaroon="${challenge.macaroon.slice(0, 20)}...", invoice="${challenge.invoice.slice(0, 24)}..."`,
		);

		step(2, `Paying invoice ${DIM}(mock Lightning)${RESET}...`);
		const { preimage } = await ln.payInvoice(challenge.invoice);
		result(`Preimage: ${preimage.slice(0, 16)}...`);

		step(3, 'Retrying with L402 token...');
		const res200 = await fetch(`${srv.baseUrl}/api/protected`, {
			headers: { Authorization: `L402 ${challenge.macaroon}:${preimage}` },
		});
		const body = await res200.json();
		result(`${GREEN}${res200.status} OK${RESET} \u2014 ${JSON.stringify(body)}`);

		console.log();

		// ---------------------------------------------------------------
		// Flow 2: l402Fetch auto-pay + cached token
		// ---------------------------------------------------------------
		console.log(`${BOLD}--- Flow 2: Cached Token ---${RESET}`);
		clearPendingChallenges();
		clearL402Cache();

		step(4, `l402Fetch /api/protected ${DIM}(auto-pay)${RESET}`);
		const autoRes = await l402Fetch(`${srv.baseUrl}/api/protected`, ln.payInvoice);
		const autoBody = await autoRes.json();
		result(`${GREEN}${autoRes.status} OK${RESET} \u2014 ${JSON.stringify(autoBody)}`);

		step(5, `l402Fetch /api/protected ${DIM}(cached token)${RESET}`);
		const cachedRes = await l402Fetch(`${srv.baseUrl}/api/protected`, ln.payInvoice);
		result(`${GREEN}${cachedRes.status} OK${RESET} \u2014 no new payment needed`);
		result(`Cache size: ${getL402CacheSize()}`);

		console.log();

		// ---------------------------------------------------------------
		// Flow 3: Payment Routing
		// ---------------------------------------------------------------
		console.log(`${BOLD}--- Flow 3: Payment Routing ---${RESET}`);

		const scenarios: Array<{
			amount: number;
			privacyLevel: 'standard' | 'enhanced' | 'maximum';
			availableBackends?: ('cashu' | 'lightning' | 'fedimint')[];
		}> = [
			{ amount: 500, privacyLevel: 'standard' },
			{ amount: 50000, privacyLevel: 'standard' },
			{
				amount: 1000,
				privacyLevel: 'maximum',
				availableBackends: ['cashu', 'lightning', 'fedimint'],
			},
		];

		for (const params of scenarios) {
			const route = routePayment(params);
			const fee = route.estimatedFee > 0 ? ` (${route.estimatedFee} sats fee)` : '';
			const label = `${String(params.amount).padStart(5)} sats, ${params.privacyLevel.padEnd(8)}`;
			console.log(
				`    ${label} ${GREEN}\u2192${RESET} ${BOLD}${route.backend}${RESET}${fee}`,
			);
		}

		console.log(`\n${GREEN}${BOLD}Demo complete.${RESET}\n`);
	} finally {
		await srv.close();
	}
}

main().catch((err) => {
	console.error(`${RED}Demo failed:${RESET}`, err);
	process.exit(1);
});
