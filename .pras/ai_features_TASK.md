# AI_FEATURES — Feature Implementation Verification

## Project
Path: C:\code\te-btc\cashu-l402
Slug: cashu-l402

## Discovered Features
The following features were extracted from this project's documentation:

```json
[
  {
    "id": "pkg-description",
    "name": "Cashu ecash \u2194 L402 settlement bridge \u2014 atomic ecash-to-macaroon exchange",
    "description": "Cashu ecash \u2194 L402 settlement bridge \u2014 atomic ecash-to-macaroon exchange",
    "source": "package-json",
    "source_location": "package.json:description",
    "confidence": 0.6,
    "keywords": [
      "cashu",
      "ecash",
      "l402",
      "settlement",
      "bridge",
      "atomic",
      "ecash",
      "macaroon",
      "exchange"
    ],
    "status_hint": ""
  },
  {
    "id": "doc-ROADMAP-1",
    "name": "Conditional Proof Integration (Research #2)",
    "description": "Conditional Proof Integration (Research #2)",
    "source": "docs",
    "source_location": "ROADMAP.md:42",
    "confidence": 0.6,
    "keywords": [
      "conditional",
      "proof",
      "integration",
      "research"
    ],
    "status_hint": ""
  },
  {
    "id": "doc-ROADMAP-2",
    "name": "`verifyCashuPaymentOffline()` detects conditions on incoming proofs via `detectConditions()`",
    "description": "`verifyCashuPaymentOffline()` detects conditions on incoming proofs via `detectConditions()`",
    "source": "docs",
    "source_location": "ROADMAP.md:43",
    "confidence": 0.75,
    "keywords": [
      "verifycashupaymentoffline",
      "detects",
      "conditions",
      "incoming",
      "proofs",
      "via",
      "detectconditions"
    ],
    "status_hint": "done"
  },
  {
    "id": "doc-ROADMAP-3",
    "name": "Auto-extract condition caveats \u2192 embed in bridge L402 macaroon via `extractConditionCaveats()`",
    "description": "Auto-extract condition caveats \u2192 embed in bridge L402 macaroon via `extractConditionCaveats()`",
    "source": "docs",
    "source_location": "ROADMAP.md:44",
    "confidence": 0.75,
    "keywords": [
      "auto",
      "extract",
      "condition",
      "caveats",
      "embed",
      "bridge",
      "l402",
      "macaroon",
      "via",
      "extractconditioncaveats"
    ],
    "status_hint": "done"
  },
  {
    "id": "doc-ROADMAP-4",
    "name": "Time-lock aware TTL: macaroon TTL = `min(default_ttl, locktime - now)`, expired locktimes rejected",
    "description": "Time-lock aware TTL: macaroon TTL = `min(default_ttl, locktime - now)`, expired locktimes rejected",
    "source": "docs",
    "source_location": "ROADMAP.md:45",
    "confidence": 0.75,
    "keywords": [
      "time",
      "lock",
      "aware",
      "ttl",
      "macaroon",
      "ttl",
      "mindefault",
      "ttl",
      "locktime",
      "now",
      "expired",
      "locktimes",
      "rejected"
    ],
    "status_hint": "done"
  },
  {
    "id": "doc-ROADMAP-5",
    "name": "`src/pending-proofs.ts` \u2014 `createPendingProofStore()` with `register`, `resolve`, `expire` (PoS/escrow resolution stub)",
    "description": "`src/pending-proofs.ts` \u2014 `createPendingProofStore()` with `register`, `resolve`, `expire` (PoS/escrow resolution stub)",
    "source": "docs",
    "source_location": "ROADMAP.md:46",
    "confidence": 0.75,
    "keywords": [
      "src",
      "pending",
      "proofs",
      "creatependingproofstore",
      "register",
      "resolve",
      "expire",
      "pos",
      "escrow",
      "resolution",
      "stub"
    ],
    "status_hint": "done"
  },
  {
    "id": "doc-ROADMAP-6",
    "name": "Tests for conditional verify flow (10 tests \u2014 TTL clamping, expired locktime rejection, condition caveats in macaroon, deduplication)",
    "description": "Tests for conditional verify flow (10 tests \u2014 TTL clamping, expired locktime rejection, condition caveats in macaroon, deduplication)",
    "source": "docs",
    "source_location": "ROADMAP.md:47",
    "confidence": 0.75,
    "keywords": [
      "tests",
      "conditional",
      "verify",
      "flow",
      "tests",
      "ttl",
      "clamping",
      "expired",
      "locktime",
      "rejection",
      "condition",
      "caveats",
      "macaroon",
      "deduplication"
    ],
    "status_hint": "done"
  },
  {
    "id": "doc-ROADMAP-7",
    "name": "Tests for settlement queue (15 tests \u2014 enqueue/count, flush, partial failures, hooks, concurrent safety)",
    "description": "Tests for settlement queue (15 tests \u2014 enqueue/count, flush, partial failures, hooks, concurrent safety)",
    "source": "docs",
    "source_location": "ROADMAP.md:48",
    "confidence": 0.75,
    "keywords": [
      "tests",
      "settlement",
      "queue",
      "tests",
      "enqueue",
      "count",
      "flush",
      "partial",
      "failures",
      "hooks",
      "concurrent",
      "safety"
    ],
    "status_hint": "done"
  },
  {
    "id": "doc-ROADMAP-8",
    "name": "Phase 3: Integration Hardening (3-5 days)",
    "description": "Phase 3: Integration Hardening (3-5 days)",
    "source": "docs",
    "source_location": "ROADMAP.md:55",
    "confidence": 0.7,
    "keywords": [
      "phase",
      "integration",
      "hardening",
      "days"
    ],
    "status_hint": ""
  },
  {
    "id": "doc-ROADMAP-9",
    "name": "Docker Integration Tests (Research #3 \u2014 Polar + aesir)",
    "description": "Docker Integration Tests (Research #3 \u2014 Polar + aesir)",
    "source": "docs",
    "source_location": "ROADMAP.md:59",
    "confidence": 0.6,
    "keywords": [
      "docker",
      "integration",
      "tests",
      "research",
      "polar",
      "aesir"
    ],
    "status_hint": ""
  },
  {
    "id": "doc-ROADMAP-10",
    "name": "Docker compose / aesir setup: bitcoind + LND + Nutshell mint",
    "description": "Docker compose / aesir setup: bitcoind + LND + Nutshell mint",
    "source": "docs",
    "source_location": "ROADMAP.md:60",
    "confidence": 0.75,
    "keywords": [
      "docker",
      "compose",
      "aesir",
      "setup",
      "bitcoind",
      "lnd",
      "nutshell",
      "mint"
    ],
    "status_hint": "wip"
  },
  {
    "id": "doc-ROADMAP-11",
    "name": "Integration test: fund cashu-ts wallet \u2192 pay L402 paywall \u2192 verify full flow",
    "description": "Integration test: fund cashu-ts wallet \u2192 pay L402 paywall \u2192 verify full flow",
    "source": "docs",
    "source_location": "ROADMAP.md:61",
    "confidence": 0.75,
    "keywords": [
      "integration",
      "test",
      "fund",
      "cashu",
      "wallet",
      "pay",
      "l402",
      "paywall",
      "verify",
      "full",
      "flow"
    ],
    "status_hint": "wip"
  },
  {
    "id": "doc-ROADMAP-12",
    "name": "Integration test: P2PK-locked proofs + DLEQ \u2192 offline verification \u2192 macaroon issuance \u2192 token reuse",
    "description": "Integration test: P2PK-locked proofs + DLEQ \u2192 offline verification \u2192 macaroon issuance \u2192 token reuse",
    "source": "docs",
    "source_location": "ROADMAP.md:62",
    "confidence": 0.75,
    "keywords": [
      "integration",
      "test",
      "p2pk",
      "locked",
      "proofs",
      "dleq",
      "offline",
      "verification",
      "macaroon",
      "issuance",
      "token",
      "reuse"
    ],
    "status_hint": "wip"
  },
  {
    "id": "doc-ROADMAP-13",
    "name": "Integration test: background batch-melt queue settles locked proofs with mint",
    "description": "Integration test: background batch-melt queue settles locked proofs with mint",
    "source": "docs",
    "source_location": "ROADMAP.md:63",
    "confidence": 0.75,
    "keywords": [
      "integration",
      "test",
      "background",
      "batch",
      "melt",
      "queue",
      "settles",
      "locked",
      "proofs",
      "mint"
    ],
    "status_hint": "wip"
  },
  {
    "id": "doc-ROADMAP-14",
    "name": "Integration test against ArxMint (swap out lib/cashu-paywall.ts with @te-btc/cashu-l402)",
    "description": "Integration test against ArxMint (swap out lib/cashu-paywall.ts with @te-btc/cashu-l402)",
    "source": "docs",
    "source_location": "ROADMAP.md:64",
    "confidence": 0.75,
    "keywords": [
      "integration",
      "test",
      "against",
      "arxmint",
      "swap",
      "out",
      "lib",
      "cashu",
      "paywall",
      "btc",
      "cashu",
      "l402"
    ],
    "status_hint": "wip"
  },
  {
    "id": "doc-ROADMAP-15",
    "name": "Middleware + Production Hooks",
    "description": "Middleware + Production Hooks",
    "source": "docs",
    "source_location": "ROADMAP.md:66",
    "confidence": 0.6,
    "keywords": [
      "middleware",
      "production",
      "hooks"
    ],
    "status_hint": ""
  },
  {
    "id": "doc-ROADMAP-16",
    "name": "Fastify middleware helper: `fastifyCashuL402(config)` \u2014 optional, separate export",
    "description": "Fastify middleware helper: `fastifyCashuL402(config)` \u2014 optional, separate export",
    "source": "docs",
    "source_location": "ROADMAP.md:67",
    "confidence": 0.75,
    "keywords": [
      "fastify",
      "middleware",
      "helper",
      "fastifycashul402config",
      "optional",
      "separate",
      "export"
    ],
    "status_hint": "wip"
  },
  {
    "id": "doc-ROADMAP-17",
    "name": "Express middleware helper: `expressCashuL402(config)` \u2014 optional, separate export",
    "description": "Express middleware helper: `expressCashuL402(config)` \u2014 optional, separate export",
    "source": "docs",
    "source_location": "ROADMAP.md:68",
    "confidence": 0.75,
    "keywords": [
      "express",
      "middleware",
      "helper",
      "expresscashul402config",
      "optional",
      "separate",
      "export"
    ],
    "status_hint": "wip"
  },
  {
    "id": "doc-ROADMAP-18",
    "name": "Error codes enum (standardized error responses for 402 flows)",
    "description": "Error codes enum (standardized error responses for 402 flows)",
    "source": "docs",
    "source_location": "ROADMAP.md:69",
    "confidence": 0.75,
    "keywords": [
      "error",
      "codes",
      "enum",
      "standardized",
      "error",
      "responses",
      "flows"
    ],
    "status_hint": "wip"
  },
  {
    "id": "doc-ROADMAP-19",
    "name": "Rate limiting hooks (integrator provides limiter, library calls it)",
    "description": "Rate limiting hooks (integrator provides limiter, library calls it)",
    "source": "docs",
    "source_location": "ROADMAP.md:70",
    "confidence": 0.75,
    "keywords": [
      "rate",
      "limiting",
      "hooks",
      "integrator",
      "provides",
      "limiter",
      "library",
      "calls"
    ],
    "status_hint": "wip"
  },
  {
    "id": "doc-ROADMAP-20",
    "name": "Structured logging hooks (integrator provides logger)",
    "description": "Structured logging hooks (integrator provides logger)",
    "source": "docs",
    "source_location": "ROADMAP.md:71",
    "confidence": 0.75,
    "keywords": [
      "structured",
      "logging",
      "hooks",
      "integrator",
      "provides",
      "logger"
    ],
    "status_hint": "wip"
  }
]
```

