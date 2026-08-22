# FreeLLM Multi-CLI Free-Tier Model Aggregation & Failover Setup

**Date:** 2026-08-22  
**Status:** Fixed  
**Platform:** macOS  

---

## 1. Summary

Configured and synchronized **FreeLLM** (an OpenAI-compatible multi-provider aggregation gateway with automatic 429 rate-limit failover) along with direct free-tier cloud endpoints (OpenRouter Free, Groq Cloud, Google AI Studio Gemini) and local offline Ollama models across all primary coding CLIs on macOS:
- **OpenCode CLI**
- **Kimi Code CLI**
- **Antigravity CLI (`agy`)**
- **Claude Code CLI**
- **OpenClaude CLI**
- **Gemini CLI**

Resolved provider quota exhaustion ("hit usage limit per provider") by routing requests through FreeLLM's meta-models (`free`, `free-smart`, `free-fast`), which automatically intercept `429 Too Many Requests` responses and seamlessly retry on the next available free provider.

---

## 2. Environment

- **Operating system:** macOS (Apple Silicon, `aarch64`, Darwin 25.6.0)
- **Hardware:** MacBook (Silver MBN / MacBook Neo)
- **Shell:** zsh (with Powerlevel10k)
- **Runtimes:** Node.js v24.18.1 (via nvm), Python 3.9.6, corepack pnpm
- **Applications & CLIs:**
  - OpenCode CLI (`opencode`)
  - Kimi Code CLI (`kimi`, v0.36.1)
  - Antigravity CLI (`agy`, Google DeepMind)
  - Gemini CLI (`/opt/homebrew/bin/gemini`)
  - Claude Code CLI (`claude`, v2.1.224)
  - OpenClaude CLI (`openclaude`)
- **Local Gateways & Ports:**
  - `3001` — FreeLLM Gateway (`http://127.0.0.1:3001/v1`)
  - `5173` — FreeLLM Web Dashboard
  - `20128` — OmniRoute Gateway
  - `20138` — 9Router Gateway
  - `11434` — Local Ollama Instance
- **Configuration Paths:**
  - `~/.config/opencode/opencode.json` — OpenCode provider definitions
  - `~/.config/kimi-code/config.toml` & `~/.kimi-code/config.toml` — Kimi Code configuration
  - `~/.antigravity/config.toml` — Antigravity CLI configuration
  - `~/.claude-code-router/config.json` — Claude Code router proxy configuration
  - `~/.openclaude/settings.json` — OpenClaude configuration
  - `~/GitHub/freellm/` — FreeLLM source and `.env` provider credentials

---

## 3. Symptoms

1. **FreeLLM Missing in OpenCode CLI**:
   - `opencode models freellm` returned no models because FreeLLM was not registered in `opencode.json`.
2. **Provider Quota & Rate Limit Exhaustion**:
   - Running single-provider free models resulted in developer lockouts upon hitting rate limits (HTTP 429) or token quotas.
3. **Configuration Syntax Inconsistencies**:
   - `~/.config/opencode/opencode.json` contained an accidental duplicate `ollama` configuration block nested inside `9router`.
   - `~/.claude-code-router/config.json` had a malformed OpenRouter endpoint URL (`https://openrouterai/api/v`).
4. **Disjoint Model Availability Across CLIs**:
   - Antigravity CLI only had local Ollama models configured.
   - Kimi Code lacked FreeLLM and direct Groq/OpenRouter mappings.

---

## 4. Root Cause

1. FreeLLM was running locally as a background process on port 3001 (`http://127.0.0.1:3001/v1`), but had never been registered as an OpenAI-compatible provider in OpenCode CLI (`opencode.json`) or Kimi Code (`config.toml`).
2. Each CLI maintained isolated configuration files with different schemas (JSON vs. TOML), requiring manual synchronization of base URLs, model aliases, and fallback chains.

---

## 5. What Did Not Work

- **Manually swapping model names after hitting 429 errors**: Inefficient and breaks agent workflows mid-task.
- **Relying solely on single free providers**: Standard free tiers (e.g. Groq 30 RPM, Cerebras 30 RPM) hit concurrency and token limits during complex multi-step refactoring.

---

## 6. Final Fix

### 1. OpenCode CLI Integration (`~/.config/opencode/opencode.json`)
- Cleaned up the corrupted nested `ollama` object in `9router`.
- Registered `freellm` pointing to `http://127.0.0.1:3001/v1` with meta-routers (`free`, `free-fast`, `free-smart`) and concrete provider models (Groq, Gemini, Mistral, Cerebras, NVIDIA NIM, Cloudflare Workers AI, GitHub Models).
- Registered direct `openrouter` with 13+ `:free` models.
- Registered direct `groq` for ultra-low-latency completions.

### 2. Kimi Code CLI Integration (`~/.config/kimi-code/config.toml` & `~/.kimi-code/config.toml`)
- Added `[providers.freellm]` targeting `http://127.0.0.1:3001/v1`.
- Added model declarations under `[models."freellm/..."]` for `freellm/free`, `freellm/free-smart`, `freellm/free-fast`, and individual provider routes.
- Validated configuration using `kimi doctor`.

