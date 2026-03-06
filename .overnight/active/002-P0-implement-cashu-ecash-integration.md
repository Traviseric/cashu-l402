---
id: 2
title: "Implement Cashu ecash integration using cashu-ts"
priority: P0
severity: critical
status: completed
source: gap_analyzer
file: src/cashu/
line: null
created: "2026-02-28T00:00:00"
execution_hint: sequential
context_group: core_protocol
group_reason: "Core protocol implementation — shares project context with task 003 (L402 middleware) and feeds into task 004 (integration layer)"
---

# Implement Cashu ecash integration using cashu-ts

**Priority:** P0 (critical)
**Source:** gap_analyzer
**Location:** src/cashu/

## Problem

The entire Cashu ecash integration is unbuilt. No source code, configuration, or dependency files exist. The project name `cashu-l402` implies this is the core functionality — privacy-preserving ecash tokens backed by Lightning Network payments following the NUTs (Notation, Usage, and Terminology) specification at cashubtc.github.io.

Cashu provides Chaumian blinded signatures: users hold bearer tokens (proofs) that represent value, with privacy guaranteed because the mint cannot link token issuance to redemption.

**Current state:** No Cashu code exists anywhere in the project.

## How to Fix

Create `src/cashu/` module using the `@cashu/cashu-ts` SDK:

### 1. `src/cashu/client.ts` — Mint client
```typescript
import { CashuMint, CashuWallet, getEncodedToken } from '@cashu/cashu-ts';

export class CashuClient {
  private wallet: CashuWallet;

  constructor(mintUrl: string) {
    const mint = new CashuMint(mintUrl);
    this.wallet = new CashuWallet(mint);
  }

  // Request tokens (mint) for a given amount in sats
  async mintTokens(amount: number): Promise<{ token: string; invoice: string }> {
    const mintQuote = await this.wallet.createMintQuote(amount);
    // Returns invoice to pay, then mint tokens after payment
    const proofs = await this.wallet.mintTokens(amount, mintQuote.quote);
    const token = getEncodedToken({ mint: this.wallet.mint.mintUrl, proofs });
    return { token, invoice: mintQuote.request };
  }

  // Verify and redeem a Cashu token
  async redeemToken(encodedToken: string): Promise<{ amount: number; valid: boolean }> {
    const { token } = getDecodedToken(encodedToken);
    const totalAmount = token.proofs.reduce((sum, p) => sum + p.amount, 0);
    // Melt (redeem) proofs back to Lightning or verify they're valid
    await this.wallet.receiveTokens(encodedToken);
    return { amount: totalAmount, valid: true };
  }
}
```

### 2. `src/cashu/types.ts` — Type definitions
- `CashuProof` — individual proof (id, amount, secret, C)
- `CashuToken` — encoded token with mint URL and proofs
- `MintQuote` — Lightning invoice + quote ID for minting

### 3. `src/cashu/validation.ts` — Token validation
- Validate token format (base64url encoded)
- Check proof amounts sum to expected value
- Verify mint URL matches trusted mints list

### Key NUTs to implement:
- **NUT-00**: Notation and terminology
- **NUT-01**: Mint public keys
- **NUT-03**: Request minting via Lightning (swap tokens)
- **NUT-04**: Minting tokens (mint quote + payment)
- **NUT-05**: Melting tokens (redeem back to Lightning)

## Acceptance Criteria

- [ ] `src/cashu/client.ts` exists with `CashuClient` class
- [ ] Can request a mint quote (Lightning invoice) for a given sats amount
- [ ] Can receive and validate an encoded Cashu token
- [ ] Token validation checks format and proof validity
- [ ] Unit tests cover mint quote creation and token validation
- [ ] TypeScript types defined for all Cashu data structures
- [ ] No regressions introduced

## Dependencies

- Requires task 001 (project scaffolding) to be completed first
- cashu-ts SDK must be installed: `npm install @cashu/cashu-ts`

## Notes

_Generated from gap_analyzer findings. Reference: https://github.com/cashubtc/cashu-ts and NUTs spec at https://github.com/cashubtc/nuts_
