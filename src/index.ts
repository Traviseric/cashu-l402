/**
 * @te-btc/cashu-l402
 *
 * Cashu ecash ↔ L402 settlement bridge.
 * Atomic exchange between Cashu proofs and L402 access tokens.
 *
 * @packageDocumentation
 */

// Types
export type {
	BridgeKeyPair,
	BridgeVerifyConfig,
	CashuPaymentResult,
	CashuPaymentResultV2,
	CashuPaywallConfig,
	ConditionCaveat,
	ConditionInfo,
	CreateInvoiceFn,
	L402Challenge,
	L402ChallengeResult,
	L402Token,
	LogEntry,
	LogFn,
	LogLevel,
	LookupInvoiceFn,
	MacaroonPayload,
	MintKeyset,
	Nut10Secret,
	OfflineVerifyBatchResult,
	OfflineVerifyConfig,
	OfflineVerifyResult,
	PayInvoiceFn,
	PaymentChallenge,
	PaymentResult,
	PendingProof,
	PrevalidationResult,
	RateLimitContext,
	RateLimitFn,
	SettleFn,
	SettlementBatchResult,
	SettlementEntry,
	SettlementQueueConfig,
	SettlementQueueRef,
	SpendRoute,
} from './types.js';

// Error codes (value export — use for programmatic error handling)
export { CashuL402ErrorCode } from './types.js';

// NUT-24 Cashu paywall
export {
	buildCashuChallenge,
	buildDualChallenge,
	detectPaymentMethod,
	parseCashuAuthHeader,
	verifyCashuPayment,
	verifyCashuPaymentOffline,
	verifyCashuPaymentSmart,
} from './cashu-paywall.js';

// L402 server (challenge + verify)
export {
	clearPendingChallenges,
	createBridgeL402,
	createL402Challenge,
	getPendingChallengeCount,
	parseL402AuthHeader,
	signMacaroon,
	verifyL402Token,
	verifyMacaroon,
	verifyPreimage,
} from './l402-server.js';

// L402 client (parse + auto-pay fetch)
export {
	buildL402Header,
	clearL402Cache,
	getL402CacheSize,
	l402Fetch,
	parseL402Challenge,
} from './l402-client.js';

// Bridge keys (Phase 2)
export {
	createBridgeKeyPair,
	deriveBridgePublicKey,
	isValidPublicKey,
	loadBridgeKeyPair,
} from './bridge-keys.js';

// Offline verification (Phase 2)
export {
	hasValidDleqProof,
	isEligibleForOfflineVerify,
	isLockedToBridge,
	verifyProofOffline,
	verifyTokenOffline,
} from './offline-verify.js';

// Settlement queue (Phase 2)
export { createSettlementQueue } from './settlement-queue.js';

// Pending proofs — PoS/Escrow (Phase 2)
export { createPendingProofStore } from './pending-proofs.js';

// Spending condition detection (NUT-10/11/14 + custom)
export {
	detectConditions,
	extractConditionCaveats,
	parseNut10Secret,
	prevalidateCondition,
} from './conditions.js';

// Payment routing
export { routePayment } from './spend-router.js';

// Zod schemas (runtime validation)
export {
	BridgeKeyPairSchema,
	CashuPaywallConfigSchema,
	ConditionInfoSchema,
	CreateL402ChallengeParamsSchema,
	MacaroonPayloadSchema,
	Nut10SecretSchema,
	OfflineVerifyResultSchema,
	RoutePaymentParamsSchema,
	SettlementEntrySchema,
	VerifyL402TokenParamsSchema,
} from './schemas.js';
