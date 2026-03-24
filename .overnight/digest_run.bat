@echo off
title DIGEST - Claude Box
cd /d "C:/code/te-btc/cashu-l402"

REM Clear API key to prevent fallback
set ANTHROPIC_API_KEY=

REM Allow spawning from within a Claude Code session (e.g. testing)
set CLAUDECODE=

REM Use OAuth token for Pro subscription (env var only — no file swap to avoid race conditions)
set CLAUDE_CODE_OAUTH_TOKEN=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

echo ========================================
echo DIGEST BOX v2.0.0
echo Using Pro subscription (OAuth)
echo ========================================
echo.

claude --dangerously-skip-permissions --model sonnet "Read C:/code/te-btc/cashu-l402/.overnight/DIGEST_TASK.md and execute the task autonomously. Don't ask questions - make reasonable decisions and proceed. Write output to C:/code/te-btc/cashu-l402/.overnight/digest_output.json then write DONE to C:/code/te-btc/cashu-l402/.overnight/digest_COMPLETE" 2>"C:/code/te-btc/cashu-l402/.overnight/digest_stderr.log"
set CLAUDE_EXIT=%ERRORLEVEL%

echo.
echo ========================================
echo DIGEST session ended. Exit code: %CLAUDE_EXIT%
echo ========================================

REM Check stderr for rate limit signals
if exist "C:/code/te-btc/cashu-l402/.overnight/digest_stderr.log" (
    findstr /i /c:"hit your limit" /c:"rate-limit" /c:"resets" "C:/code/te-btc/cashu-l402/.overnight/digest_stderr.log" >nul 2>&1
    if not errorlevel 1 (
        echo RATE_LIMITED: stderr matched rate limit pattern > "C:/code/te-btc/cashu-l402/.overnight/digest_RATE_LIMITED.txt"
        type "C:/code/te-btc/cashu-l402/.overnight/digest_stderr.log" >> "C:/code/te-btc/cashu-l402/.overnight/digest_RATE_LIMITED.txt"
        echo DONE> "C:/code/te-btc/cashu-l402/.overnight/digest_COMPLETE"
        ping -n 3 127.0.0.1 >nul 2>&1
        exit
    )
)

REM If Claude exited fast without writing output, likely rate limited
if not exist "C:/code/te-btc/cashu-l402/.overnight/digest_output.json" (
    if %CLAUDE_EXIT% NEQ 0 (
        echo RATE_LIMITED: Claude exited with code %CLAUDE_EXIT% and no output > "C:/code/te-btc/cashu-l402/.overnight/digest_RATE_LIMITED.txt"
        if exist "C:/code/te-btc/cashu-l402/.overnight/digest_stderr.log" type "C:/code/te-btc/cashu-l402/.overnight/digest_stderr.log" >> "C:/code/te-btc/cashu-l402/.overnight/digest_RATE_LIMITED.txt"
        echo DONE> "C:/code/te-btc/cashu-l402/.overnight/digest_COMPLETE"
        ping -n 3 127.0.0.1 >nul 2>&1
        exit
    )
)

REM Write completion marker only if Claude exited cleanly (exit code 0)
REM If Claude crashed or was killed, let the Python timeout detect the failure
if %CLAUDE_EXIT% EQU 0 (
    if not exist "C:/code/te-btc/cashu-l402/.overnight/digest_COMPLETE" echo DONE> "C:/code/te-btc/cashu-l402/.overnight/digest_COMPLETE"
)

REM Auto-close terminal after completion (Gas Town pattern)
ping -n 3 127.0.0.1 >nul 2>&1
exit
