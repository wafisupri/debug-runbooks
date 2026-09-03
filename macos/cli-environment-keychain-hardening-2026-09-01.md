# macOS CLI Environment & Keychain Hardening Runbook

**Date:** 2026-09-01  
**Status:** PASS WITH ACCEPTED EXCEPTIONS  
**Platform:** macOS (Apple Silicon, arm64)  

---

## Objective & Scope

- **Objective:** Eliminate plaintext API keys and secrets stored across shell profile files (`~/.zshrc`, `~/.zshenv`), tool configuration files, and wrapper scripts. Consolidate execution paths and package manager configurations under macOS Keychain security.
- **Scope:** All AI CLI agents (Claude Code, OpenClaude, Kimi Code, Codex CLI, OpenCode, Hermes), local gateways (OmniRoute, FreeLLM, 9Router), package managers (Node, npm, corepack pnpm, Bun, Homebrew), and shell environment configurations across `/Users/wfspr`.

---

## Initial Problems & Symptoms

1. **Conflicting / Multiple Node & Package Manager Installations:** Multiple Node / npm / pnpm binaries existed across `~/.nvm`, `~/.local/bin`, and Homebrew directories, creating version precedence and runtime race conditions between interactive shells and background daemons (`launchd`).
2. **pnpm Precedence & PATH Duplication:** Duplicate entries in PATH led to an obsolete NVM-installed pnpm overshadowing the standalone managed pnpm.
3. **OpenClaude Stale Wrapper:** OpenClaude invoked mismatched node module paths after package migration, creating gateway authentication drift when talking to downstream proxy endpoints.
4. **Plaintext Secrets in Shell & Configurations:** Multiple API keys and gateway tokens existed as plaintext `export` statements in `~/.zshrc` and related shell dotfiles.
5. **Cross-CLI Inconsistencies:** Disparate unencrypted token files across individual CLIs created shared-secret risks.

---

## Final Runtime Architecture

| Component | Resolution / Path | Version | Role | Hardening Status |
| :--- | :--- | :--- | :--- | :--- |
| **Hermes Node** | `~/.local/bin/node` -> `~/.hermes/node/bin/node` | v22.23.2 | Default Node runtime for system CLIs | PASS |
| **NVM Node** | `~/.nvm/versions/node/v24.18.1` | v24.18.1 | Dedicated secondary Node runtime | PASS |
| **pnpm** | `~/Library/pnpm/bin/pnpm` | 11.24.0 | Authoritative package manager | PASS |
| **Bun** | `~/.bun/bin/bun` | 1.4.0 | Standalone runtime | PASS |
| **OpenClaude** | `~/.local/bin/openclaude.real` -> `~/Library/pnpm/bin/openclaude` | 0.29.1 | Migrated CLI assistant | PASS |
| **OmniRoute** | `:20128` | launchd / local gateway | FREE-FIRST multi-tier router | PASS |
| **9Router Policy Guard** | `:20138` | local policy proxy | Route policy guard | ACCEPTED EXCEPTION |
| **9Router Backend** | `:20139` | backend daemon | Local model router | ACCEPTED EXCEPTION |
| **FreeLLM** | `:3001` | launchd | Free-tier failover gateway | PASS |
| **OpenClaw** | `:18789` | launchd | Multi-channel assistant gateway | PASS |

---

## PATH Resolution

PATH deduplication is enforced via zsh path-array semantics (`typeset -U path PATH`).
Hermes Node v22.23.2 intentionally remains the default Node runtime via `~/.local/bin/node` to preserve compatibility with LaunchAgents and standalone CLIs (such as Codex CLI, which uses `#!/usr/bin/env node`). NVM Node v24.18.1 remains separately available in its dedicated path without replacing Hermes.

---

## Package Manager Cleanup

- **pnpm:** `~/Library/pnpm/bin/pnpm` (version 11.24.0) established as authoritative; obsolete NVM-installed pnpm removed.
- **Bun:** `~/.bun/bin/bun` (version 1.4.0) installed and preserved without forcing onto existing tools.
- **Node runtimes:** Clean separation between default Hermes Node and NVM Node.

---

## OpenClaude Repair

- OpenClaude migrated to pnpm (v0.29.1).
- `~/.local/bin/openclaude.real` configured as wrapper executing `~/Library/pnpm/bin/openclaude`.
- Normal `openclaude` command functions as a zsh routing wrapper preserving 9Router / TokenRouter helper behaviors without exposing secret-bearing environment values.

---

## macOS Keychain Migration

Plaintext credential exports were purged from `~/.zshrc` and replaced with macOS Keychain-backed variable assignments.

Known Keychain service items configured include:
- `omniroute-general-key`
- `omniroute-codex-key`
- `9router-api-key`
- `openai-api-key`
- `google-ai-api-key`
- `groq-api-key`
- `opencode-api-key`
- `firecrawl-api-key`
- `elevenlabs-api-key`

