# macOS runbooks

The [root README](../README.md#macos) contains the complete dated macOS index.

## Hermes Agent and MCP integration

| Date | Runbook | Status |
| --- | --- | --- |
| 2026-09-27 | [Hermes Agent partial-clone updater and WhatsApp autostash recovery](hermes-agent-partial-clone-autostash-whatsapp-recovery-2026-09-27.md) | Fixed |
| 2026-09-26 | [Hermes Agent v0.20 You.com MCP OAuth and Portable/Plugin Resolution](hermes-you-mcp-oauth-portable-plugin-conflict-2026-09-26.md) | Fixed |

The 2026-09-27 runbook covers the Hermes partial/promisor-clone updater failure, guarded no-lazy-fetch diagnostics, orphaned updater autostash triage, and a regression-tested local port of missing WhatsApp inbound deduplication and stale self-chat replay protection.

This runbook covers Hermes Agent v0.20 You.com MCP integration (`you`, `you-research`, `you-finance`), resolving the conflict between portable/plugin definitions and native `mcp_servers` configuration, OAuth PKCE flow authorization, top-level `enabled: false` flag resolution, misleading `/reload-mcp` status messages, expected conflict warnings, remaining TUI status display anomaly, and successful registration of 27 tools across 4 MCP servers.

## Local service security

| Date | Runbook | Status |
| --- | --- | --- |
| 2026-09-10 | [macOS localhost AI-service hardening and security cleanup](localhost-ai-service-hardening-security-cleanup-macos-2026-09-10.md) | Completed; credential rotation and launchd inheritance follow-up remain |
| 2026-09-07 | [macOS Localhost AI Service Hardening](macos-localhost-ai-service-hardening-2026-09-07.md) | Fixed / Verified |

This runbook records loopback binding for FreeLLM, FCC, and OmniRoute, persistent startup ownership, OpenClaw shared-store SecretRef cleanup, safe read-only verification, and unresolved credential-hygiene recommendations.

The 2026-09-07 hardening runbook documents the verified current state (FreeLLM :3001, FreeLLM custom :3002, FCC :8082, OmniRoute :20128 all localhost-only), the persistent LaunchAgent architecture (ai.fcc.server, ai.freellm.gateway, ai.freellm.gateway-3002, ai.9router.backend, ai.omniroute.gateway, ai.omniroute.openrouter-free-sync, ai.f0d.policyguard, ai.openclaw.gateway, ai.groq-kimi.compat), the port 3002 ownership discovery, FreeLLM source-patch technical debt (server.ts modified from 0.0.0.0 to 127.0.0.1), the CODEX_OMNIROUTE_API_KEY launchd inheritance security finding requiring user rotation, and the read-only final QA across 12 ports.

## OpenClaw version, runtime, and Gateway recovery

| Date | Runbook | Status |
| --- | --- | --- |
| 2026-09-27 | [OpenClaude Plugin/MCP Cleanup](openclaude-plugin-mcp-cleanup-2026-09-27.md) | Fixed |
| 2026-09-19 | [OpenClaw 2026.9.4 Gateway, Node runtime, and OmniRoute credential recovery](openclaw-2026.9.4-gateway-node-omniroute-recovery-2026-09-19.md) | Fixed |

This runbook covers the OpenClaw v0.31.0 plugin ecosystem cleanup: 310+ installed plugins causing excessive MCP startup surface, stale orphaned processes blocking verification, systematic separation of installed vs enabled plugin states, targeted disabling of unwanted plugins, authentication discipline for only needed MCP integrations, plaintext shadow credential removal, and cold-start verification resulting in 44 enabled plugins with 22 functional MCP servers.

The 2026-09-19 runbook covers Desktop/CLI/Gateway version skew after the Desktop app reached 2026.9.4, a managed Gateway running on a too-old Hermes Node.js v22.23.2, the LaunchAgent reinstall against the supported 2026.9.4 CLI, official plugin alignment, `gateway.mode` restored from `remote` to `local`, and OmniRoute credential routing corrected through the supported secrets migration with a clean audit.

## OpenClaw credential recovery

| Date | Runbook | Status |
| --- | --- | --- |
| 2026-09-10 | [OpenClaw 2026.9.1 SecretRef migration and Gateway recovery](openclaw-secretref-migration-macos-2026-09-10.md) | Reported resolved; reload/probe diagnostics remain technical debt |
| 2026-09-09 | [OpenClaw provider authentication, model routing, and security hardening](openclaw-provider-auth-routing-hardening-macos-2026-09-09.md) | Earlier store-backed canary evidence; preserved as historical context |

The migration runbook covers env-backed provider recovery, Keychain/login-shell loading, safe Gateway token rotation after dotenv truncation, audit interpretation, protected backups, and JSON/SQLite rollback. Its evidence section distinguishes operator-reported outcomes from documentation-session checks.
