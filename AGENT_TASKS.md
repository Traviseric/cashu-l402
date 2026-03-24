# Agent Tasks

## Pending

### P1 — Security Findings (fix before production)
- [ ] P1: AUDIT-004 — increase settlement entry IDs from `randomBytes(16)` to `randomBytes(32)` in `src/settlement-queue.ts:40` to eliminate birthday-paradox collision risk (CWE-338)
- [ ] P1: AUDIT-006 — remove timing side-channel in `src/offline-verify.ts:34`; delete early-exit length check before `timingSafeEqual`; catch throw uniformly (CWE-208)

### P2 — Lower Severity Security
- [ ] P2: AUDIT-007 — sanitize error messages in `src/l402-client.ts:130`; replace detailed invoice amount error with generic message; log details at debug level only (CWE-209)
- [ ] P2: AUDIT-009 — add length/character validation to string values in `src/cashu-paywall.ts:238` before passing to onLog callbacks to prevent log injection (CWE-117)

### P1 — Phase 3 Integration Infrastructure
- [ ] P1: Add Docker integration test environment using aesir — docker-compose.yml with bitcoind + LND + Nutshell mint, `npm run test:integration:docker` script
- [ ] P1: Add real-mint integration test — fund wallet, P2PK-lock proofs, POST to L402 paywall, offline DLEQ verify, macaroon issued, token reuse
- [ ] P1: Add real-mint batch-melt integration test — enqueue P2PK-locked proofs to settlement queue, flush(), verify melt against real Nutshell mint
- [ ] P1: Add ArxMint drop-in integration test — validate API surface matches ArxMint's `lib/cashu-paywall.ts` expectations

### P1 — Phase 4 npm Publication
- [ ] P1: Set up npm publish CI/CD workflow (GitHub Actions) — `npm publish` on tag push, scoped to `@te-btc/cashu-l402`; verify package.json exports and prepublishOnly script

### P2 — Middleware Helpers
- [ ] P2: Add `src/middleware/fastify.ts` — fastifyCashuL402(config) factory wrapping createL402Challenge + verifyCashuPaymentSmart as Fastify plugin
- [ ] P2: Add `src/middleware/express.ts` — expressCashuL402(config) factory as Express middleware

### P2 — Advanced Features
- [ ] P2: Implement token refresh flow in `src/l402-client.ts` — track expires_at caveat, re-pay automatically when token within 60s of expiry
- [ ] P2: Add metrics export API — payment counts, verify latency histograms, condition types seen; optional onMetric callback

## Completed
- [x] 13 tasks completed across 2 sessions (run-1 + run-2)
- [x] Dual ESM/CJS build added
- [x] Caveat verification implemented
- [x] Logging/rate-limit hooks added
- [x] CWE-330 replay attack fixed (nonce in bridge L402 preimage)
- [x] CWE-400 DoS via unbounded NUT-10 JSON (size limit + tag validation)
- [x] CWE-1025 parseInt zero coercion fixed
- [x] verifyCashuPaymentSmart sync fallback path tested
- [x] Tests: 177 to 265 (all passing)
