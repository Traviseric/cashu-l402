@echo off
cd /d "C:\\code\\te-btc\\cashu-l402"

REM Clear API key to prevent fallback
set ANTHROPIC_API_KEY=

REM Use OAuth token for Pro subscription
set CLAUDE_CODE_OAUTH_TOKEN=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

REM Atomic credential swap (preserves mcpOAuth and other keys)
python "C:/code/orchestrator/src/orchestrator/tools/creds_swap.py" swap --token "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" --lane-id "worker_003"

echo ========================================
echo MANAGED WORKER_003 v3.0.0
echo Interactive mode - manager controls tasks
echo ========================================
echo.

claude --dangerously-skip-permissions --model sonnet 2>"C:\\code\\te-btc\\cashu-l402\\.overnight\\worker_003_managed_stderr.log"
set CLAUDE_EXIT=%ERRORLEVEL%

REM Restore original credentials file
python "C:/code/orchestrator/src/orchestrator/tools/creds_swap.py" restore --lane-id "worker_003"

echo.
echo ========================================
echo MANAGED WORKER_003 session ended. Exit code: %CLAUDE_EXIT%
echo ========================================

REM Check stderr for rate limit signals
if exist "C:\\code\\te-btc\\cashu-l402\\.overnight\\worker_003_managed_stderr.log" (
    findstr /i /c:"hit your limit" /c:"rate-limit" /c:"resets" "C:\\code\\te-btc\\cashu-l402\\.overnight\\worker_003_managed_stderr.log" >nul 2>&1
    if not errorlevel 1 (
        echo MANAGED WORKER RATE LIMITED - see C:\\code\\te-btc\\cashu-l402\\.overnight\\worker_003_managed_stderr.log
    )
)
