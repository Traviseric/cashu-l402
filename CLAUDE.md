# CLAUDE.md — @te-btc/cashu-l402

## What This Is

Standalone TypeScript library for the atomic exchange between Cashu ecash proofs and L402 access tokens. Framework-agnostic — integrators wire it into Fastify, Express, Hono, Next.js, etc.

Extracted from ArxMint's working L402 + NUT-24 implementation and extended with NUT-10/11/14 spending condition support (from Cashu Programmable eCash research).

## Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 18+ (ES2022) |
| Language | TypeScript (ESM, NodeNext) |
| Cashu | @cashu/cashu-ts v2 |
| Crypto | @noble/curves (Schnorr), @noble/hashes (SHA-256), node:crypto (HMAC) |
| Validation | Zod |
| Testing | Vitest |
| Lint/Format | Biome (tabs, single quotes, semicolons) |
| Package manager | npm |

## File Lookup

| What | Where |
|------|-------|
| All shared types | `src/types.ts` |
| NUT-24 ecash paywall | `src/cashu-paywall.ts` |
| L402 server (macaroon sign/verify, challenges) | `src/l402-server.ts` |
| L402 client (parse challenges, auto-pay fetch) | `src/l402-client.ts` |
| Spending condition detection (NUT-10/11/14) | `src/conditions.ts` |
| Payment routing heuristic | `src/spend-router.ts` |
| Zod schemas (runtime validation) | `src/schemas.ts` |
| Barrel export | `src/index.ts` |
| Tests | `src/__tests__/*.test.ts` |
| Full project spec | `../internal/docs/projects/cashu-l402.md` |
| Research #2 (Programmable eCash) | `../internal/docs/BUILD_POSSIBILITIES/research/2-Cashu Programmable eCash Research.md` |
| Research #3 (L402 + Agent Wallets) | `../internal/docs/BUILD_POSSIBILITIES/research/3-Agent Cashu L402 Integration Research.md` |
| Multi-Mint Router spec | `../internal/docs/projects/multi-mint-router.md` |
| Research #5 (Multi-Mint Router) | `../internal/docs/BUILD_POSSIBILITIES/research/5-Multi-Mint Cashu Router Research.md` |

## Architecture Rules

1. **ESM only** — all imports use `.js` extensions (NodeNext resolution)
2. **Framework-agnostic** — export pure functions and types. No Express/Fastify/Next.js dependency. Integrators compose into their stack.
3. **Callback-based Lightning** — no LND/LNC dependency baked in. Integrators provide `createInvoice`/`payInvoice`/`lookupInvoice` callbacks matching the types in `src/types.ts`
4. **cashu-ts for Cashu ops** — all token decoding, proof state checks, and proof claiming go through `@cashu/cashu-ts`. Don't reimplement BDHKE here.
5. **Timing-safe crypto** — all signature/hash comparisons MUST use `crypto.timingSafeEqual`. Never use `===` for secrets, preimages, or HMAC values.
6. **Zod at the edge** — when adding middleware helpers, validate configs and payloads with Zod before processing

## Key Patterns

