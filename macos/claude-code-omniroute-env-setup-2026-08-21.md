# Claude Code + OmniRoute Environment Setup

**Date:** 2026-08-21

**Status:** Fixed

**Platform:** macOS

---

## 1. Summary

Automated macOS shell environment setup for Claude Code to work with a local OmniRoute proxy (running on `http://localhost:20128`). Created an idempotent bash/zsh script that detects the user's shell, finds the correct profile file, and adds three required environment variables. Also corrected a stale `ANTHROPIC_BASE_URL` value in `~/.zshrc` that pointed to an old port.

---

## 2. Environment

- **Operating system:** macOS (Apple Silicon, Darwin 25.6.0)
- **Hardware:** MacBook (Silver MBN / MacBook Neo)
- **Shell:** zsh (with Powerlevel10k)
- **Runtime:** Node.js v24.18.1 (via nvm), Python 3.9.6
- **Application/tool:** Claude Code CLI, OmniRoute proxy
- **Version:** Claude Code 2.1.224, OmniRoute (local proxy)
- **Relevant paths:**
  - `~/.zshrc` — primary shell profile
  - `~/setup-claude-env.sh` — automation script
  - `~/.openclaude/settings.json` — Claude Code config
  - `~/.openclaude/model-discovery-cache.json` — discovered models cache
- **Relevant ports:**
  - `20128` — OmniRoute proxy (API + model discovery)
  - `3000` — Hermes Agent WhatsApp bridge (separate)
  - `3001` — FreeLLM gateway (separate)
- **Other dependencies:** `corepack` (pnpm), `nvm`, OmniRoute running locally

---

## 3. Symptoms

### Before automation
Manual environment variable management in `~/.zshrc` was error-prone:
- Duplicate `ANTHROPIC_BASE_URL` entries with wrong value (`http://127.0.0.1:3456`)
- Missing `ANTHROPIC_AUTH_TOKEN` and `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY`
- No idempotency — re-running setup would create duplicates

### Script development issues
1. **Associative array + `set -u` crash:**
   ```text
   setup-claude-env.sh: line 52: ANTHROPIC_BASE_URL: unbound variable
   ```
   Cause: `declare -A ENV_VARS` with `set -u` treats unset keys as errors.

2. **Powerlevel10k instant prompt warning on source:**
   ```text
   p10k-instant-prompt-${(%):-%n}.zsh: bad substitution
   ```
   Pre-existing zsh config issue, not script-related. Variables still applied via manual export.

---

## 4. Root Cause

1. **No automated setup** — environment variables were managed manually, leading to drift and duplicates.
2. **Wrong port in existing config** — `ANTHROPIC_BASE_URL` pointed to `3456` (old OmniRoute default) instead of `20128` (current).
3. **Associative arrays incompatible with `set -u`** — bash strict mode fails on unset associative array keys.

---

## 5. What Did Not Work

- **Associative array approach** (`declare -A ENV_VARS`) — fails under `set -euo pipefail`
- **Sourcing `~/.zshrc` programmatically** — triggers Powerlevel10k instant prompt error (harmless but noisy)
- **Assuming single profile file** — bash users may have `~/.bash_profile` or `~/.bashrc`

---

## 6. Final Fix

### Script: `~/setup-claude-env.sh`
- Uses **parallel indexed arrays** (`ENV_VAR_NAMES` + `ENV_VAR_VALUES`) to avoid `set -u` issues
- Detects shell via `$SHELL` and selects correct profile (`~/.zshrc`, `~/.bash_profile`, `~/.bashrc`, `~/.profile`)
- Checks variable existence with regex: `^[[:space:]]*(export[[:space:]]+)?${var_name}[[:space:]]*=`
- Appends variables with timestamped comments
- Sources profile after changes (with error tolerance)
- Idempotent — re-running shows "No changes needed"

### Manual correction in `~/.zshrc`
Fixed two duplicate blocks (lines 107-118) changing:
```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:3456"
```
to:
```bash
export ANTHROPIC_BASE_URL="http://localhost:20128"
```

---

## 7. Commands

### Run the setup script
```bash
~/setup-claude-env.sh
```

### Verify environment variables
```bash
env | grep -E 'ANTHROPIC|CLAUDE_CODE'
```

### Verify Claude Code works
```bash
claude --version
```

### Verify OmniRoute model discovery
```bash
curl -sS http://127.0.0.1:20128/api/init
# Expected: {"initialized":true}

curl -sS http://127.0.0.1:20128/v1/models \
  -H 'Authorization: Bearer [REDACTED]' | jq '.data | length'
# Expected: 2000+ models
```

---

## 8. Verification

```bash
env | grep -E 'ANTHROPIC|CLAUDE_CODE'
```

**Expected result:**
```text
ANTHROPIC_BASE_URL=http://localhost:20128
ANTHROPIC_AUTH_TOKEN=[REDACTED]
CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
```

```bash
claude --version
```

**Expected result:**
```text
2.1.224
```

```bash
curl -sS http://127.0.0.1:20128/api/init
```

**Expected result:**
```json
{"initialized":true}
```

---

## 9. Final Working State

| Variable | Value |
|----------|-------|
| `ANTHROPIC_BASE_URL` | `http://localhost:20128` |
| `ANTHROPIC_AUTH_TOKEN` | `[REDACTED]` |
| `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY` | `1` |
| Active profile | `~/.zshrc` (two duplicate blocks corrected) |
| Script location | `~/setup-claude-env.sh` |
| OmniRoute status | Running on port 20128, 2000+ models discoverable |
| Model discovery cache | `~/.openclaude/model-discovery-cache.json` (2957 lines) |
| Claude Code config | `~/.openclaude/settings.json` — model: `auto/best-coding-fast`, effort: `high` |

---

## 10. Optional Cleanup

- The duplicate `ANTHROPIC_BASE_URL` blocks in `~/.zshrc` (lines 107-118 and 113-118) could be consolidated to one, but they are harmless since they have the same value.
- Powerlevel10k instant prompt warning on `source ~/.zshrc` is a pre-existing config quirk, not caused by this setup.

---

## 11. If This Happens Again

### Minimal diagnostics
```bash
echo "=== Shell ==="
echo $SHELL
grep -n 'ANTHROPIC_BASE_URL\|ANTHROPIC_AUTH_TOKEN\|CLAUDE_CODE_ENABLE' ~/.zshrc

echo
echo "=== Env ==="
env | grep -E 'ANTHROPIC|CLAUDE_CODE'

echo
echo "=== OmniRoute ==="
curl -sS http://127.0.0.1:20128/api/init

echo
echo "=== Claude ==="
claude --version
```

### Shortest recovery
```bash
# Re-run the idempotent setup script
~/setup-claude-env.sh

# If ANTHROPIC_BASE_URL is still wrong in ~/.zshrc, fix manually:
sed -i '' 's|http://127.0.0.1:3456|http://localhost:20128|g' ~/.zshrc
source ~/.zshrc

# Verify
env | grep -E 'ANTHROPIC|CLAUDE_CODE'
claude --version
```

### Dashboard note
The OmniRoute web dashboard at `http://localhost:20128/dashboard/cli-code/claude` shows "not configured" because it requires **browser authentication** (session/cookie), separate from the API Bearer token used by the CLI. The CLI works regardless. To access the dashboard, open the URL in a browser and log in.