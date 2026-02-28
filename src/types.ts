/**
 * @te-btc/cashu-l402 — Shared types
 */

// ---------------------------------------------------------------------------
// L402
// ---------------------------------------------------------------------------

/** Parsed L402 challenge from WWW-Authenticate header */
export interface L402Challenge {
	macaroon: string;
	invoice: string;
}

/** L402 token (macaroon + preimage) after payment */
export interface L402Token {
	macaroon: string;
	preimage: string;
}

/** Macaroon payload signed by the server */
export interface MacaroonPayload {
	identifier: string;
	location: string;
	caveats: string[];
}

/** Result of creating an L402 challenge */
export interface L402ChallengeResult {
	/** WWW-Authenticate header value */
	wwwAuthenticate: string;
	/** Macaroon (base64) */
	macaroon: string;
	/** BOLT11 invoice */
	invoice: string;
	/** Payment hash (base64) */
	rHash: string;
	/** Challenge expiry */
	expiresAt: Date;
}

// ---------------------------------------------------------------------------
// Cashu / NUT-24
// ---------------------------------------------------------------------------

/** Configuration for a Cashu-gated endpoint */
export interface CashuPaywallConfig {
	/** Price in satoshis */
	priceSats: number;
	/** Mint URL the server will accept proofs from */
	mintUrl: string;
	/** Currency unit (default: "sat") */
	unit?: string;
	/** Human-readable description */
	description?: string;
}

/** Result of verifying a Cashu payment */
export interface CashuPaymentResult {
	paid: boolean;
	amountSats: number;
	proofs: unknown[];
	error?: string;
}

// ---------------------------------------------------------------------------
// Unified payment SDK
// ---------------------------------------------------------------------------

/** Generic payment challenge (L402 or Cashu) */
export interface PaymentChallenge {
	type: 'l402' | 'cashu';
	amount: number;
	currency: string;
	invoice?: string;
	mintUrl?: string;
	macaroon?: string;
	wwwAuthenticate: string;
	expiresAt: Date;
}

/** Generic payment verification result */
export interface PaymentResult {
	success: boolean;
	type: 'l402' | 'cashu';
	proof?: string;
	error?: string;
}

/** Spend route recommendation */
export interface SpendRoute {
	backend: 'cashu' | 'lightning' | 'fedimint';
	reason: string;
	estimatedFee: number;
}

// ---------------------------------------------------------------------------
// Spending conditions (NUT-10/11/14 + custom)
// ---------------------------------------------------------------------------

/** NUT-10 well-known secret parsed into structured form */
export interface Nut10Secret {
	kind: string;
	nonce: string;
	data: string;
	tags: string[][];
}

/** Detected condition on a proof */
export interface ConditionInfo {
	kind: 'P2PK' | 'HTLC' | 'PoS' | string;
	/** Primary lock data (pubkey, hash, etc.) */
	data: string;
	/** All tags from the NUT-10 secret */
	tags: string[][];
	/** Locktime (Unix timestamp) if present */
	locktime?: number;
	/** Refund pubkeys if present */
	refundKeys?: string[];
	/** Required signature count for multisig */
	nSigs?: number;
	/** Additional pubkeys for multisig */
	pubkeys?: string[];
	/** SIG_ALL flag */
	sigAll?: boolean;
}

/** Macaroon caveat derived from a spending condition */
export interface ConditionCaveat {
	key: string;
	value: string;
}

/** Pre-validation result for conditional proofs */
export interface PrevalidationResult {
	valid: boolean;
	/** If the condition has a locktime, whether it's expired */
	expired?: boolean;
	/** Remaining seconds until locktime */
	remainingSeconds?: number;
	error?: string;
}

// ---------------------------------------------------------------------------
// Callbacks — integrators provide these
// ---------------------------------------------------------------------------

/** Create a Lightning invoice (integrator provides) */
export type CreateInvoiceFn = (
	amountSats: number,
	memo: string,
) => Promise<{ paymentRequest: string; rHash: string }>;

/** Look up invoice settlement state (integrator provides) */
export type LookupInvoiceFn = (rHash: string) => Promise<{ settled: boolean }>;

/** Pay a Lightning invoice (integrator provides, for l402-client) */
export type PayInvoiceFn = (bolt11: string) => Promise<{ preimage: string; feeSats: number }>;
