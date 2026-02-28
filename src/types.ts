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

/** Macaroon payload signed by the server via HMAC-SHA256 */
export interface MacaroonPayload {
	/** Unique macaroon identifier (random hex) */
	identifier: string;
	/** Service location hint (e.g. "cashu-l402") */
	location: string;
	/** Attenuation caveats (e.g. ["service=/api/v1", "tier=premium"]) */
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
	/** Whether the payment was valid and claimed */
	paid: boolean;
	/** Total amount in satoshis across all proofs */
	amountSats: number;
	/** The decoded Cashu proofs */
	proofs: unknown[];
	/** Error message if verification failed */
	error?: string;
}

// ---------------------------------------------------------------------------
// Unified payment SDK
// ---------------------------------------------------------------------------

/** Generic payment challenge (L402 or Cashu) — unified across both protocols */
export interface PaymentChallenge {
	/** Which payment protocol */
	type: 'l402' | 'cashu';
	/** Requested amount */
	amount: number;
	/** Currency code (e.g. "sat", "msat") */
	currency: string;
	/** BOLT11 invoice (L402 only) */
	invoice?: string;
	/** Cashu mint URL (Cashu only) */
	mintUrl?: string;
	/** Base64 macaroon (L402 only) */
	macaroon?: string;
	/** Raw WWW-Authenticate header value */
	wwwAuthenticate: string;
	/** When this challenge expires */
	expiresAt: Date;
}

/** Generic payment verification result */
export interface PaymentResult {
	/** Whether verification succeeded */
	success: boolean;
	/** Which protocol was verified */
	type: 'l402' | 'cashu';
	/** Proof of payment (macaroon or token) on success */
	proof?: string;
	/** Error message on failure */
	error?: string;
}

/** Spend route recommendation from the payment router */
export interface SpendRoute {
	/** Recommended payment backend */
	backend: 'cashu' | 'lightning' | 'fedimint';
	/** Human-readable explanation of why this backend was chosen */
	reason: string;
	/** Estimated fee in satoshis (0 for ecash, ~1% for Lightning) */
	estimatedFee: number;
}

// ---------------------------------------------------------------------------
// Spending conditions (NUT-10/11/14 + custom)
// ---------------------------------------------------------------------------

/** NUT-10 well-known secret parsed into structured form */
export interface Nut10Secret {
	/** Condition kind (e.g. "P2PK", "HTLC", "PoS") */
	kind: string;
	/** Random nonce for uniqueness */
	nonce: string;
	/** Primary condition data (pubkey, hash, etc.) */
	data: string;
	/** Additional key-value tags (e.g. [["locktime", "1709337600"]]) */
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
	/** Caveat key (e.g. "condition_kind", "locktime", "service_hash") */
	key: string;
	/** Caveat value */
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
