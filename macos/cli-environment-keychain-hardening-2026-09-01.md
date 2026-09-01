# macOS CLI Environment & Keychain Hardening Runbook

**Date:** 2026-09-01  
**Status:** PASS WITH ACCEPTED EXCEPTIONS  
**Platform:** macOS (Apple Silicon, arm64)  

---

## Objective & Scope

- **Objective:** Eliminate plaintext API keys and secrets stored across shell profile files (`~/.zshrc`, `~/.zshenv`), tool configuration files, and wrapper scripts. Consolidate execution paths and package manager configurations under macOS Keychain security.
- **Scope:** All AI CLI agents (Claude Code, OpenClaude, Kimi Code, Codex CLI, OpenCode, Hermes), local gateways (OmniRoute, FreeLLM, 9Router), package managers (Node, npm, corepack pnpm, Homebrew), and shell environment configurations across `/Users/wfspr`.

---

## Initial Problems & Symptoms

1. **Plaintext Secrets in Shell Profiles:** Multiple API keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `OMNIROUTE_API_KEY`, and custom gateway tokens) existed as plaintext `export` statements in `~/.zshrc` and related shell dotfiles.
2. **Environment Variable Duplication & PATH Confusion:** Multiple Node / npm / pnpm binaries existed across `~/.nvm`, `~/.local/bin`, and Homebrew directories, causing version resolution race conditions between interactive shells and background daemons (`launchd`).
3. **OpenClaude Wrapper Misconfiguration:** OpenClaude invoked mismatched node module paths and unhardened runtime flags, creating gateway authentication drift when talking to downstream proxy endpoints.
4. **Credential Sprawl Across Multiple CLIs:** Individual CLIs maintained disparate, unencrypted token files with shared keys, creating blast radius vulnerabilities if any single tool directory was inspected or logged.

---

## Root Cause

- Incremental onboarding of AI CLI tools and gateways without a centralized credential management pattern led to ad-hoc `export KEY=value` entries appended directly to interactive shell files.
- Lack of OS keychain integration permitted tools and child processes to inherit full plaintext credential dumps from process environment tables (`/proc` or `ps eww`).

---

## Final Runtime Architecture

| Component | Port / Path | Supervisor | Credential Source | Hardening Status |
| :--- | :--- | :--- | :--- | :--- |
| **OmniRoute** | `:20128` | `launchd` (`ai.omniroute.gateway`) | macOS Keychain / SQLite | PASS |
| **FreeLLM** | `:3001` | `launchd` | macOS Keychain / Encrypted Storage | PASS |
| **9Router Policy Guard** | `:20138` | `launchd` / local process | Config file / Environment | ACCEPTED EXCEPTION |
| **9Router Backend** | `:20139` | `launchd` / local process | Config file / Environment | ACCEPTED EXCEPTION |
| **OpenClaw** | `:18789` | `launchd` / local daemon | macOS Keychain / Local store | PASS |
| **Claude Code** | CLI / interactive | Shell wrapper | macOS Keychain (`security find-generic-password`) | PASS |
| **OpenClaude** | CLI / interactive | Native executable | macOS Keychain / Dynamic resolution | PASS |
| **Kimi Code** | CLI / interactive | Native binary | macOS Keychain / Scoped provider config | PASS |
| **Codex CLI** | CLI / interactive | Native binary | Scoped OmniRoute token from Keychain | PASS |

---

## PATH Resolution & Environment Ordering

To prevent binary collision between Homebrew, NVM, and local user tools, the authoritative shell ordering in `~/.zshrc` is hardened as:

```bash
# 1. NVM / Node active toolchain (authoritative runtime)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# 2. User local binaries and CLI agent tools
export PATH="$HOME/.local/bin:$HOME/.kimi-code/bin:$PATH"

# 3. Homebrew system bin (Apple Silicon)
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"
```

---

## Package Manager Cleanup

- **pnpm:** Global pnpm installations removed from unmanaged paths; standard access routed strictly via `corepack pnpm`.
- **npm:** Global prefix pinned explicitly to active Node runtime (`~/.nvm/versions/node/v24.18.1`) to eliminate rogue package writes into `/usr/local` or `~/.local`.
- **nvm:** Retained as primary runtime manager for Node v24.18.1.

---

## OpenClaude Repair

- Realigned OpenClaude executable wrapper to reference explicit Node runtime and sanitized environment variables.
- Verified OpenClaude correctly routes completions through OmniRoute `:20128` and FreeLLM `:3001` without relying on ambient shell plaintext environment variables.
- Standardized config path to `~/.openclaude/config.json`.

---

## macOS Keychain Migration

All sensitive credentials were removed from shell profile files (`~/.zshrc`, `~/.zshenv`) and stored into the macOS System Keychain using generic service names and accounts.

### Keychain Storage Commands

```bash
# Store API credential into macOS Keychain
security add-generic-password -U \
  -s "<KEYCHAIN_SERVICE>" \
  -a "<KEYCHAIN_ACCOUNT>" \
  -w "<API_KEY>"

# Secure retrieval inside shell startup / dynamic runner
export TARGET_API_KEY=$(security find-generic-password -s "<KEYCHAIN_SERVICE>" -a "<KEYCHAIN_ACCOUNT>" -w)
```

*(Note: Generic placeholders `<KEYCHAIN_SERVICE>`, `<KEYCHAIN_ACCOUNT>`, and `<API_KEY>` are used throughout to ensure zero credential leakage).*

---

## Provider Rotation Results

All active provider keys were rotated and old credentials revoked. Post-rotation health and routing tests confirmed HTTP 200 operational status.

