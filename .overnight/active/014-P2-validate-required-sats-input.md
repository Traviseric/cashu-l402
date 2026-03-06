---
id: 14
title: "Validate REQUIRED_SATS environment variable as positive integer"
priority: P2
severity: medium
status: pending
source: security_audit
file: src/integration/config.ts
line: 22
created: "2026-02-28T06:00:00"
execution_hint: sequential
context_group: integration_module
group_reason: "Touches src/integration/config.ts — same module as tasks 8, 9"
---

# Validate REQUIRED_SATS environment variable as positive integer

**Priority:** P2 (medium)
**Source:** security_audit (CWE-20)
**Location:** src/integration/config.ts:22

## Problem

The required payment amount is parsed from `REQUIRED_SATS` without validating that the result is a positive integer. `parseInt('0', 10)` returns `0` and `parseInt('-1', 10)` returns `-1`, both of which would effectively disable the payment requirement. Additionally, `parseInt('abc', 10)` returns `NaN`, which would silently default to a nonsensical amount. The default of 10 satoshis (~$0.004 USD) is also extremely low for abuse prevention.

**Code with issue:**
```typescript
const requiredAmount = parseInt(process.env['REQUIRED_SATS'] ?? '10', 10);
```

## How to Fix

Add strict validation to ensure the parsed value is a positive integer:

```typescript
function parsePositiveInt(value: string, envVarName: string): number {
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `${envVarName} must be a positive integer, got: "${value}"`
    );
  }
  return parsed;
}

export function loadConfig(): CashuL402Config {
  const mintUrl = process.env['CASHU_MINT_URL'] ?? 'https://mint.minibits.cash/Bitcoin';
  // ... URL validation ...

  const requiredSatsEnv = process.env['REQUIRED_SATS'] ?? '10';
  const requiredAmount = parsePositiveInt(requiredSatsEnv, 'REQUIRED_SATS');

  return { mintUrl, requiredAmount, trustedMints: [mintUrl] };
}
```

Consider raising the default minimum to something more meaningful (e.g., 100 sats) to improve abuse resistance.

## Acceptance Criteria

- [ ] `loadConfig()` throws a clear error if `REQUIRED_SATS` parses to zero, negative, or `NaN`
- [ ] `loadConfig()` throws if `REQUIRED_SATS` is a non-numeric string
- [ ] Unit tests cover: `'0'`, `'-1'`, `'abc'`, `'1.5'`, `'100'` (valid)
- [ ] All existing tests still pass
- [ ] `npm run build` compiles clean

## Notes

_Generated from security_audit finding (CWE-20 improper input validation)._
