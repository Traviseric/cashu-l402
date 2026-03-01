/**
 * @te-btc/cashu-l402 — Shared types
 */

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

/** Standardized machine-readable error codes for Cashu-L402 payment flows. */
export const CashuL402ErrorCode = {
	// Token / proof errors
	EMPTY_TOKEN: 'EMPTY_TOKEN',
	INSUFFICIENT_AMOUNT: 'INSUFFICIENT_AMOUNT',
	WRONG_MINT: 'WRONG_MINT',
	PROOF_ALREADY_SPENT: 'PROOF_ALREADY_SPENT',

	// Offline verification errors
	P2PK_LOCK_INVALID: 'P2PK_LOCK_INVALID',
	DLEQ_PROOF_INVALID: 'DLEQ_PROOF_INVALID',
	LOCKTIME_EXPIRED: 'LOCKTIME_EXPIRED',
	OFFLINE_VERIFY_FAILED: 'OFFLINE_VERIFY_FAILED',

	// Macaroon / L402 errors
	INVALID_MACAROON: 'INVALID_MACAROON',
	MACAROON_EXPIRED: 'MACAROON_EXPIRED',
	SERVICE_MISMATCH: 'SERVICE_MISMATCH',
	CHALLENGE_NOT_FOUND: 'CHALLENGE_NOT_FOUND',
	CHALLENGE_EXPIRED: 'CHALLENGE_EXPIRED',
	PREIMAGE_INVALID: 'PREIMAGE_INVALID',

	// Rate limiting
	RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
} as const;

export type CashuL402ErrorCode = (typeof CashuL402ErrorCode)[keyof typeof CashuL402ErrorCode];

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

/** Log severity levels for library-internal events. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured log entry emitted by the library.
 * Integrators can pipe this to pino, winston, console, or any logger.
 */
export interface LogEntry {
	level: LogLevel;
	event: string;
	context?: Record<string, unknown>;
}

/** Optional logger callback. Called for key library events. */
export type LogFn = (entry: LogEntry) => void;

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/** Context passed to the rate limit callback. */
export interface RateLimitContext {
	/** IP or identifier for the requester (integrator-provided, passed through). */
	requesterId?: string;
	/** Which verification path was about to be attempted. */
	verifyMethod: 'online' | 'offline' | 'smart';
	/** Token length hint (not decoded for performance). */
	tokenLength: number;
}

/**
 * Rate limit callback. Return `true` to allow the request, `false` to reject.
 * Called BEFORE proof verification begins — keeps expensive DLEQ off the hot path.
 */
export type RateLimitFn = (ctx: RateLimitContext) => boolean | Promise<boolean>;

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
	/** Optional structured logger callback */
	onLog?: LogFn;
	/** Optional rate limit callback — return false to reject before verification */
	onRateLimit?: RateLimitFn;
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
	/** Machine-readable error code for programmatic handling */
	code?: CashuL402ErrorCode;
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
	/** Machine-readable error code for programmatic handling */
	code?: CashuL402ErrorCode;
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

// ---------------------------------------------------------------------------
// Bridge keys (Phase 2)
// ---------------------------------------------------------------------------

/** Bridge secp256k1 keypair for P2PK proof locking */
export interface BridgeKeyPair {
	/** Hex-encoded private key (32 bytes) */
	privateKey: string;
	/** Hex-encoded compressed public key (33 bytes) */
	publicKey: string;
}

// ---------------------------------------------------------------------------
// Offline verification (Phase 2)
// ---------------------------------------------------------------------------

/** Mint keyset for offline DLEQ verification (structurally compatible with cashu-ts MintKeys) */
export interface MintKeyset {
	/** Keyset identifier */
	id: string;
	/** Unit (e.g. "sat") */
	unit: string;
	/** Amount → hex public key mapping */
	keys: Record<number, string>;
}

/** Configuration for offline proof verification */
export interface OfflineVerifyConfig {
	/** Bridge's secp256k1 public key (hex, compressed) */
	bridgePubkey: string;
	/** Mint keysets for DLEQ verification */
	mintKeysets: MintKeyset[];
	/** Require valid DLEQ proof (default: true) */
	requireDleq?: boolean;
}

