# Windows Multi-Provider Free-Tier Model Setup (PWA + OpenCode + Pi + OpenClaude + Kimi Code)

**Date:** 2026-08-23  
**Status:** Fixed  
**Platform:** Windows 11  
**Scope:** PWA chat app, OpenCode, Pi, OpenClaude, Kimi Code

---

## 1. Summary

Configured **Kimi** and **DeepSeek** across multiple CLIs and a local PWA chat app. Added Kimi provider to OpenCode, Pi auth, OpenClaude profiles, and Kimi Code config. Built a multi-provider fallback chat interface in a Vite React PWA with automatic provider failover and context-window management.

---

## 2. Environment

- **Operating System:** Windows 11
- **Shell:** PowerShell 7
- **Runtime:** Node.js v24.x
- **Package Manager:** npm
- **PWA Stack:** Vite + React + TypeScript + Tailwind CSS
- **Configuration Paths:**
  - `C:\Users\1\Documents\Work\.netlify\IDBadge\[Kimi] OKComputer_Untitled_Chat\app\.env` — PWA API keys
  - `C:\Users\1\.config\opencode\opencode.json` — OpenCode provider config
  - `C:\Users\1\.pi\agent\auth.json` — Pi API key auth
  - `C:\Users\1\.openclaude\.openclaude-profile.json` — OpenClaude provider profiles
  - `C:\Users\1\.kimi-code\config.toml` — Kimi Code provider config

---

## 3. Symptoms

1. **PWA Chat Context Limit:** Small PWA project hitting context window limits on all free-tier providers.
2. **Missing Kimi Provider:** Kimi was not available in OpenCode, Pi, or OpenClaude provider lists.
3. **No Multi-Provider Fallback:** Single provider failure caused complete chat failure.

---

## 4. Root Cause

1. **PWA:** No unified LLM client with fallback logic; each provider required separate implementation.
2. **OpenCode:** Kimi provider not defined in `opencode.json`.
3. **Pi:** Kimi API key missing from `~/.pi/agent/auth.json`.
4. **OpenClaude:** Kimi profile not created in `.openclaude-profile.json`.
5. **Kimi Code:** Already configured with Kimi API key.

---

## 5. Final Fix

### 1. PWA Multi-Provider Chat

Created unified LLM client with automatic fallback across 7 providers:

- **Google AI Studio** (Gemini 2.0 Flash, 1M context)
- **DeepSeek** (V3, 128K context)
- **Groq** (Llama 3.3 70B, 128K context)
- **OpenAI** (GPT-4o Mini, 128K context)
- **Anthropic** (Claude 3.5 Haiku, 200K context)
- **Hugging Face** (Mistral 7B, 32K context)
- **Kimi** (Kimi Chat, 128K context)

**Files created:**
- `app/src/lib/providers.config.ts` — Provider configurations with env-var API keys
- `app/src/lib/llm-client.ts` — Unified client with fallback, retry, and context management
- `app/src/pages/ChatPage.tsx` — Chat UI with provider/model selectors

**Files modified:**
- `app/src/App.tsx` — Added state-based navigation between home and chat
- `app/src/components/Navbar.tsx` — Added children prop for chat button
- `app/src/sections/HeroSection.tsx` — Added "AI Chat" CTA button
- `app/.env` — Added all provider API keys
- `app/.env.example` — Added all provider env var templates
- `app/.gitignore` — Added `.env` to prevent key leaks

**Context management strategy:**
- Sliding window: keep last 6 messages full fidelity
- Summarization: compress older messages using fastest available model
- Token budget: ~9500 tokens total for safety margin

### 2. OpenCode Kimi + DeepSeek Providers

Added to `C:\Users\1\.config\opencode\opencode.json`:

```json
"kimi": {
  "npm": "@ai-sdk/openai-compatible",
  "name": "Kimi",
  "options": {
    "baseURL": "https://api.kimi.ai/v1",
    "apiKey": "<KIMI_API_KEY>"
  },
  "models": {
    "kimi-chat": { "name": "Kimi Chat", "modalities": { "input": ["text"], "output": ["text"] } },
    "moonshot-ai/kimi-k2.7-code": { "name": "Kimi K2.7 Code", "modalities": { "input": ["text", "image"], "output": ["text"] } }
  }
},
"deepseek": {
  "npm": "@ai-sdk/openai-compatible",
  "options": {
    "baseURL": "https://api.deepseek.com/v1",
      "apiKey": "<DEEPSEEK_API_KEY>"
  },
  "models": {
    "deepseek-chat": { "name": "DeepSeek V3", "modalities": { "input": ["text"], "output": ["text"] } },
    "deepseek-reasoner": { "name": "DeepSeek R1", "modalities": { "input": ["text"], "output": ["text"] } }
  }
}
```

