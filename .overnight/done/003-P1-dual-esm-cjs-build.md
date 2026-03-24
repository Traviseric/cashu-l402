---
id: 3
title: "Add dual ESM/CJS build output for npm publication"
priority: P1
severity: high
status: completed
source: gap_analyzer
file: package.json
line: 10
created: "2026-02-28T00:00:00Z"
execution_hint: parallel
context_group: npm_publish
group_reason: "Independent build infrastructure change; required before npm publish (Phase 4)"
---

# Add dual ESM/CJS build output for npm publication

**Priority:** P1 (high)
**Source:** gap_analyzer + feature_audit
**Location:** package.json, tsconfig.json

## Problem

The package currently only produces ESM output (`dist/index.js`). The `package.json` exports only expose an `import` (ESM) entry:

```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  }
}
```

This blocks adoption by:
- CommonJS consumers (Node.js projects without `"type": "module"`)
- Bundlers that prefer CJS for SSR (Next.js pages router, older Webpack configs)
- Any tool that uses `require()` instead of dynamic `import()`

The ROADMAP.md Phase 4 specifies "Dual ESM/CJS publishing via tsdown (esbuild)" as a prerequisite for ArxMint migration and general npm availability.

## How to Fix

### Option A (Recommended): Use `tsdown` (esbuild-based, purpose-built for libraries)

Install tsdown as a devDependency:
```bash
npm install --save-dev tsdown
```

Create `tsdown.config.ts`:
```typescript
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  outDir: 'dist',
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['@cashu/cashu-ts', '@noble/curves', '@noble/hashes', 'zod'],
});
```

Update `package.json`:
```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    }
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc --noEmit"
  }
}
```

### Option B: Dual tsconfig approach (tsc only, no new deps)

Keep tsc for ESM output. Add `tsconfig.cjs.json` with `"module": "CommonJS"` targeting `dist/cjs/`. Update package.json to point to both outputs. More complex than tsdown but avoids adding esbuild.

### After build setup

Update `package.json` `files` array if output paths change. Run `npm pack --dry-run` to verify the package contents before publishing.

## Acceptance Criteria

- [ ] `npm run build` produces both ESM and CJS outputs
- [ ] `package.json` `exports` field includes both `import` (ESM) and `require` (CJS) conditions
- [ ] `types` entry points to a valid `.d.ts` file
- [ ] `npm pack --dry-run` shows correct file list
- [ ] All 177 tests still pass after build config change
- [ ] TypeScript types still work (`npm run typecheck` passes)

## Notes

_Generated from gap_analyzer — "Build uses plain tsc, outputting ESM only. No tsdown/esbuild config. package.json exports only ESM (.js), no CJS (.cjs) entry." This is a prerequisite for Phase 4 npm publish and ArxMint migration._
