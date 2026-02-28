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
	CashuPaymentResult,
	CashuPaywallConfig,
	ConditionCaveat,
	ConditionInfo,
	CreateInvoiceFn,
	L402Challenge,
	L402ChallengeResult,
	L402Token,
	LookupInvoiceFn,
	MacaroonPayload,
	Nut10Secret,
	PayInvoiceFn,
	PaymentChallenge,
	PaymentResult,
	PrevalidationResult,
	SpendRoute,
} from './types.js';

// NUT-24 Cashu paywall
export {
	buildCashuChallenge,
	buildDualChallenge,
	detectPaymentMethod,
	parseCashuAuthHeader,
	verifyCashuPayment,
} from './cashu-paywall.js';

// L402 server (challenge + verify)
export {
	clearPendingChallenges,
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
	CashuPaywallConfigSchema,
	ConditionInfoSchema,
	CreateL402ChallengeParamsSchema,
	MacaroonPayloadSchema,
	Nut10SecretSchema,
	RoutePaymentParamsSchema,
	VerifyL402TokenParamsSchema,
} from './schemas.js';
