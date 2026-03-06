---
id: 1
title: "Scaffold TypeScript/Node.js project with cashu-ts"
priority: P0
severity: critical
status: completed
source: gap_analyzer
file: package.json
line: null
created: "2026-02-28T00:00:00"
execution_hint: sequential
context_group: scaffold
group_reason: "Must be completed first — all other tasks depend on project scaffolding"
---

# Scaffold TypeScript/Node.js project with cashu-ts

**Priority:** P0 (critical)
**Source:** gap_analyzer
**Location:** project root

## Problem

The cashu-l402 project directory is completely empty — no source code, dependency files, configuration, documentation, or any project files exist beyond the .overnight orchestration infrastructure. No language or framework has been chosen and no project manifest exists (no package.json, pyproject.toml, go.mod, or Cargo.toml). This is a blocking gap: nothing can be built until the project is scaffolded.

**Current state:** Only `.overnight/` and `.pras/` directories exist. Zero code files.

## How to Fix

Create a TypeScript/Node.js project with the following structure:

1. **`package.json`** — Initialize with:
   - `name: "cashu-l402"`
   - `version: "0.1.0"`
   - Dependencies: `@cashu/cashu-ts` (Cashu ecash SDK), `express` or `fastify` (HTTP server), `@grpc/grpc-js` or Lightning payment library
   - DevDependencies: `typescript`, `@types/node`, `ts-node`, `jest` (or `vitest`), `@types/jest`

2. **`tsconfig.json`** — TypeScript configuration:
   - `target: "ES2022"`, `module: "commonjs"` (or ESM)
   - `strict: true`, `outDir: "./dist"`, `rootDir: "./src"`

3. **`src/index.ts`** — Main entry point (can be minimal, just a stub)

4. **`src/` directory structure:**
   ```
   src/
     index.ts          # Entry point
     cashu/            # Cashu ecash module
     l402/             # L402 middleware module
     integration/      # Integration layer
   ```

5. **`.gitignore`** — Exclude node_modules, dist, .env

6. **Install dependencies** — Run `npm install` (or `pnpm install` / `yarn install`)

## Acceptance Criteria

- [ ] `package.json` exists with correct dependencies including `@cashu/cashu-ts`
- [ ] `tsconfig.json` exists with strict TypeScript settings
- [ ] `src/index.ts` exists as a valid TypeScript entry point
- [ ] Directory structure `src/cashu/`, `src/l402/`, `src/integration/` created
- [ ] `npm run build` compiles without errors
- [ ] `.gitignore` excludes node_modules and dist
- [ ] No regressions introduced

## Notes

_Generated from gap_analyzer findings. This is a greenfield project — task 001 must complete before tasks 002, 003, 004 can proceed._
