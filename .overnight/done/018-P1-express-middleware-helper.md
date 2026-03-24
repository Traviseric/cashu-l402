---
id: 18
title: "Add Express middleware helper (expressCashuL402)"
priority: P1
severity: medium
status: completed
source: project_declared
file: src/middleware/express.ts
line: 0
created: "2026-03-19T00:20:00"
execution_hint: sequential
context_group: middleware_layer
group_reason: "Both 017 and 018 add middleware helpers; sequential for shared pattern/export consistency"
---

# Add Express middleware helper (expressCashuL402)

**Priority:** P1
**Source:** AGENT_TASKS.md Phase 3 Middleware Helpers / OVERNIGHT_TASKS.md Phase 3
**Location:** src/middleware/express.ts (new file)

## Problem

Integrators using Express must manually wire `createL402Challenge` + `verifyCashuPaymentSmart`
into an Express middleware on every route. There's no pre-built Express middleware, making the
library harder to adopt for the most common Node.js web framework. The ROADMAP.md Phase 3
explicitly lists this as a deliverable.

## How to Fix

Create `src/middleware/express.ts` implementing an `expressCashuL402(config)` factory:

```typescript
import type { Request, Response, NextFunction } from 'express';
import { createL402Challenge, verifyCashuPaymentSmart } from '../cashu-paywall.js';
import type { CashuPaywallConfig } from '../types.js';

export interface ExpressCashuL402Options extends CashuPaywallConfig {
    /** Amount in sats to charge (default: config.pricePerRequestSats) */
    priceSats?: number;
}

/**
 * Express middleware factory for Cashu L402 payment gating.
 *
 * Usage:
 * ```ts
 * app.use('/protected', expressCashuL402(config));
 * ```
 */
export function expressCashuL402(config: ExpressCashuL402Options) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const auth = req.headers['authorization'];

        if (auth?.startsWith('L402 ')) {
            // Verify existing L402 token
            const xCashu = req.headers['x-cashu'] as string | undefined ?? '';
            const result = await verifyCashuPaymentSmart(xCashu, config);
            if (result.paid) {
                next();
                return;
            }
        }

        // Issue 402 challenge
        const challenge = await createL402Challenge(config);
        res.status(402)
            .set('WWW-Authenticate', challenge.wwwAuthenticate)
            .json({ error: 'Payment required', ...challenge });
    };
}
```

Key requirements:
- Import only from `../cashu-paywall.js`, `../types.js` (relative, `.js` extension)
- Do NOT import express as a direct dependency — type-only imports only (`import type`)
- Export `expressCashuL402` from `src/index.ts`
- Add `"express"` to `peerDependencies` in `package.json` (optional peer, not required)

Add unit tests in `src/__tests__/middleware/express.test.ts` using mock req/res/next objects
(plain objects — no real Express instance needed):
- Test 1: missing auth header → 402 status with WWW-Authenticate header set
- Test 2: valid L402 token → `next()` called, 402 NOT sent
- Test 3: invalid token → 402 status response

## Acceptance Criteria

- [ ] `src/middleware/express.ts` created with `expressCashuL402(config)` export
- [ ] Uses type-only import for Express types (not a hard dependency)
- [ ] Exported from `src/index.ts`
- [ ] Unit tests added in `src/__tests__/middleware/express.test.ts`
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes

## Notes

_Generated from AGENT_TASKS.md Phase 3 Middleware Helpers. New file — `src/middleware/` directory
does not exist yet. Architecture rule: framework-agnostic library — type-only Express import, no
hard dep. Paired with task 017 (Fastify middleware)._
