# Cross-platform Runbooks

| Runbook | Date | Status |
|---|---|---|
| [universal-ai-cli-gateway-launcher-2026-09-04.md](universal-ai-cli-gateway-launcher-2026-09-04.md) | 2026-09-04 | Partial — v0.5.2 policy-guard hardening verified |
| [local-memory-mcp-setup-runbook.md](local-memory-mcp-setup-runbook.md) | 2026-08-23 | Fixed — configured on Windows & macOS |

The Universal AI CLI Gateway Launcher adds a reversible CLI × gateway selection layer while preserving native CLI model pickers and existing gateway infrastructure.

The local-memory runbook covers agent amnesia across the CLI fleet (opencode, claude, openclaude, pi, Kimi Code, Antigravity, GitHub Copilot CLI) on Windows + macOS using three shared local memory MCP servers: `basic-memory`, `memory-service`, `graph-memory`.


Related macOS hardening runbook: [9Router v0.5.65 Policy Guard Persistence Hardening](../macos/9router-v0.5.65-policy-guard-persistence-hardening-2026-09-05.md) — persistent `:20138` guard ownership moved into Universal AI Launcher v0.5.2 and verified with zero Aion catalogue exposure plus HTTP 403 request-time blocking.
