# Human Tasks

Tasks that require human action (cannot be done autonomously by workers).

- [ ] [HT-001] Publish @te-btc/cashu-l402 to npm registry — Reason: requires npm account with @te-btc scope access. Run `npm publish` after task 003 (dual ESM/CJS build) is complete.
- [ ] [HT-002] Migrate ArxMint lib/cashu-paywall.ts to import from @te-btc/cashu-l402 — Reason: requires access to the ArxMint codebase; blocked on HT-001 (npm publish first).
- [ ] [HT-003] Set up Docker integration test stack using aesir — Reason: requires Docker + aesir CLI (https://github.com/krutt/aesir); add docker-compose.yml with bitcoind + LND + Nutshell mint and `npm run test:integration:docker` script. Prerequisite for HT-004.
- [ ] [HT-004] Add real-mint integration tests — Reason: depends on HT-003 Docker stack; tests: (a) fund cashu-ts wallet → P2PK-lock proofs → POST to L402 paywall → offline DLEQ verify → macaroon issued → token reused; (b) enqueue P2PK-locked proofs → flush() → verify melt against Nutshell; (c) ArxMint drop-in: import @te-btc/cashu-l402, verify API surface compatibility.
- [ ] [HT-005] Set up GitHub Actions npm publish CI/CD — Reason: requires @te-btc npm org access; workflow: `npm publish` on tag push (e.g. v0.1.0), scoped to @te-btc/cashu-l402. Verify package.json exports cover ESM/CJS outputs from tsdown.
