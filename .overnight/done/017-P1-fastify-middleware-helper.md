---
id: 17
title: "Add Fastify middleware helper (fastifyCashuL402)"
priority: P1
severity: medium
status: completed
source: project_declared
file: src/middleware/fastify.ts
line: 0
created: "2026-03-19T00:20:00"
execution_hint: sequential
context_group: middleware_layer
group_reason: "Both 017 and 018 add middleware helpers; sequential for shared pattern/export consistency"
---

# Add Fastify middleware helper (fastifyCashuL402)

**Priority:** P1
**Source:** AGENT_TASKS.md Phase 3 Middleware Helpers / OVERNIGHT_TASKS.md Phase 3
**Location:** src/middleware/fastify.ts (new file)

## Problem

Integrators using Fastify must manually wire `createL402Challenge` + `verifyCashuPaymentSmart`
into a Fastify preHandler on every route. There's no pre-built Fastify plugin, making the
library's integration story weaker vs. alternatives. The ROADMAP.md Phase 3 explicitly lists
this as a deliverable.

## How to Fix

Create `src/middleware/fastify.ts` implementing a `fastifyCashuL402(config)` factory:

```typescript
import type { FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import { createL402Challenge, verifyCashuPaymentSmart } from '../cashu-paywall.js';
import { verifyMacaroon } from '../l402-server.js';
import type { CashuPaywallConfig } from '../types.js';

export interface FastifyCashuL402Options extends CashuPaywallConfig {
    /** Amount in sats to charge (default: config.pricePerRequestSats) */
    priceSats?: number;
}

/**
 * Fastify preHandler plugin factory for Cashu L402 payment gating.
 *
 * Usage:
 * ```ts
 * fastify.addHook('preHandler', fastifyCashuL402(config));
 * ```
 */
export function fastifyCashuL402(config: FastifyCashuL402Options) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        const auth = request.headers['authorization'];

        if (auth?.startsWith('L402 ')) {
            // Verify existing L402 token
            const [, credentials] = auth.split(' ');
            const [macaroon, preimage] = credentials.split(':');
            const result = await verifyCashuPaymentSmart(
                request.headers['x-cashu'] as string | undefined ?? '',
                config,
            );
            if (result.paid) return; // allow through
        }

        // Issue 402 challenge
        const challenge = await createL402Challenge(config);
        reply
            .code(402)
            .header('WWW-Authenticate', challenge.wwwAuthenticate)
            .send({ error: 'Payment required', ...challenge });
    };
}
```

Key requirements:
- Import only from `../cashu-paywall.js`, `../l402-server.js`, `../types.js` (relative, `.js` extension)
- Do NOT import fastify as a direct dependency — type-only imports only (`import type`)
- Export `fastifyCashuL402` from `src/index.ts` under the `middleware` or top-level namespace
- Add `"fastify"` to `peerDependencies` in `package.json` (optional peer, not required)

Add unit tests in `src/__tests__/middleware/fastify.test.ts` using mock Fastify req/reply objects
(plain objects — no real Fastify instance needed):
- Test 1: missing auth header → 402 response with WWW-Authenticate header
- Test 2: valid L402 token → allows through (calls next/returns)
- Test 3: invalid token → 402 response

## Acceptance Criteria

- [ ] `src/middleware/fastify.ts` created with `fastifyCashuL402(config)` export
- [ ] Uses type-only import for Fastify types (not a hard dependency)
- [ ] Exported from `src/index.ts`
- [ ] Unit tests added in `src/__tests__/middleware/fastify.test.ts`
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes

## Notes

_Generated from AGENT_TASKS.md Phase 3 Middleware Helpers. New file — `src/middleware/` directory
does not exist yet. Architecture rule: framework-agnostic library — type-only Fastify import, no
hard dep. Paired with task 018 (Express middleware)._
