## Task: 002-P1-align-macaroon-hmac-docs.md
- **Status:** COMPLETE
- **Changes:** CLAUDE.md, src/l402-server.ts
- **Commit:** ce0a8d7
- **Notes:** Docs-only fix. Updated CLAUDE.md Key Patterns to replace misleading "per-caveat HMAC chaining" description with accurate "single-blob HMAC" description. Added JSDoc NOTE to signMacaroon in l402-server.ts clarifying the simplified approach vs. standard macaroon chaining and referencing Phase 5 for per-caveat delegation support. No signing logic was changed.

## Task: 011-P0-add-nonce-to-bridge-l402-preimage.md
- **Status:** COMPLETE
- **Changes:** src/l402-server.ts, src/__tests__/l402-server.test.ts
- **Commit:** bcdf851
- **Notes:** Changed preimage derivation from HMAC(rootKey, 'bridge:' + secretsDigest) to HMAC(rootKey, 'bridge:' + identifier + ':' + secretsDigest). The identifier is already a random 16-byte value per call, so reusing it as the nonce binds the preimage to the specific issuance event. Added 6 new tests for createBridgeL402. All 258 tests pass.