| Provider / Route | Key Rotation Status | Distinct Key Enforced | Old Key Revoked | Post-Revocation Route Verification | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **OpenAI** | Rotated | Yes | Yes (HTTP 401 on old key) | HTTP 200 OK | PASS |
| **Google AI (Gemini)** | Rotated | Yes | Yes (HTTP 400/403 on old key) | HTTP 200 OK | PASS |
| **OmniRoute General** | Rotated | Yes | Yes | HTTP 200 OK (`/v1/chat/completions`) | PASS |
| **OmniRoute Codex-Scoped** | Rotated | Yes (Dedicated token) | Yes | HTTP 200 OK (Codex route) | PASS |
| **Kimi General Route** | Configured | Yes | N/A | HTTP 200 OK | PASS |
| **Codex Scoped Route** | Configured | Yes | N/A | HTTP 200 OK | PASS |

---

## Cross-CLI Findings

- **Claude Code:** Successfully consumes dynamic environment injection from Keychain without plaintext persistence.
- **OpenClaude:** Fully verified against local OmniRoute proxy `:20128` with zero leaks.
- **Kimi Code:** Correctly isolates model requests using scoped gateway headers.
- **Codex CLI:** Hardened with a scoped, non-admin OmniRoute token preventing privilege escalation across the local gateway.
- **OpenCode & Hermes:** Operating under designated isolated configurations.

---

## Security Incident During Remediation

### Incident Overview
During initial interactive remediation and verification commands, an unredacted diagnostic command echoed sensitive token output to the active terminal buffer.

### Remediation Actions Taken
1. **Immediate Invalidation:** The exposed credentials were immediately revoked at the upstream providers (OpenAI, Google AI, and local OmniRoute tokens).
2. **Re-issuance:** Brand new keys were provisioned directly into macOS Keychain.
3. **Log & History Scrubbing:** Shell history and diagnostic logs were purged of all raw command invocations.
4. **Future Preventive Constraint:**
   - Never use `echo`, `cat`, `printenv`, or `env` on secret-bearing variables or config files.
   - Diagnostic verification must pipe tokens through hash summaries (`shasum -a 256`) or return boolean status checks only.

---

## Accepted Exceptions

The following components retain configuration-level or local environment configurations by design and are recorded as accepted exceptions:

1. **9Router (`:20138` / `:20139`):** Local policy guard and backend proxy rely on local configuration files within private runtime directories; isolated from external ingress.
2. **Groq:** Free-tier rate-limited developer key used solely for local failover aggregation within FreeLLM.
3. **OpenCode:** Development workspace configuration containing non-production sandbox tokens.
4. **LLMGateway:** Internal loopback routing token restricted to `127.0.0.1`.
5. **Firecrawl:** Isolated skill sandbox credential configured in `~/.agents/skills/firecrawl`.
6. **ElevenLabs:** Text-to-speech personal utility key maintained in user agent profile.

---

## Verification & Validation Commands

```bash
# 1. Verify shell profile contains NO plaintext secrets
grep -E "(sk-[a-zA-Z0-9]+|gsk_[a-zA-Z0-9]+|llmgtwy_[a-zA-Z0-9]+|Bearer )" ~/.zshrc ~/.zshenv || echo "CLEAN: No plaintext keys in shell profiles"

# 2. Verify Keychain secret retrieval
security find-generic-password -s "<KEYCHAIN_SERVICE>" -a "<KEYCHAIN_ACCOUNT>" > /dev/null && echo "KEYCHAIN: Retrieval OK"

# 3. Verify OmniRoute health and response on port 20128
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:20128/health

# 4. Verify FreeLLM health on port 3001
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/health
```

---

## Security Rules & Lessons Learned

1. **No Plaintext in Shell Profiles:** Never store API keys or tokens in `.zshrc`, `.bashrc`, `.zshenv`, or git-tracked files.
2. **OS Keychain as Primary Secret Store:** macOS Keychain (`security`) is the authoritative secret store for CLI tooling on Apple Silicon.
3. **Scoped Token Principle:** Downstream tools (such as Codex CLI) must receive scoped, least-privilege tokens rather than global administrator keys.
4. **Silent Diagnostics:** Security verification scripts must never output secret values to stdout/stderr.

---

## Rollback Procedures

If an agent or tool fails to retrieve dynamic credentials from macOS Keychain:

1. Temporarily populate the runtime variable in a subshell without persisting to disk:
   ```bash
   (export TARGET_API_KEY="$(security find-generic-password -s '<KEYCHAIN_SERVICE>' -a '<KEYCHAIN_ACCOUNT>' -w)" && run-cli-command)
   ```
2. Check Keychain item existence:
   ```bash
   security find-generic-password -s "<KEYCHAIN_SERVICE>"
   ```
3. Re-add the item if corrupted:
   ```bash
   security add-generic-password -U -s "<KEYCHAIN_SERVICE>" -a "<KEYCHAIN_ACCOUNT>" -w "<API_KEY>"
   ```

---

## Final State

- Shell configuration files (`~/.zshrc`, `~/.zshenv`) are fully cleansed of hardcoded secrets.
- All primary API keys rotated, old keys revoked, and new keys secured in macOS Keychain.
- OmniRoute (`:20128`), FreeLLM (`:3001`), and CLI fleet operational and verified.
- Status: **PASS WITH ACCEPTED EXCEPTIONS**.

---

## Credits

- **Planning & Review:** ChatGPT — GPT-5.6 Sol
- **Execution:** OpenClaude CLI