/** Result of offline verification for a single proof */
export interface OfflineVerifyResult {
	valid: boolean;
	/** Whether the P2PK lock check passed */
	p2pkValid: boolean;
	/** Whether the DLEQ proof verified */
	dleqValid: boolean;
	/** Error message if verification failed */
	error?: string;
}

/** Result of offline batch verification */
export interface OfflineVerifyBatchResult {
	allValid: boolean;
	results: OfflineVerifyResult[];
	validCount: number;
	invalidCount: number;
}

// ---------------------------------------------------------------------------
// Bridge L402 + Smart verification (Phase 2)
// ---------------------------------------------------------------------------

/** Bridge configuration for verifyCashuPaymentSmart */
export interface BridgeVerifyConfig {
	/** Bridge's secp256k1 public key (hex) */
	bridgePubkey: string;
	/** Mint keysets for DLEQ verification */
	mintKeysets: MintKeyset[];
	/** Require valid DLEQ proof (default: true) */
	requireDleq?: boolean;
	/** Root key for bridge L402 token issuance */
	rootKey: string;
	/** Service location for macaroon (default: "cashu-l402-bridge") */
	location?: string;
	/** Optional structured logger callback */
	onLog?: LogFn;
	/** Optional settlement queue — enqueues proofs for async batch settlement after offline verify */
	settlementQueue?: SettlementQueueRef;
}

/** Extended Cashu payment result for V2 (offline + smart verification) */
export interface CashuPaymentResultV2 extends CashuPaymentResult {
	/** Which verification path was used */
	method: 'online' | 'offline';
	/** Whether DLEQ was verified (offline path only) */
	dleqVerified?: boolean;
	/** Whether P2PK lock was verified (offline path only) */
	p2pkVerified?: boolean;
	/** Settlement queue entry ID (offline path only) */
	settlementId?: string;
	/** Bridge-issued L402 macaroon (offline path only) */
	bridgeL402?: string;
}

// ---------------------------------------------------------------------------
// Settlement queue (Phase 2)
// ---------------------------------------------------------------------------

/** Entry in the settlement queue */
export interface SettlementEntry {
	/** Unique entry identifier */
	id: string;
	/** Encoded Cashu token */
	token: string;
	/** Amount in satoshis */
	amountSats: number;
	/** Mint URL for settlement */
	mintUrl: string;
	/** When the entry was queued */
	enqueuedAt: number;
	/** Settlement status */
	status: 'pending' | 'settled' | 'failed';
	/** Error message if settlement failed */
	error?: string;
}

/** Configuration for the settlement queue */
export interface SettlementQueueConfig {
	/** Called when a new entry is enqueued (for external persistence) */
	onPersist?: (entry: SettlementEntry) => Promise<void>;
	/** Called when an entry is settled or failed (for external notification) */
	onResolve?: (entry: SettlementEntry) => Promise<void>;
}

/** Result of a batch settlement flush */
export interface SettlementBatchResult {
	settled: number;
	failed: number;
	errors: Array<{ id: string; error: string }>;
}

/** Settlement function provided by integrator for flush() */
export type SettleFn = (entry: SettlementEntry) => Promise<void>;

/**
 * Minimal interface for a settlement queue wired into BridgeVerifyConfig.
 * Satisfied by the return value of createSettlementQueue().
 */
export interface SettlementQueueRef {
	enqueue: (params: { token: string; amountSats: number; mintUrl: string }) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Pending proofs — PoS/Escrow (Phase 2D)
// ---------------------------------------------------------------------------

/** A conditional proof awaiting resolution (PoS hash, escrow co-signature, etc.) */
export interface PendingProof {
	/** Unique identifier */
	id: string;
	/** The Cashu proof data */
	proof: { secret: string; C: string; amount: number; id: string };
	/** Condition kind from NUT-10 */
	conditionKind: string;
	/** When this was registered */
	registeredAt: number;
	/** Resolution status */
	status: 'pending' | 'resolved' | 'expired';
	/** Resolution data (e.g. preimage for HTLC, hash for PoS) */
	resolution?: string;
}
