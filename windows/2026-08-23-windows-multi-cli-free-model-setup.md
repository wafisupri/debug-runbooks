# Windows Multi-CLI Free-Tier Model Setup (OmniRoute + OpenClaw + Hermes)

**Date:** 2026-08-23  
**Status:** Fixed  
**Platform:** Windows 11  

---

## 1. Summary

Configured **OmniRoute**, **OpenClaw**, and **Hermes Agent** to use free-tier cloud models via OpenRouter, alongside local Ollama models. Added MiMoCode API key to OmniRoute, updated provider topology, and synchronized free model defaults across CLIs.

---

## 2. Environment

- **Operating System:** Windows 11
- **Shell:** PowerShell 7
- **Runtime:** Node.js v24.x
- **Local AI:** Ollama (deepseek-r1:14b, llama3.3:70b, qwen2.5-coder:32b)
- **Gateways & Ports:**
  - `20128` — OmniRoute Gateway
  - `20138` — 9Router Gateway
  - `11434` — Local Ollama Instance
- **Configuration Paths:**
  - `~/.omniroute/.env` — OmniRoute provider API keys
  - `~/.openclaude/settings.json` — OpenClaude default model
  - `~/.openclaude/.openclaude-profile.json` — OpenClaude OpenRouter profile
  - `~/.config/ai/.env` — Centralized API keys
  - `~/AppData/Local/hermes/config.yaml` — Hermes Agent provider & model config
  - `~/AppData/Local/hermes/.env` — Hermes environment variables

---

## 3. Symptoms

1. **OmniRoute Provider Topology Errors:**
   - MiMoCode (Free) showed `error` due to missing API key.
   - Trae showed `error` because it is a local CLI tool, not an API-key provider.
2. **Hermes Agent Limited to Local Models:**
   - `config.yaml` only defined `ollama-launch` provider with local models.
   - No OpenRouter provider configured, so free cloud models were unavailable.
3. **OpenClaw Already Functional but Needed Verification:**
   - `settings.json` pointed to `z-ai/glm-5.2:free` via OpenRouter.
   - Profile used OpenRouter base URL with API key from `~/.config/ai/.env`.

---

## 4. Root Cause

1. **OmniRoute:** MiMoCode provider connection lacked an API key in `~/.omniroute/.env`.
2. **Hermes Agent:** `config.yaml` only declared `ollama-launch` under `providers:`. OpenRouter credentials existed in `auth.json` and `.env`, but without a provider definition, Hermes could not route requests to OpenRouter free models.
3. **OpenClaw:** Already correctly configured; no root cause.

---

## 5. What Did Not Work

- **OmniRoute `providers rotate` with `--from-env`:** Returned `HTTP 405` on Windows due to a server-side assertion failure when restarting the process. Required direct `--new-key` flag after manual server restart.
- **Expecting OmniRoute CLI list to immediately reflect key rotation:** After rotating the MiMoCode key, the CLI provider list still showed `error` until the next health-check cycle completed.

---

## 6. Final Fix

### 1. OmniRoute MiMoCode Key

Added `MIMOCODE_API_KEY` to `~/.omniroute/.env` and rotated it into the MiMoCode provider connection:

```powershell
omniroute providers rotate mimocode --new-key "[REDACTED]" --yes
```

### 2. Hermes Agent OpenRouter Provider

Updated `~/AppData/Local/hermes/config.yaml`:
- Changed `model.default` from `deepseek-r1:14b` to `z-ai/glm-5.2:free`.
- Changed `model.provider` from `custom:ollama-launch` to `openrouter`.
- Added `openrouter` provider definition under `providers:` with base URL `https://openrouter.ai/api/v1` and free model list.

### 3. OpenClaw Verification

Confirmed `~/.openclaude/settings.json` and `.openclaude-profile.json` already point to OpenRouter free model `z-ai/glm-5.2:free`.

---

## 7. Commands

### OmniRoute

```powershell
# Add MiMoCode key to .env
Add-Content -Path "$HOME\.omniroute\.env" -Value "MIMOCODE_API_KEY=[REDACTED]"

# Rotate key into provider connection
omniroute providers rotate mimocode --new-key "[REDACTED]" --yes

# Restart OmniRoute server
Stop-Process -Id (Get-Content "$HOME\.omniroute\server\.pid") -Force -ErrorAction SilentlyContinue
Start-Sleep 2
omniroute status

# Verify providers
omniroute providers list
omniroute providers validate
```

### Hermes Agent

```powershell
# Edit config.yaml to add openrouter provider and set free model default
notepad "$HOME\AppData\Local\hermes\config.yaml"

# Verify Hermes picks up the new provider
hermes model
```

### OpenClaw

```powershell
# Verify current config
cat "$HOME\.openclaude\settings.json"
cat "$HOME\.openclaude\.openclaude-profile.json"
```

---

## 8. Verification

1. **OmniRoute Providers:**
   ```powershell
   omniroute providers list
   # MiMoCode Account 1 should show active after health check completes
   omniroute providers validate
   # MiMoCode Account 1 should return OK
   ```

2. **Hermes Agent Model Discovery:**
   ```powershell
   hermes model
   # Should list z-ai/glm-5.2:free and other OpenRouter free models
   ```

3. **OpenClaude Model:**
   ```powershell
   cat "$HOME\.openclaude\settings.json"
   # model should be "z-ai/glm-5.2:free"
   ```

4. **Ollama Local Models:**
   ```powershell
   ollama list
   # Should include deepseek-r1:14b, llama3.3:70b, qwen2.5-coder:32b
   ```

---

## 9. Final Working State

- **OmniRoute:** MiMoCode provider configured with API key. OpenRouter, Groq, OpenAI providers active and passing tests.
- **Hermes Agent:** Default model set to `z-ai/glm-5.2:free` via OpenRouter. Ollama local models remain available as alternative provider.
- **OpenClaw:** Default model `z-ai/glm-5.2:free` via OpenRouter profile.

---

## 10. Optional Cleanup

- Old Hermes config backups can be removed from `~/.openclaude/backups/` if no longer needed.
- OmniRoute call logs in `~/.omniroute/call_logs/` can be archived or pruned.

---

## 11. If This Happens Again

1. **OmniRoute provider shows `error`:**
   - Check `~/.omniroute/.env` for the provider's API key.
   - Run `omniroute providers rotate <name> --new-key "<key>" --yes`.
   - Restart OmniRoute server if `--from-env` returns `HTTP 405`.

2. **Hermes only shows local Ollama models:**
   - Verify `OPENROUTER_API_KEY` is set in `~/.local/share/hermes/.env`.
   - Ensure `openrouter` provider is defined under `providers:` in `config.yaml`.
   - Clear `provider_models_cache.json` if stale.

3. **OpenClaw not using free model:**
   - Verify `~/.openclaude/settings.json` `model` field.
   - Verify `~/.openclaude/.openclaude-profile.json` `OPENAI_BASE_URL` and `OPENAI_API_KEY`.
