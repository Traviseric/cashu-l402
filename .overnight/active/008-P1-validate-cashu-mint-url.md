---
id: 8
title: "Validate CASHU_MINT_URL against allowlist to prevent SSRF"
priority: P1
severity: high
status: pending
source: security_audit
file: src/integration/config.ts
line: 21
created: "2026-02-28T06:00:00"
execution_hint: sequential
context_group: integration_module
group_reason: "Touches src/integration/config.ts — same module as tasks 9, 14"
---

# Validate CASHU_MINT_URL against allowlist to prevent SSRF

**Priority:** P1 (high)
**Source:** security_audit (CWE-918)
**Location:** src/integration/config.ts:21

## Problem

The mint URL is taken directly from the `CASHU_MINT_URL` environment variable without any validation. If an attacker can control this environment variable (e.g., via misconfigured container orchestration, a compromised `.env` file, or a supply-chain attack), they can redirect all token redemptions to a malicious server under their control. This enables Server-Side Request Forgery (SSRF): the server will make HTTP requests to attacker-controlled infrastructure, potentially leaking credentials, bypassing network controls, or stealing payment proofs.

**Code with issue:**
```typescript
const mintUrl =
  process.env['CASHU_MINT_URL'] ?? 'https://mint.minibits.cash/Bitcoin';
```

## How to Fix

Add URL validation in `loadConfig()`. At minimum, enforce HTTPS and validate the URL is well-formed. Optionally, check against an explicit allowlist when `TRUSTED_MINT_URLS` is set:

```typescript
export function loadConfig(): CashuL402Config {
  const mintUrl =
    process.env['CASHU_MINT_URL'] ?? 'https://mint.minibits.cash/Bitcoin';

  // Validate mint URL: must be a valid HTTPS URL
  let parsedMintUrl: URL;
  try {
    parsedMintUrl = new URL(mintUrl);
  } catch {
    throw new Error(`CASHU_MINT_URL is not a valid URL: "${mintUrl}"`);
  }
  if (parsedMintUrl.protocol !== 'https:') {
    throw new Error(`CASHU_MINT_URL must use HTTPS: "${mintUrl}"`);
  }

  // Optional allowlist: TRUSTED_MINT_URLS=url1,url2
  const allowlist = process.env['TRUSTED_MINT_URLS'];
  if (allowlist) {
    const trusted = allowlist.split(',').map((u) => u.trim());
    const normalizedMint = parsedMintUrl.origin + parsedMintUrl.pathname.replace(/\/$/, '');
    const isTrusted = trusted.some((t) => {
      try {
        const p = new URL(t);
        return (p.origin + p.pathname.replace(/\/$/, '')) === normalizedMint;
      } catch { return false; }
    });
    if (!isTrusted) {
      throw new Error(`CASHU_MINT_URL "${mintUrl}" is not in TRUSTED_MINT_URLS allowlist`);
    }
  }

  const requiredAmountRaw = process.env['REQUIRED_SATS'] ?? '10';
  const requiredAmount = parseInt(requiredAmountRaw, 10);

  return { mintUrl, requiredAmount, trustedMints: [mintUrl] };
}
```

## Acceptance Criteria

- [ ] `loadConfig()` throws if `CASHU_MINT_URL` is not a valid URL
- [ ] `loadConfig()` throws if `CASHU_MINT_URL` uses HTTP instead of HTTPS
- [ ] When `TRUSTED_MINT_URLS` env var is set, `loadConfig()` throws if mint URL is not in the allowlist
- [ ] Unit tests cover: invalid URL, HTTP URL, untrusted URL, valid HTTPS URL
- [ ] All existing tests still pass
- [ ] `npm run build` compiles clean

## Notes

_Generated from security_audit finding (CWE-918 SSRF)._