Generic pattern:
```bash
# Store credential
security add-generic-password -U -s "<KEYCHAIN_SERVICE>" -a "$USER" -w "<API_KEY>"

# Retrieve in shell
export TARGET_KEY="$(security find-generic-password -a "$USER" -s "<KEYCHAIN_SERVICE>" -w 2>/dev/null)"
```

---

## Provider Rotation Results

| Provider / Route | Rotation Status | Key Distinction | Old Key Revocation | Post-Revocation Route Verification | Final Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **OpenAI** | Rotated | Dedicated credential | Revoked | HTTP 200 OK (`/v1/models`) | PASS |
| **Google AI (Gemini)** | Rotated | Dedicated credential | Revoked | HTTP 200 OK (`models` endpoint) | PASS |
| **OmniRoute General** | Rotated | Distinct (`omniroute-general-key`) | Revoked | HTTP 200 OK (`http://127.0.0.1:20128/v1/models`) | PASS |
| **OmniRoute Codex-Scoped** | Rotated | Distinct (`omniroute-codex-key`) | Revoked | HTTP 200 OK (`http://127.0.0.1:20128/v1/models`) | PASS |
| **Kimi → OmniRoute Route** | Verified | General route propagation | N/A | HTTP 200 OK | PASS |
| **Codex → OmniRoute Route** | Verified | Scoped route propagation | N/A | HTTP 200 OK | PASS |

---

## Cross-CLI Findings

- **Codex:** Executable `~/.local/bin/codex` resolves to `@openai/codex/bin/codex.js` with `#!/usr/bin/env node` and uses default Hermes Node v22.23.2. Configured to consume scoped OmniRoute credential.
- **Kimi Code:** Audited and purged of plaintext credentials in live configuration; validated routing to OmniRoute general endpoint.
- **Qwen Code:** Plaintext OpenRouter credential material removed from JSON configuration.
- **OpenCode & Historical Backups:** Historical secret-bearing backup material discovered during cleanup was deleted after live-state verification.
- **Antigravity:** Omitted from specific provider claims due to lack of local configuration evidence (avoiding prior misattributions to FreeLLM/Ollama).

---

## Security Incident During Remediation

### Incident Overview
During automated remediation, an AI CLI tool rendered secret-bearing values into the terminal buffer via debug/diff output.

### Remediation Actions Taken
1. **Immediate Invalidation:** Affected credentials were treated as compromised and immediately re-rotated at providers and local OmniRoute gateway.
2. **Secret Removal:** Secret-bearing temporary backups and logs were permanently deleted.
3. **Execution Constraints:** Future recovery procedures strictly prohibit `env`/`printenv` dumps, diff previews containing credentials, and bearer token output in subprocess execution.

---

## Accepted Exceptions

Further credential rotation was intentionally deferred by user decision and remains outside the closure scope:
- **9Router:** Further rotation deferred (local policy guard proxy).
- **Groq:** Further rotation deferred (failover aggregator tier).
- **OpenCode:** Further rotation deferred (sandbox configuration).
- **LLMGateway:** Further rotation deferred (local loopback proxy).
- **Firecrawl:** Rotation deferred (isolated skill sandbox).
- **ElevenLabs:** Rotation deferred (TTS personal profile).

---

## Verification

- **PATH Deduplication:** Verified 0 duplicate entries using zsh array semantics.
- **Package Managers & Runtimes:** pnpm v11.24.0, Bun v1.4.0, Hermes Node v22.23.2, NVM Node v24.18.1 verified.
- **OmniRoute Health:** OmniRoute general and Codex-scoped routes returned HTTP 200.
- **Credential Distinction:** `omniroute-general-key` and `omniroute-codex-key` confirmed present and distinct.
- **Client Route Propagation:** Kimi → OmniRoute general route (PASS), Codex → OmniRoute scoped route (PASS).

---

## Security Rules & Lessons Learned

1. Never run `env` or `printenv` when active secrets are exported during a logged remediation session.
2. Never permit credential-bearing diffs in terminal output.
3. Suppress bearer token output in subprocess commands.
4. Avoid broad recursive scans through caches/logs.
5. Keep secret-bearing temporary backups short-lived and delete upon verification.
6. Use provider-scoped credentials and preserve separate general and Codex tokens.

---

## Rollback Procedures

If Keychain retrieval fails:
1. Re-add corrupted keychain entries using secure interactive prompt:
   ```bash
   security add-generic-password -U -s "<KEYCHAIN_SERVICE>" -a "$USER" -w
   ```
2. Do NOT restore historical plaintext secrets to shell configuration files.

---

## Final State

PASS WITH ACCEPTED EXCEPTIONS

---

## Credits

- **Planning / Review:** ChatGPT — GPT-5.6 Sol
- **Execution:** OpenClaude CLI