### 3. Antigravity CLI Integration (`~/.antigravity/config.toml`)
- Configured `[api] base_url = "http://127.0.0.1:3001/v1"`.
- Set default model to `free`.
- Configured shortcuts under `[model.aliases]` for `free-smart`, `free-fast`, `groq-llama`, `gemini-flash`, `github-gpt4o`, `cerebras-llama`, and local Ollama models (`phi4`, `qwen2_5_1_5b`, `llama3_2`).
- Defined fallback chain (`free-smart` -> `free-fast` -> `free` -> `ollama/phi4-mini:latest`).

### 4. Claude Code CLI Integration (`~/.claude-code-router/config.json`)
- Fixed malformed OpenRouter endpoint URL.
- Added FreeLLM (`http://127.0.0.1:3001/v1`) with `free`, `free-smart`, and `free-fast`.
- Configured default router to `freellm,free`.

### 5. OpenClaude CLI Integration (`~/.openclaude/settings.json`)
- Set default model to `auto/best-free` via OmniRoute (`ANTHROPIC_BASE_URL="http://localhost:20128"`).
- Documented direct OpenAI-compatible CLI launch flags for FreeLLM (`--provider openai --model free`).

---

## 7. Commands

### OpenCode CLI
```bash
# Auto-failover across all free providers
opencode --model freellm/free

# Smart reasoning router (Gemini 2.5 Pro, GitHub Models, NIM)
opencode --model freellm/free-smart

# Fast low-latency router (Groq, Cerebras, Cloudflare)
opencode --model freellm/free-fast

# OpenRouter Free models
opencode --model openrouter/deepseek/deepseek-r1:free
opencode --model openrouter/meta-llama/llama-3.3-70b-instruct:free

# Local Ollama (Zero limit, 100% offline)
opencode --model ollama/phi4-mini:latest
```

### Kimi Code CLI
```bash
kimi -m freellm/free
kimi -m freellm/free-smart
kimi -m freellm/free-fast
kimi -m openrouter/auto-free
kimi -m groq/llama-3.3-70b
kimi -m ollama/qwen2.5-coder:1.5b
```

### Antigravity CLI
```bash
agy -i "Your prompt here"
agy --model free-smart -i "Complex refactoring prompt"
agy --model groq-llama -i "Fast generation"
agy --model phi4 -i "Offline prompt"
```

### Claude Code & OpenClaude
```bash
# Claude Code via Router
claude

# OpenClaude via OmniRoute Free Tier
openclaude --model auto/best-free

# OpenClaude via FreeLLM Gateway
OPENAI_BASE_URL="http://localhost:3001/v1" OPENAI_API_KEY="free" openclaude --provider openai --model free
```

---

## 8. Verification

1. **OpenCode Model Discovery**:
   ```bash
   opencode models freellm
   opencode models openrouter
   opencode models groq
   ```
   All models listed correctly without JSON syntax errors.

2. **Kimi Code Doctor**:
   ```bash
   kimi doctor
   # Output: OK config.toml, OK tui.toml
   ```

3. **FreeLLM Gateway Health**:
   ```bash
   curl -s http://127.0.0.1:3001/healthz
   # Output: {"status":"ok"}
   ```

---

## 9. Final Working State

- **`~/.config/opencode/opencode.json`**: 8 active providers (TokenRouter, OmniRoute, 9Router, Ollama, Vercel, FreeLLM, OpenRouter Free, Groq).
- **`~/.config/kimi-code/config.toml` & `~/.kimi-code/config.toml`**: Unified provider mappings with FreeLLM and local fallbacks.
- **`~/.antigravity/config.toml`**: FreeLLM default with multi-tier model aliases.
- **`~/.claude-code-router/config.json`**: Clean proxy routes for FreeLLM, OpenRouter, and OmniRoute.
- **`~/.openclaude/settings.json`**: Integrated with OmniRoute and FreeLLM free routing.

---

## 10. Optional Cleanup

- Old backup files in `~/.config/opencode/` can be archived if no longer needed.
- Additional free API keys can be stacked in `GitHub/freellm/.env` (comma-separated, e.g. `GROQ_API_KEY=key1,key2`) to multiply rate-limit budgets.

---

## 11. If This Happens Again

1. **If FreeLLM returns `429 all_providers_exhausted`**:
   - Add additional free provider API keys in `GitHub/freellm/.env` (Groq, Gemini, Mistral, Cerebras, NVIDIA NIM, Cloudflare, GitHub PAT).
   - Alternatively, fall back to local Ollama models (`ollama/phi4-mini:latest` or `ollama/qwen2.5-coder:1.5b`), which have zero request limits.
2. **If FreeLLM process stops on port 3001**:
   - Restart the gateway: `cd ~/GitHub/freellm && pnpm dev`.
