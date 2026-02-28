/**
 * Client-side L402 — parse challenges, auto-pay fetch, token caching.
 *
 * Extracted from ArxMint lib/lightning-agent.ts L402 client functions.
 */

import type { L402Challenge, L402Token, PayInvoiceFn } from './types.js';

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/**
 * Parse L402 challenge from WWW-Authenticate header.
 *
 * Expects format: `L402 macaroon="<base64>", invoice="lnbc..."`
 */
export function parseL402Challenge(wwwAuthenticate: string): L402Challenge {
	const macaroonMatch = wwwAuthenticate.match(/macaroon="([^"]+)"/);
	const invoiceMatch = wwwAuthenticate.match(/invoice="([^"]+)"/);

	if (!macaroonMatch?.[1] || !invoiceMatch?.[1]) {
		throw new Error(`Invalid L402 challenge: ${wwwAuthenticate}`);
	}

	return {
		macaroon: macaroonMatch[1],
		invoice: invoiceMatch[1],
	};
}

/**
 * Build Authorization header value from L402 token.
 *
 * Format: `L402 <macaroon>:<preimage>`
 */
export function buildL402Header(token: L402Token): string {
	return `L402 ${token.macaroon}:${token.preimage}`;
}

// ---------------------------------------------------------------------------
// Token cache (per-domain, in-memory)
// ---------------------------------------------------------------------------

const tokenCache = new Map<string, L402Token>();

function domainFromUrl(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

/** Clear all cached L402 tokens. */
export function clearL402Cache(): void {
	tokenCache.clear();
}

/** Get count of cached tokens. For monitoring. */
export function getL402CacheSize(): number {
	return tokenCache.size;
}

// ---------------------------------------------------------------------------
// Auto-pay fetch
// ---------------------------------------------------------------------------

/**
 * Fetch a URL with automatic L402 payment handling.
 *
 * Flow:
 * 1. Check cached token for this domain → use if available
 * 2. Make initial request
 * 3. If 402, parse challenge, pay invoice, cache token, retry
 * 4. Return final response
 *
 * Integrator provides `payInvoice` — this library has no LND dependency.
 *
 * @param url - URL to fetch
 * @param payInvoice - Function to pay a BOLT11 invoice (returns preimage)
 * @param options - Standard fetch RequestInit options
 * @param maxCostSats - Maximum sats the client will pay (prevents overpayment)
 */
export async function l402Fetch(
	url: string,
	payInvoice: PayInvoiceFn,
	options?: RequestInit,
	maxCostSats?: number,
): Promise<Response> {
	const domain = domainFromUrl(url);

	// Try cached token first
	const cached = tokenCache.get(domain);
	if (cached) {
		const authHeader = buildL402Header(cached);
		const response = await fetch(url, {
			...options,
			headers: { ...normalizeHeaders(options?.headers), Authorization: authHeader },
		});

		// If still 402, cached token expired — clear and fall through
		if (response.status !== 402) {
			return response;
		}
		tokenCache.delete(domain);
	}

	// Make initial request
	const response = await fetch(url, options);
	if (response.status !== 402) {
		return response;
	}

	// Parse L402 challenge
	const wwwAuthenticate = response.headers.get('WWW-Authenticate');
	if (!wwwAuthenticate) {
		throw new Error('402 response missing WWW-Authenticate header');
	}

	const challenge = parseL402Challenge(wwwAuthenticate);

	// Check max cost if specified
	if (maxCostSats !== undefined) {
		const amountMatch = challenge.invoice.match(/lnbc(\d+)([munp]?)/i);
		if (amountMatch) {
			const decoded = decodeBolt11Amount(amountMatch[1], amountMatch[2]);
			if (decoded !== null && decoded > maxCostSats) {
				throw new Error(
					`L402 invoice amount (${decoded} sats) exceeds max cost (${maxCostSats} sats)`,
				);
			}
		}
	}

	// Pay invoice
	const { preimage } = await payInvoice(challenge.invoice);

	// Cache token
	const token: L402Token = { macaroon: challenge.macaroon, preimage };
	tokenCache.set(domain, token);

	// Retry with token
	const authHeader = buildL402Header(token);
	return fetch(url, {
		...options,
		headers: { ...normalizeHeaders(options?.headers), Authorization: authHeader },
	});
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
	if (!headers) return {};
	if (headers instanceof Headers) {
		const obj: Record<string, string> = {};
		headers.forEach((value, key) => {
			obj[key] = value;
		});
		return obj;
	}
	if (Array.isArray(headers)) {
		return Object.fromEntries(headers);
	}
	return headers as Record<string, string>;
}

/**
 * Rough BOLT11 amount decoding from the human-readable prefix.
 * Returns sats or null if unparseable.
 */
function decodeBolt11Amount(digits: string, multiplier: string): number | null {
	const n = Number.parseInt(digits, 10);
	if (Number.isNaN(n)) return null;

	switch (multiplier.toLowerCase()) {
		case 'm':
			return n * 100_000; // milli-BTC → sats
		case 'u':
			return n * 100; // micro-BTC → sats
		case 'n':
			return Math.round(n * 0.1); // nano-BTC → sats
		case 'p':
			return Math.round(n * 0.0001); // pico-BTC → sats
		case '':
			return n * 100_000_000; // BTC → sats
		default:
			return null;
	}
}
