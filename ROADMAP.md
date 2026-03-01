# Roadmap — @te-btc/cashu-l402

## Phase 1: Core Library (COMPLETE — 116 tests)

Extract working L402 + NUT-24 code from ArxMint into standalone library.

- [x] Project scaffolding (package.json, tsconfig, biome, vitest)
- [x] `src/types.ts` — shared types (L402, Cashu, conditions, callbacks)
- [x] `src/cashu-paywall.ts` — NUT-24 ecash paywall (parse, verify, challenge)
- [x] `src/l402-server.ts` — macaroon sign/verify, preimage verification, challenge creation
- [x] `src/l402-client.ts` — parse L402 challenges, auto-pay fetch, token cache
- [x] `src/spend-router.ts` — payment routing heuristic (cashu/lightning/fedimint)
- [x] `src/conditions.ts` — NUT-10 secret parsing, condition detection, caveat extraction
- [x] `src/schemas.ts` — Zod schemas for all config/payload types
- [x] `src/index.ts` — barrel export (types, functions, schemas)
- [x] Unit tests for cashu-paywall (14 tests)
- [x] Unit tests for l402-server (13 tests)
- [x] Unit tests for conditions (17 tests)
- [x] Unit tests for spend-router (7 tests)
- [x] Unit tests for l402-client (28 tests — parse, header build, cache, auto-pay, maxCostSats, header normalization)
- [x] Unit tests for schemas (24 tests — validation, rejection, edge cases)
- [x] Integration tests (13 tests — full E2E L402 flow, dual challenge, token caching)
- [x] TypeScript compiles clean, build outputs to dist/
- [x] JSDoc on all public exports and interface fields

## Phase 2: P2PK/DLEQ Offline Verification + Conditional Proofs (COMPLETE — 177 tests)

The critical optimization from Research #3: eliminate synchronous mint contact. Then wire spending conditions into the verify flow.

### P2PK + DLEQ Offline Settlement (Research #3)
- [x] `src/bridge-keys.ts` — bridge keypair management (generate/load secp256k1 via `@noble/curves`)
- [x] `src/offline-verify.ts` — `isLockedToBridge()` (timing-safe P2PK check), `hasValidDleqProof()` (wraps cashu-ts `hasValidDleq`), `verifyProofOffline()`, `verifyTokenOffline()`
- [x] NUT-12 DLEQ offline verification — uses cashu-ts `hasValidDleq(proof, mintKeys)` for local verification without mint contact
- [x] `src/settlement-queue.ts` — `createSettlementQueue()` with `enqueue`, `flush`, `pendingCount`, `clear`, `onPersist`/`onResolve` hooks
- [x] `createBridgeL402()` in `l402-server.ts` — deterministic preimage via `HMAC-SHA256(rootKey, 'bridge:' + SHA256(sorted secrets))`, issues L402 without Lightning
- [x] `verifyCashuPaymentSmart()` in `cashu-paywall.ts` — tries offline if `bridgeConfig` provided + proofs have P2PK+DLEQ, falls back to synchronous `wallet.receive()` otherwise
- [x] `isEligibleForOfflineVerify()` — checks if token proofs all have P2PK locks + DLEQ before choosing path
- [x] Tests for bridge-keys (11 tests — keypair gen, pubkey format, load from existing, validation)
- [x] Tests for offline-verify (25 tests — P2PK lock pass/fail, DLEQ pass/fail, tampered DLEQ, batch, token-level)
- [x] `src/__tests__/helpers/mock-mint-keys.ts` — full BDHKE proof factory using cashu-ts crypto sub-paths (no real mint needed)

### Conditional Proof Integration (Research #2)
- [x] `verifyCashuPaymentOffline()` detects conditions on incoming proofs via `detectConditions()`
- [x] Auto-extract condition caveats → embed in bridge L402 macaroon via `extractConditionCaveats()`
- [x] Time-lock aware TTL: macaroon TTL = `min(default_ttl, locktime - now)`, expired locktimes rejected
- [x] `src/pending-proofs.ts` — `createPendingProofStore()` with `register`, `resolve`, `expire` (PoS/escrow resolution stub)
- [x] Tests for conditional verify flow (10 tests — TTL clamping, expired locktime rejection, condition caveats in macaroon, deduplication)
- [x] Tests for settlement queue (15 tests — enqueue/count, flush, partial failures, hooks, concurrent safety)

### PoS + Escrow (Stub — awaits custom mint)
- [x] `PendingProof` type and `createPendingProofStore()` callback-based resolution interface
- [ ] Full PoS resolution (requires `@te-btc/cashu-mint` with PoS kind support)
- [ ] Full escrow co-signature flow (requires multi-party signing infrastructure)

## Phase 3: Integration Hardening (3-5 days)

Production readiness, Docker-based integration testing, middleware helpers.

