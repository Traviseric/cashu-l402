---
id: 15
title: "Improve trusted mint URL normalization to prevent bypass via URL encoding"
priority: P2
severity: medium
status: pending
source: security_audit
file: src/cashu/validation.ts
line: 54
created: "2026-02-28T06:00:00"
execution_hint: sequential
context_group: cashu_module
group_reason: "Touches src/cashu/validation.ts — cashu module"
---

# Improve trusted mint URL normalization to prevent bypass via URL encoding

**Priority:** P2 (medium)
**Source:** security_audit (CWE-183)
**Location:** src/cashu/validation.ts:54

## Problem

The trusted mint URL comparison normalizes only case and trailing slashes. It does not handle other URL equivalences:
- URL encoding differences (e.g., `%2F` vs `/` in path segments)
- Default port numbers (e.g., `https://mint.example.com` vs `https://mint.example.com:443`)
- Path traversal variations (e.g., `https://mint.example.com/Bitcoin/../Bitcoin`)
- Unicode normalization differences

An attacker who controls a mint URL similar to a trusted one might construct a URL that passes the naive check but routes to a different host.

**Code with issue:**
```typescript
const mintUrl = mint.replace(/\/$/, '');
const trusted = trustedMints.some(
  (m) => m.replace(/\/$/, '') === mintUrl
);
```

## How to Fix

Use the `URL` constructor for proper normalization before comparison. The `URL` constructor handles port canonicalization, path normalization, and percent-encoding:

```typescript
function normalizeMintUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Use origin + normalized pathname (URL constructor normalizes encoding and ports)
    return parsed.origin + parsed.pathname.replace(/\/$/, '');
  } catch {
    return url.toLowerCase().replace(/\/$/, '');
  }
}

// In validateToken():
if (trustedMints && trustedMints.length > 0) {
  const normalizedMint = normalizeMintUrl(mint);
  const trusted = trustedMints.some(
    (m) => normalizeMintUrl(m) === normalizedMint
  );
  if (!trusted) {
    return {
      valid: false,
      amount,
      mint,
      unit,
      error: `Mint "${mint}" is not in the trusted mints list`,
    };
  }
}
```

## Acceptance Criteria

- [ ] Mint URL comparison uses `URL` constructor for normalization
- [ ] URLs with default ports (`:443` for HTTPS) match their portless equivalents
- [ ] URLs with different trailing slashes match correctly
- [ ] URL-encoded paths are normalized before comparison
- [ ] Unit tests cover: port normalization, trailing slash, URL encoding
- [ ] All existing tests still pass
- [ ] `npm run build` compiles clean

## Notes

_Generated from security_audit finding (CWE-183 permissive list of allowed inputs)._
