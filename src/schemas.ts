/**
 * Zod schemas for runtime validation of configs and payloads.
 *
 * Use these at integration boundaries — route handlers, config loading,
 * external API responses — to catch bad data before it hits business logic.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Cashu / NUT-24
// ---------------------------------------------------------------------------

/** Schema for CashuPaywallConfig */
export const CashuPaywallConfigSchema = z.object({
	priceSats: z.number().int().positive(),
	mintUrl: z.string().url(),
	unit: z.string().optional(),
	description: z.string().optional(),
});

// ---------------------------------------------------------------------------
// L402
// ---------------------------------------------------------------------------

/** Schema for L402 challenge creation parameters */
export const CreateL402ChallengeParamsSchema = z.object({
	amount: z.number().int().positive(),
	resourcePath: z.string().min(1),
	rootKey: z.string().min(1),
	location: z.string().optional(),
	caveats: z.array(z.string()).optional(),
	ttlSeconds: z.number().int().positive().optional(),
});

/** Schema for L402 token verification parameters */
export const VerifyL402TokenParamsSchema = z.object({
	macaroon: z.string().min(1),
	preimage: z.string().min(1),
	rootKey: z.string().min(1),
});

/** Schema for a MacaroonPayload */
export const MacaroonPayloadSchema = z.object({
	identifier: z.string().min(1),
	location: z.string(),
	caveats: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Spending conditions
// ---------------------------------------------------------------------------

/** Schema for NUT-10 well-known secret */
export const Nut10SecretSchema = z.object({
	kind: z.string().min(1),
	nonce: z.string(),
	data: z.string(),
	tags: z.array(z.array(z.string())),
});

/** Schema for condition info extracted from a proof */
export const ConditionInfoSchema = z.object({
	kind: z.string().min(1),
	data: z.string(),
	tags: z.array(z.array(z.string())),
	locktime: z.number().int().optional(),
	refundKeys: z.array(z.string()).optional(),
	nSigs: z.number().int().positive().optional(),
	pubkeys: z.array(z.string()).optional(),
	sigAll: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Payment routing
// ---------------------------------------------------------------------------

/** Schema for routePayment parameters */
export const RoutePaymentParamsSchema = z.object({
	amount: z.number().int().nonnegative(),
	privacyLevel: z.enum(['standard', 'enhanced', 'maximum']).optional(),
	availableBackends: z
		.array(z.enum(['cashu', 'lightning', 'fedimint']))
		.nonempty()
		.optional(),
});

// ---------------------------------------------------------------------------
// Inferred types (for convenience — prefer the interfaces in types.ts)
// ---------------------------------------------------------------------------

export type CashuPaywallConfigInput = z.input<typeof CashuPaywallConfigSchema>;
export type CreateL402ChallengeParamsInput = z.input<typeof CreateL402ChallengeParamsSchema>;
export type VerifyL402TokenParamsInput = z.input<typeof VerifyL402TokenParamsSchema>;
export type RoutePaymentParamsInput = z.input<typeof RoutePaymentParamsSchema>;