### Docker Integration Tests (Research #3 — Polar + aesir)
- [ ] Docker compose / aesir setup: bitcoind + LND + Nutshell mint
- [ ] Integration test: fund cashu-ts wallet → pay L402 paywall → verify full flow
- [ ] Integration test: P2PK-locked proofs + DLEQ → offline verification → macaroon issuance → token reuse
- [ ] Integration test: background batch-melt queue settles locked proofs with mint
- [ ] Integration test against ArxMint (swap out lib/cashu-paywall.ts with @te-btc/cashu-l402)

### Middleware + Production Hooks
- [ ] Fastify middleware helper: `fastifyCashuL402(config)` — optional, separate export
- [ ] Express middleware helper: `expressCashuL402(config)` — optional, separate export
- [ ] Error codes enum (standardized error responses for 402 flows)
- [ ] Rate limiting hooks (integrator provides limiter, library calls it)
- [ ] Structured logging hooks (integrator provides logger)

## Phase 4: Publish + ArxMint Migration (2-3 days)

Ship to npm (dual ESM/CJS) and swap into ArxMint.

### Dual ESM/CJS Publishing (Research #3)
- [ ] Add `tsdown` (esbuild) — compile single TS codebase → optimized ESM + CJS with source maps
- [ ] Update package.json exports map: `"."` → `{ "import": "./dist/index.mjs", "require": "./dist/index.cjs" }`
- [ ] Verify import works in: Express (CJS), Fastify (ESM), Hono (ESM), Next.js (mixed)

### npm Publish + ArxMint Migration
- [ ] npm publish `@te-btc/cashu-l402`
- [ ] Replace ArxMint `lib/cashu-paywall.ts` with `import { ... } from '@te-btc/cashu-l402'`
- [ ] Replace ArxMint `lib/payment-sdk.ts` with library equivalents
- [ ] Replace L402 client functions in `lib/lightning-agent.ts`
- [ ] Verify ArxMint test suite still passes after migration
- [ ] Update ArxMint package.json to depend on `@te-btc/cashu-l402`

## Phase 5: Advanced Features (ongoing)

Post-publish enhancements driven by usage and ecosystem maturation.

### Macaroon Attenuation (Research #3)
- [ ] Third-party caveats: external proof requirements beyond payment hash
- [ ] Caveat delegation chains: clients attenuate macaroons before forwarding to sub-agents
- [ ] Standard L402 caveat types: service identifiers, capability scopes, volume budgets

### Multi-Mint + Routing (Research #5)
- [ ] NUT-15 multinut payment support: partial multi-path payments across multiple mints
- [ ] Multi-mint proof acceptance: verify proofs from different mints in one payment request
- [ ] Privacy routing: configurable jitter (timing delays between melt/mint to prevent cross-mint correlation)
- [ ] Amount obfuscation: split payments across mints to break amount-based correlation

### Identity + Recovery
- [ ] NIP-98 Nostr identity pairing: agent proves identity (Nostr keypair) + payment (L402 Macaroon) simultaneously
- [ ] Token refresh flow: near-expiry detection → automatic re-payment

### Performance + Observability
- [ ] Batch verification (multiple proofs in one request)
- [ ] WebSocket notification when conditional proof resolves (PoS completion, escrow release)
- [ ] Metrics export (payment counts, latency, condition types seen)
- [ ] STARK/ZK condition detection (when NUT-XX PR #288 matures)

---

## Dependencies on Other Projects

| This Phase | Needs | Status |
|---|---|---|
| Phase 1-3 | Works against any Cashu mint (Nutshell, CDK) | No blocker |
| Phase 2 (P2PK/DLEQ) | Mint that supports NUT-11 P2PK + NUT-12 DLEQ (Nutshell, CDK both do) | No blocker |
| Phase 2 (PoS flow) | Custom mint that validates PoS kind (`@te-btc/cashu-mint` Build #1) | Parallel development OK — can test with mock |
| Phase 3 (Docker tests) | aesir CLI or Docker compose for bitcoind + LND + Nutshell | Available open-source |
| Phase 4 | ArxMint codebase access | Available at `../arxmint/` |
| Phase 5 (Multi-mint) | `@te-btc/multi-mint-router` or coco toolkit integration | Build Possibility #5 — future |
| Phase 5 (NIP-98) | Nostr keypair infrastructure in agent | Future — monitor nostr-tools |
| Phase 5 (STARK) | NUT-XX standardization (cashubtc/nuts PR #288) | Long-term, monitor only |

## Key Research Sources

| Research | Informs |
|---|---|
| Research #2 (Programmable eCash) | Phase 2 conditional proofs — NUT-10/11/14, PoS, escrow, time-locks |
| Research #3 (Agent L402 Integration) | Phase 2 P2PK+DLEQ, Phase 3 testing (Polar/aesir), Phase 4 dual ESM/CJS, Phase 5 macaroon attenuation + NIP-98 |
| Research #5 (Multi-Mint Router) | Phase 5 multi-mint routing, NUT-15 multinut payments, privacy strategies |
