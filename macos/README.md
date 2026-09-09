# macOS runbooks

The [root README](../README.md#macos) contains the complete dated macOS index.

## OpenClaw credential recovery

| Date | Runbook | Status |
| --- | --- | --- |
| 2026-09-10 | [OpenClaw 2026.9.1 SecretRef migration and Gateway recovery](openclaw-secretref-migration-macos-2026-09-10.md) | Reported resolved; reload/probe diagnostics remain technical debt |
| 2026-09-09 | [OpenClaw provider authentication, model routing, and security hardening](openclaw-provider-auth-routing-hardening-macos-2026-09-09.md) | Earlier store-backed canary evidence; preserved as historical context |

The migration runbook covers env-backed provider recovery, Keychain/login-shell loading, safe Gateway token rotation after dotenv truncation, audit interpretation, protected backups, and JSON/SQLite rollback. Its evidence section distinguishes operator-reported outcomes from documentation-session checks.