### 3. Pi Auth

Updated `C:\Users\1\.pi\agent\auth.json`:

```json
{
  "kimi-coding": { "type": "api_key", "key": "<KIMI_API_KEY>" },
  "deepseek": { "type": "api_key", "key": "<DEEPSEEK_API_KEY>" },
  "huggingface": { "type": "api_key", "key": "<HUGGINGFACE_API_KEY>" }
}
```

### 4. OpenClaude Kimi Profile

Updated `C:\Users\1\.openclaude\.openclaude-profile.json` to include Kimi profile:

```json
[
  {
    "profile": "openrouter",
    "env": {
      "OPENAI_BASE_URL": "https://openrouter.ai/api/v1",
      "OPENAI_MODEL": "z-ai/glm-5.2:free",
      "OPENAI_API_KEY": "<OPENROUTER_API_KEY>"
    },
    "createdAt": "2026-08-23T06:15:49.373Z"
  },
  {
    "profile": "kimi",
    "env": {
      "OPENAI_BASE_URL": "https://api.kimi.ai/v1",
      "OPENAI_MODEL": "kimi-chat",
      "OPENAI_API_KEY": "<KIMI_API_KEY>"
    },
    "createdAt": "2026-08-23T06:15:49.373Z"
  }
]
```

### 5. Kimi Code Config

Already configured in `C:\Users\1\.kimi-code\config.toml`:

```toml
default_model = "moonshot-ai/kimi-k2.7-code"

[providers.moonshot-ai]
base_url = "https://api.moonshot.ai/v1"
type = "kimi"
api_key = "<KIMI_API_KEY>"
```

---

## 6. Commands

### OpenCode

```powershell
# Verify Kimi/DeepSeek providers are loaded
opencode --version
# Then inside OpenCode:
# /provider kimi
# /model kimi-chat
# /provider deepseek
# /model deepseek-chat
```

### Pi

```powershell
# Verify Kimi/DeepSeek are available
pi
# Then inside Pi:
# /model kimi-chat
# /model deepseek-chat
```

### OpenClaude

```powershell
# Verify profiles
cat "$HOME\.openclaude\.openclaude-profile.json"
# Switch to Kimi profile if needed:
# /provider
# Select Kimi profile
```

### Kimi Code

```powershell
# Verify config
cat "$HOME\.kimi-code\config.toml"
# Launch
kimi
# Select model with /model
```

### PWA

```powershell
cd "C:\Users\1\Documents\Work\.netlify\IDBadge\[Kimi] OKComputer_Untitled_Chat\app"
npm install
npm run dev
# Open http://localhost:3000
# Click "AI Chat" in navbar or hero section
```

---

## 7. Verification

1. **OpenCode:** Run `opencode`, use `/provider` to list Kimi/DeepSeek, `/model` to select.
2. **Pi:** Run `pi`, use `/model kimi-chat` or `/model deepseek-chat`.
3. **OpenClaude:** Run `openclaude`, check `.openclaude-profile.json` contains Kimi profile.
4. **Kimi Code:** Run `kimi`, verify default model is `moonshot-ai/kimi-k2.7-code`.
5. **PWA:** Run `npm run dev`, open chat page, send message, verify provider/model badges appear.

---

## 8. Final Working State

- **OpenCode:** Kimi and DeepSeek providers configured with API keys and models.
- **Pi:** Kimi Coding, DeepSeek, and HuggingFace keys stored in auth.json.
- **OpenClaude:** Kimi profile added alongside OpenRouter profile.
- **Kimi Code:** Already configured with Kimi API key and K2.7 code model.
- **PWA:** Multi-provider chat with 7 providers, automatic fallback, context management, and provider/model selection UI.

---

## 9. If This Happens Again

1. **Provider missing from `/model` list:**
   - Verify API key is set in the correct config file for that CLI.
   - Check provider base URL and model IDs match the CLI's expected format.

2. **OpenClaude profile not loading:**
   - Run `/provider` inside OpenClaude to repair saved provider settings.
   - Verify `.openclaude-profile.json` is valid JSON.

3. **PWA build fails:**
   - Ensure `.env` exists with all required `VITE_*` API keys.
   - Run `npm install` to restore dependencies.

4. **Context window exceeded:**
   - PWA will auto-summarize older messages.
   - For extreme cases, switch to Gemini 2.0 Flash (1M context) in provider dropdown.

---

## 10. Security Notes

- `.env` files are gitignored in the PWA project.
- Pi `auth.json` has `0600` permissions (user read/write only).
- OpenClaude profile stores API keys in plaintext JSON; ensure repo is private.
- Consider moving API keys to a backend proxy for production PWA deployments.