- **Double-spend prevention**: `verifyCashuPayment()` calls `wallet.receive(token)` which atomically swaps proofs to the verifier's keys, marking originals as spent on the mint. This is the "naive" synchronous approach — works but requires mint contact per request.
- **P2PK + DLEQ offline verification (target architecture)**: The critical optimization from Research #3. Eliminates synchronous mint contact entirely:
  1. Bridge advertises its secp256k1 pubkey
  2. Agent locks proofs to bridge pubkey via NUT-11 P2PK before sending
  3. Bridge verifies NUT-12 DLEQ proofs locally — reconstructs C' from blinding factor, verifies `e = hash(R1, R2, mint_pubkey, C')`. No network call. Microsecond latency.
  4. Bridge stores locked proofs in local DB, batch-melts with mint asynchronously
  5. Bridge issues L402 Macaroon immediately (satisfies third-party caveat internally)
  - **Why this matters**: Mint downtime/latency no longer blocks payments. Double-spend risk neutralized by P2PK locking, not by mint contact.
- **Dual challenge**: Server can issue both L402 (Lightning invoice) and Cashu (NUT-24 ecash) challenges in one 402 response. Client picks whichever they support.
- **NUT-24 settlement flow**: 5-step atomic exchange — Intercept+Challenge → Ecash Transmission (X-Cashu header) → Offline Verification (DLEQ) → Macaroon Issuance → Session Authorization. Full detail in `../internal/docs/projects/cashu-l402.md`.
- **Condition detection**: `conditions.ts` detects NUT-10 structured secrets and extracts metadata. Does client-side pre-validation (locktime checks) and caveat extraction. Does NOT verify Schnorr signatures (that's the mint's job). DOES verify DLEQ proofs for offline settlement (that's the bridge's job).
- **Token cache**: L402 client caches tokens per-domain in memory. Cleared on restart. For production persistence, integrator wraps with their own storage.
- **Macaroon HMAC chaining**: Root key signs identifier → each caveat extends the HMAC chain → one-way hashing prevents caveat removal. Standard L402 caveats: service identifiers (endpoint tiers), capability scopes (allowed verbs), volume budgets (rate limiting via crypto), third-party caveats (payment hash as external proof requirement).

## Spending Conditions (from Research #2)

This library detects and handles Cashu proofs with NUT-10/11/14 spending conditions:

| Condition | Kind | What `conditions.ts` Does |
|-----------|------|--------------------------|
| P2PK | `"P2PK"` | Detects pubkey lock, extracts multisig params (n_sigs, pubkeys), locktime, sigflag |
| HTLC | `"HTLC"` | Detects hashlock, extracts preimage requirement + timelock |
| Proof-of-Service | `"PoS"` | Custom kind — detects output hash lock, deadline, provider pubkey |
| Time-locked | any with `locktime` tag | Pre-validates locktime against server time, calculates remaining TTL |

Condition metadata becomes macaroon caveats via `extractConditionCaveats()` — so the L402 access token reflects the proof's constraints.

## ArxMint Source Mapping

This library was extracted from ArxMint. Reference mapping for tracing lineage:

| Library Module | ArxMint Source |
|---|---|
| `cashu-paywall.ts` | `arxmint/lib/cashu-paywall.ts` |
| `l402-server.ts` | `arxmint/app/api/l402/route.ts` (signing/verify logic) |
| `l402-client.ts` | `arxmint/lib/lightning-agent.ts` (L402 client functions) |
| `spend-router.ts` | `arxmint/lib/payment-sdk.ts` (routePayment) |
| `conditions.ts` | New — based on Research #2 |

## Dev Commands

```bash
npm install          # Install deps
npm run typecheck    # tsc --noEmit
npm test             # Vitest (103 tests)
npm run build        # Compile to dist/
npm run lint         # Biome check
```

## Testing Environment

Financial systems with async cryptographic handshakes need fully isolated local environments.

- **Unit tests**: `npm test` — Vitest, mocked crypto, no network. Run always.
- **Lightning regtest**: [Polar](https://lightningpolar.com/) — containerized LND/CLN/Eclair + Bitcoin Core regtest. For L402 invoice flow testing.
- **Full Cashu + Lightning stack**: [aesir](https://github.com/krutt/aesir) — Docker CLI orchestration: bitcoind + LND + Nutshell/CDK mint. For end-to-end integration: fund wallet → hit L402 paywall → verify P2PK+DLEQ → issue macaroon → reuse token.
- **Never test against mainnet** Lightning or production mints during development.

## Ecosystem Context

This library exists in a specific competitive landscape — understand it to make good design decisions:

- **x402 (Coinbase/Stripe):** Competing HTTP 402 protocol using USDC on EVM L2s (Base). Different settlement, different audience. Our edge: privacy (blinded proofs), offline capability (DLEQ), sub-cent floor (sats not stablecoins), no EVM dependency.
- **Lightning Agent Tools (Lightning Labs, Feb 2026):** 7 composable skills + MCP server for agent-Lightning interaction. Complementary — they handle LN reconnaissance, we handle Cashu settlement. Don't duplicate what their MCP server does.
- **Fewsats:** MCP server for L402 payment execution with budget controls. Validates our "policy engine + L402" pattern. Our library is lower-level (framework-agnostic primitives vs. their hosted service).
- **aperture (Lightning Labs):** Go L402 reverse proxy. We're the TypeScript-native equivalent. Don't rewrite aperture in TS — our value is Cashu+L402 dual challenge, which aperture doesn't support.
- **NIST AI Agent Standards Initiative (early 2026):** Formalizing interoperability and security controls for autonomous financial transactions. Our architecture (policy engines, key isolation, audit logs) already aligns.

## What NOT to Do

- Don't add framework dependencies (Express, Fastify, etc.) — this is a library
- Don't import LND/LNC directly — use callback types from `src/types.ts`
- Don't verify Schnorr signatures or HTLC preimages in the condition detection layer — that's the mint's responsibility. `conditions.ts` does detection and pre-validation only.
- **DO verify DLEQ proofs** in the bridge settlement layer — that's the whole point of offline verification. DLEQ verification is the bridge's job, not the mint's.
- Don't add Prisma or any DB dependency — storage is the integrator's concern. The library uses in-memory maps with hooks for custom persistence.
- Don't build a centralized routing service — the spend-router is client-side only. Centralizing proof routing destroys Cashu's privacy guarantees.
