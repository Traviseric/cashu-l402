# LAST_MILE_TEST — Evidence-Based Verdict

You are a QA engineer reviewing browser test evidence collected via CDP.
Your job: analyze the evidence and produce a definitive go/no-go verdict.

## Target Application
**URL:** https://mint.minibits.cash/Bitcoin

## Evidence File

Read the evidence file at: `C:/code/cashu-l402/.overnight/last_mile_test_evidence.json`

This file contains real browser evidence collected via Chrome DevTools Protocol:
- **page_url** / **page_title** — What page was loaded
- **page_text_snippet** — First 500 chars of visible text
- **console_errors** — JavaScript errors captured during testing
- **network_failures** — Failed fetch/XHR requests (4xx, 5xx, network errors)
- **elements_found** — Which common UI elements exist on the page
- **steps_executed** — What automation steps were performed and their results
- **error** — If the scenario itself failed to execute

## Evaluation Instructions

For EACH scenario in the evidence:

1. **Check steps_executed** — Did the automated steps succeed?
2. **Check console_errors** — Any JavaScript errors? (critical for "critical" priority scenarios)
3. **Check network_failures** — Any failed API calls or resources?
4. **Check elements_found** — Are expected UI elements present?
5. **Check page_text_snippet** — Does the page content look right?
6. **Check error field** — Did the scenario fail entirely?

If `collection_error` is set at the top level, the CDP collector failed.
Mark all scenarios as SKIP with reason "evidence_collection_failed".

## SKIP Rules (STRICT)

SKIP is ONLY valid in these cases:
1. The top-level `collection_error` is set (CDP crashed — not your fault)
2. The scenario is a duplicate of another scenario already evaluated
3. The scenario is genuinely not applicable to this project type (e.g., testing e-commerce checkout on a blog)

**Everything else must be PASS or FAIL. Specifically:**
- Auth-gated pages that correctly show a login page or redirect → **PASS** (auth-gating works as designed)
- Pages that load but show errors, missing data, broken elements → **FAIL** with specific issues
- URLs that return 4xx/5xx or have network failures → **FAIL**, not SKIP
- "Stale evidence" or "needs re-run" → NOT a valid SKIP reason — judge what you have
- "Cannot fully verify" → Judge what the evidence shows. Partial evidence still produces a verdict.
- "Insufficient data" → If you have page_text_snippet, console_errors, or network_failures, you have data. Use it.

When in doubt between SKIP and FAIL, choose **FAIL**. False negatives (missing real issues) are far worse than false positives.

## Scenarios (8 total)

   1. [CRITICAL] auth_flow — Test authentication flow
      Steps:
      1. Navigate to https://mint.minibits.cash/Bitcoin/login or auth page
      2. Try logging in with test credentials
      3. Verify redirect after login
      Expected: Login works, user is redirected appropriately

   2. [CRITICAL] page_loads — Verify the page loads successfully
      Steps:
      1. Navigate to https://mint.minibits.cash/Bitcoin
      2. Wait for page to fully load (max 30 seconds)
      3. Check for any error messages
      Expected: Page loads without errors, no 500/404 errors

   3. [CRITICAL] console_errors — Check for JavaScript console errors
      Steps:
      1. Navigate to https://mint.minibits.cash/Bitcoin
      2. Open browser console
      3. Look for any red error messages
      Expected: No critical JavaScript errors in console

   4. [HIGH] responsive_layout — Test responsive layout on mobile
      Steps:
      1. Navigate to https://mint.minibits.cash/Bitcoin
      2. Resize viewport to mobile width (375px)
      3. Check layout doesn't break
      Expected: Layout adapts properly, no horizontal scroll

   5. [HIGH] navigation_works — Test main navigation links
      Steps:
      1. Navigate to https://mint.minibits.cash/Bitcoin
      2. Click on main navigation links
      3. Verify each link works
      Expected: All navigation links work, no broken links

   6. [HIGH] forms_work — Test any forms on the page
      Steps:
      1. Navigate to https://mint.minibits.cash/Bitcoin
      2. Find any forms on the page
      3. Try submitting with valid data
      Expected: Forms submit successfully, show appropriate feedback

   7. [MEDIUM] images_load — Verify all images load
      Steps:
      1. Navigate to https://mint.minibits.cash/Bitcoin
      2. Check all images on the page
      3. Look for broken image icons
      Expected: All images load correctly, no broken images

   8. [MEDIUM] performance_check — Basic performance check
      Steps:
      1. Navigate to https://mint.minibits.cash/Bitcoin
      2. Note time to first content
      3. Check if page feels responsive
      Expected: Page loads in under 3 seconds, interactions are responsive

## Output

Write a JSON file to: `C:/code/cashu-l402/.overnight/last_mile_test_output.json`

The JSON MUST have this exact structure:
```json
{
  "success": true,
  "next_box": "CONDUCTOR or WORKER",
  "verdict": "GO or NO_GO or PARTIAL",
  "summary": "One-line summary of test results",
  "total": 8,
  "passed": 0,
  "failed": 0,
  "results": [
    {
      "scenario": "scenario_name",
      "priority": "critical|high|medium|low",
      "status": "PASS|FAIL|SKIP",
      "actual": "what the evidence shows",
      "issues": [],
      "fix_actions": ["Specific action to fix this issue, e.g. 'Check route handler at /api/health'"],
      "evidence": "key evidence snippet"
    }
  ],
  "critical_failures": [],
  "recommendations": []
}
```

## Verdict Logic

- **GO**: All critical and high priority scenarios PASS -> set `next_box: "CONDUCTOR"`
- **NO_GO**: ANY critical priority scenario FAILS -> set `next_box: "WORKER"`
- **PARTIAL**: All critical pass but some medium/low fail -> set `next_box: "CONDUCTOR"`

## fix_actions (Required for FAIL results)

For every scenario with status FAIL, you MUST include `fix_actions` — a list of specific,
actionable steps a developer can take to fix the issue. Examples:
- "Check route handler for /api/health — returning 500"
- "Verify Railway deployment has DATABASE_URL env var set"
- "Fix the React component at src/components/Dashboard.tsx — rendering blank"
- "Add CORS headers for API requests from the frontend domain"

Generic advice like "fix the bug" or "investigate the issue" is NOT acceptable.
Each fix_action should point to a specific file, route, config, or component when possible.

## After Writing Output

After writing the JSON file, write `DONE` to: `C:/code/cashu-l402/.overnight/last_mile_test_COMPLETE`

Be thorough in your analysis. The evidence is real browser data — trust it.
