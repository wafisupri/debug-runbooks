# Debug Runbooks
---

Real-world debugging sessions converted into concise, verified recovery guides.

These are not raw chat transcripts. Each runbook records what failed, why it failed, what troubleshooting approaches did not help, the final working solution, and how the fix was verified.

The goal is to preserve practical debugging knowledge so the same problem can be solved faster the next time it appears.

## Runbook Structure
---

Every runbook follows a common structure:

### Summary
---

A concise description of the problem and the final outcome.

### Environment
---

The operating system, software versions, paths, shells, runtimes, hardware, and other relevant context.

### Symptoms
---

The errors, unexpected behavior, logs, or other observations that originally exposed the problem.

### Root Cause
---

The underlying technical reason the problem occurred.

### What Did Not Work
---

Troubleshooting attempts, incorrect assumptions, misleading fixes, or repetitive actions that should not be repeated.

### Final Fix
---

The working solution and why it resolves the underlying problem.

### Commands
---

The important commands consolidated into a clean sequence.

### Verification
---

The checks used to prove that the solution actually works.

### Final Working State
---

The known-good configuration after troubleshooting was completed.

### Optional Cleanup
---

Old files, packages, services, configurations, or other remnants that are safe to remove but are not required for the fix.

### If This Happens Again
---

The shortest reliable diagnostic and recovery procedure.

## macOS
---

| Date | Runbook | Status |
|---|---|---|
| 2026-08-25 | [Kimi Code 0.38 Provider Recovery & Verified 9Router Gemini Default](macos/kimi-code-0.38-provider-recovery-2026-08-25.md) | Fixed |
| 2026-08-22 | [FreeLLM Multi-CLI Free-Tier Model Aggregation & Failover Setup](macos/freellm-multi-cli-free-models-setup-2026-08-22.md) | Fixed |
| 2026-08-22 | [OpenCode + Vercel AI Gateway Setup (Free-Tier Model Labeling)](macos/opencode-vercel-ai-gateway-setup-2026-08-22.md) | Fixed |
| 2026-08-22 | [TokenRouter Multi-CLI Integration & Claude Code Bridge Setup](macos/tokenrouter-multi-cli-setup-2026-08-22.md) | Fixed |
| 2026-08-22 | [Claude Code Permissions Setup (Global)](macos/claude-code-permissions-setup-2026-08-22.md) | Fixed |
| 2026-08-21 | [Claude Code + OmniRoute Environment Setup](macos/claude-code-omniroute-env-setup-2026-08-21.md) | Fixed |
| 2026-08-07 | [Hermes + Composio + GitHub Fix](macos/hermes-composio-github-session-2026-08-07.md) | Fixed |
| 2026-08-07 | [FreeLLM + OmniRoute + OpenCode Terminal Recovery](macos/terminal-crash-recovery-runbook.md) | Fixed |

## Windows
---

| Date | Runbook | Status |
|---|---|---|
| 2026-08-23 | [PM2 Windows Dual-Router Setup (OmniRoute + 9Router Port Mapping & Daemonization)](windows/2026-08-23-pm2-windows-dual-router-setup.md) | Fixed |
| 2026-08-23 | [Windows Multi-CLI Free-Tier Model Setup (OmniRoute + OpenClaw + Hermes)](windows/2026-08-23-windows-multi-cli-free-model-setup.md) | Fixed |
| 2026-08-23 | [Windows Multi-Provider Kimi/DeepSeek Setup (PWA + OpenCode + Pi + OpenClaude + Kimi Code)](windows/2026-08-23-windows-multi-provider-kimi-deepseek-setup.md) | Fixed |

## Linux
---

| Date | Runbook | Status |
|---|---|---|
| — | *No runbooks yet.* | — |

## Cross-platform
---

| Date | Runbook | Status |
|---|---|---|
| 2026-08-23 | [Agent Amnesia Across the CLI Fleet (Local Memory MCP Servers)](cross-platform/local-memory-mcp-setup-runbook.md) | Fixed |

## Philosophy
---

A useful runbook should answer four questions:

1. What actually broke?

2. Why did it break?

3. What fixed it?

4. How do I prove it is fixed?

The emphasis is on verified solutions rather than reproducing every troubleshooting step.
## License
---

The original documentation in this repository is licensed under the
[Creative Commons Attribution 4.0 International License (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

You are free to share and adapt these runbooks, including for commercial purposes, provided appropriate credit is given.

Third-party software, command output, logs, trademarks, screenshots, code snippets, and other referenced material remain subject to their respective licenses and rights.