## Your Task

You are a senior engineer verifying whether claimed features are actually implemented.
For EACH discovered feature above:

1. **Search the codebase** for files related to this feature using the keywords
2. **Check implementation status**:
   - `complete` — Real logic exists, handles edge cases, appears functional
   - `partial` — Some logic exists but gaps remain (missing error handling, incomplete flows)
   - `stub` — Function/route exists but returns placeholder/throws "not implemented"
   - `mock` — Returns hardcoded/fake data
   - `missing` — No code found that implements this feature
   - `untested` — Code exists but no tests found
3. **Collect evidence** — file paths, line numbers, code snippets proving the status
4. **Check for tests** — does this feature have test coverage?

Be thorough. A feature might be split across multiple files. Check:
- Exported functions matching feature keywords
- API route handlers
- React components/pages
- Database schemas/models
- Configuration files

## Output Format

Write ONLY valid JSON to the output file.

```json
{
  "verifications": [
    {
      "feature_id": "<matches discovered feature id>",
      "status": "complete|partial|stub|mock|missing|untested",
      "confidence": 0.0-1.0,
      "has_tests": true|false,
      "files": ["<relative/path/to/file.ts>"],
      "evidence": [
        {
          "type": "code|test|config",
          "file": "<relative/path>",
          "line": <line_number>,
          "snippet": "<brief code snippet>",
          "note": "<why this proves the status>"
        }
      ],
      "summary": "<one-line explanation of implementation state>"
    }
  ]
}
```

Write output to: C:\code\te-btc\cashu-l402\.pras\ai_features_verify_output.json
