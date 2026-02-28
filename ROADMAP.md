# Roadmap — @te-btc/cashu-l402

## Phase 1: Core Library (CURRENT — scaffolded, 51 tests passing)

Extract working L402 + NUT-24 code from ArxMint into standalone library.

- [x] Project scaffolding (package.json, tsconfig, biome, vitest)
- [x] `src/types.ts` — shared types (L402, Cashu, conditions, callbacks)
- [x] `src/cashu-paywall.ts` — NUT-24 ecash paywall (parse, verify, challenge)
- [x] `src/l402-server.ts` — macaroon sign/verify, preimage verification, challenge creation
- [x] `src/l402-client.ts` — parse L402 challenges, auto-pay fetch, token cache
- [x] `src/spend-router.ts` — payment routing heuristic (cashu/lightning/fedimint)
- [x] `src/conditions.ts` — NUT-10 secret parsing, condition detection, caveat extraction
- [x] `src/index.ts` — barrel export
- [x] Unit tests for cashu-paywall (14 tests)
- [x] Unit tests for l402-server (13 tests)
- [x] Unit tests for conditions (17 tests)
- [x] Unit tests for spend-router (7 tests)
- [x] TypeScript compiles clean, build outputs to dist/
- [ ] `src/__tests__/l402-client.test.ts` — unit tests for client (parse, header build, cache)
- [ ] Zod schemas for all config types (CashuPaywallConfig, L402 challenge params)
- [ ] JSDoc on all public exports

## Phase 2: P2PK/DLEQ Offline Verification + Conditional Proofs (1–2 weeks)

The critical optimization from Research #3: eliminate synchronous mint contact. Then wire spending conditions into the verify flow.

### P2PK + DLEQ Offline Settlement (Research #3)
- [ ] Bridge keypair management — generate/load secp256k1 keypair, advertise pubkey
- [ ] NUT-11 P2PK lock verification — validate incoming proofs are locked to bridge's pubkey
- [ ] NUT-12 DLEQ offline verification — reconstruct C', verify `e = hash(R1, R2, mint_pubkey, C')` locally without mint contact
- [ ] Deferred settlement queue — store verified locked proofs in local DB, background async batch-melt with mint
- [ ] Internal third-party caveat satisfaction — generate L402 Macaroon without Lightning preimage (bridge uses deterministic secret)
- [ ] Fallback to synchronous `wallet.receive()` when agent sends proofs without P2PK lock or DLEQ proof
- [ ] Tests for DLEQ math verification (valid proof, invalid proof, tampered signature)
- [ ] Tests for P2PK lock validation (correct pubkey, wrong pubkey, missing lock)

### Conditional Proof Integration (Research #2)
- [ ] Extend `verifyCashuPayment()` to detect conditions on incoming proofs
- [ ] Auto-extract condition caveats → embed in L402 macaroon on issuance
- [ ] Time-lock aware TTL: macaroon TTL = min(default_ttl, locktime remaining)
- [ ] PoS (proof-of-service) flow: hold proof in pending state until provider submits output hash
- [ ] Escrow flow: multi-party proof handling (detect n_sigs threshold, track co-signatures)
- [ ] `PendingProof` abstraction — in-memory store for conditional proofs awaiting resolution
- [ ] Hookable persistence interface: `onChallengePersist`, `onChallengeResolve` callbacks
- [ ] Tests for conditional verify flow (PoS token → macaroon with service_hash caveat)
- [ ] Tests for time-lock TTL clamping
- [ ] Tests for expired condition rejection

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
