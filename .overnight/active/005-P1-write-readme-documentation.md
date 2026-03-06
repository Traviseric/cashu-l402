---
id: 5
title: "Write README.md documenting the cashu-l402 protocol and API"
priority: P1
severity: high
status: completed
source: gap_analyzer
file: README.md
line: null
created: "2026-02-28T00:00:00"
execution_hint: parallel
context_group: documentation
group_reason: "Documentation task — can be worked in parallel once scaffolding exists, independent of core implementation"
---

# Write README.md documenting the cashu-l402 protocol and API

**Priority:** P1 (high)
**Source:** gap_analyzer
**Location:** README.md

## Problem

No README.md or any documentation files exist in the project. A library/service combining Cashu ecash with L402 authentication needs clear documentation to be usable. Without it:
- Contributors cannot understand the project's goals
- Users cannot integrate the library
- The protocol design isn't documented

**Current state:** No README.md or any documentation files exist outside the `.overnight` orchestration directory.

## How to Fix

Create `README.md` in the project root with:

### Required sections:
1. **Project overview** — What cashu-l402 is and why it matters (privacy-preserving API monetization)
2. **How it works** — Protocol flow diagram/description:
   - Standard L402 flow vs. Cashu-enhanced flow
   - Why Cashu tokens provide better privacy than bare Lightning preimages
3. **Installation** — `npm install`, environment setup
4. **Quick start** — Minimal code example showing a protected Express route
5. **Configuration** — Environment variables (`CASHU_MINT_URL`, `REQUIRED_SATS`, etc.)
6. **API reference** — `cashuL402Middleware(config)` function signature and options
7. **Protocol details** — HTTP header formats, Authorization header format for Cashu tokens
8. **Related projects** — cashu-ts, L402 spec, NUTs specification

### Also create:
- `docs/` directory with architecture diagram (optional but valuable)

## Acceptance Criteria

- [ ] README.md exists in project root
- [ ] Explains what the project does in the first paragraph
- [ ] Shows a working code example (copy from task 004's index.ts)
- [ ] Documents all configuration options
- [ ] Documents the Authorization header format for Cashu tokens
- [ ] Includes links to cashu-ts, NUTs spec, and L402 spec
- [ ] No regressions introduced

## Notes

_Generated from gap_analyzer findings. Can be written in parallel with core implementation (tasks 002-004) or after._
