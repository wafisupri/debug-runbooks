# TokenRouter Multi-CLI Integration & Claude Code Bridge Setup

**Date:** 2026-08-22  
**Status:** Fixed  
**Platform:** macOS  

---

## 1. Summary

Configured and synchronized TokenRouter AI models (including `qwen/qwen3.8-max-free`, `moonshotai/kimi-k3`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`) and local model gateways across four CLI environments on macOS: **OpenCode CLI**, **Kimi Code CLI**, **Claude Code CLI / OpenClaude**, and **Antigravity CLI / Gemini CLI**.

Resolved several integration bottlenecks:
1. Fixed Claude Code connection failures and model rejection (`ConnectionRefused` and `There's an issue with the selected model`) by building an automatic, transparent local proxy bridge (`~/.claude/bridges/tokenrouter-bridge.mjs` and `run-claude-tokenrouter.sh`) that intercepts Claude Code's Anthropic `/v1/messages` format, normalizes reasoning effort (`xhigh` -> `high`), strips incompatible beta headers, and streams SSE responses.
2. Synchronized all 226+ model definitions from OpenCode CLI into Kimi Code CLI (`~/.config/kimi-code/config.toml`).
3. Handled upstream free-tier 503 prefill load spikes with automatic 3x retries and exponential backoff in the local bridge.

---

## 2. Environment

- **Operating system:** macOS (Apple Silicon, `aarch64`, Darwin 25.6.0)
- **Hardware:** MacBook (Silver MBN / MacBook Neo)
- **Shell:** zsh (with Powerlevel10k)
- **Runtimes:** Node.js v24.18.1 (via nvm), Python 3.9.6
- **Applications & Tools:**
  - Claude Code CLI (`2.1.224`)
  - OpenCode CLI (`opencode`)
  - Kimi Code CLI (`0.36.1`)
  - Antigravity CLI (Google DeepMind)
- **Relevant paths:**
  - `~/.zshrc` — environment variables and CLI aliases
  - `~/.config/opencode/opencode.json` — OpenCode provider definitions
  - `~/.config/kimi-code/config.toml` & `~/.kimi-code/config.toml` — Kimi Code configuration
  - `~/.claude/bridges/tokenrouter-bridge.mjs` — TokenRouter Anthropic bridge
  - `~/.claude/bridges/run-claude-tokenrouter.sh` — Claude Code launch wrapper
  - `~/.claude/profiles/` — isolated Claude Code profiles
  - `~/.claude.json` — CLI key approval configuration
- **Relevant ports:**
  - `20148` — TokenRouter Claude Bridge (Qwen 3.8 Max Free)
  - `20149` — TokenRouter Claude Bridge (Kimi K3)
  - `20128` — OmniRoute Gateway
  - `20138` — 9Router Gateway
  - `11434` — Local Ollama instance

---

## 3. Symptoms

1. **Claude Code Connection & Rejection Errors**:
   - `✻ Unable to connect to API (ConnectionRefused) · Retrying in 7s`
   - `⚠ Both ANTHROPIC_AUTH_TOKEN and ANTHROPIC_API_KEY set · auth may not work as expected`
   - `There's an issue with the selected model (qwen/qwen3.8-max-free). It may not exist or you may not have access to it.`
   - `API Error: 422 Failed to deserialize the JSON body: reasoning_effort: unknown variant 'xhigh'`
2. **Account Quota 403 on TokenRouter**:
   - `API Error: 403 User's credit limit is insufficient, remaining credit limit: ＄0.000000` when requesting non-free endpoints or when model ports overlapped.
3. **Mid-Session Model Schema Conflicts in Kimi Code**:
   - `APIStatusError: 400 'messages.2' : property 'reasoning_content' is unsupported` when switching from a thinking model (Qwen 3.8) to Groq/LLaMA.
4. **404 Endpoint Retired**:
   - `404 This free public endpoint for Qwen3.8-27B has been retired` from stale Hugging Face demo provider.

---

## 4. Root Cause

1. **Claude Code Binary Constraints**: Claude Code is compiled with rigid client-side Anthropic model name validation and injects custom beta headers (`effort-2025-11-24`, `thinking: { type: "adaptive" }`, `reasoning_effort: "xhigh"`). When pointed directly at non-Anthropic endpoints, TokenRouter rejects the `xhigh` effort enum with HTTP 422, while Claude Code rejects custom model IDs before dispatch.
2. **Global Setting Collision**: Global `~/.claude/settings.json` and stale `ANTHROPIC_BASE_URL` exports previously pointed to offline local ports (`localhost:20138` or `127.0.0.1:3456`), overriding per-profile configs.
3. **Multi-Turn Session History Incompatibility**: Switching models mid-turn in Kimi Code retains `reasoning_content` in earlier assistant messages. Standard OpenAI-compatible endpoints (like Groq) reject assistant turns containing `reasoning_content`.

---

## 5. What Did Not Work

- **Directly setting `ANTHROPIC_BASE_URL="https://api.tokenrouter.com/v1"` for Claude Code**: Failed because Claude Code's internal checks require Anthropic-standard model names and send unhandled beta headers.
- **Model alias mapping via `ANTHROPIC_DEFAULT_SONNET_MODEL` in profile settings alone**: Claude Code passed raw `claude-sonnet-4-5-20250929` to TokenRouter, which failed with `model_not_found`.
- **Running 49k+ token tool contexts on 1.5B local models**: Caused context exhaustion (`max_tokens` exceeded without emitting tool calls).

---

## 6. Final Fix

### 1. Transparent TokenRouter Anthropic Bridge (`~/.claude/bridges/tokenrouter-bridge.mjs`)
Created a zero-dependency Node.js bridge on dedicated localhost ports that:
- Intercepts Claude Code's Anthropic `/v1/messages` calls.
- Maps whatever model Claude Code requests to the target TokenRouter model (`qwen/qwen3.8-max-free` or `moonshotai/kimi-k3`).
- Normalizes `reasoning_effort` (converting `xhigh` $\rightarrow$ `high`), normalizes thinking configs, and strips incompatible beta headers.
- Automatically retries upstream `502`/`503`/`504` load spikes up to 3 times with exponential backoff.
- Streams Server-Sent Events (SSE) back to Claude Code.

### 2. Isolated Launch Wrapper (`~/.claude/bridges/run-claude-tokenrouter.sh`)
Launches the background bridge on dedicated ports per model family (`20148` for Qwen Free, `20149` for Kimi K3) and executes Claude Code in an isolated profile directory (`~/.claude/profiles/tokenrouter-*`).

### 3. OpenCode to Kimi Code Synchronization
Generated a complete `config.toml` for Kimi Code importing all 226+ model definitions from OpenCode CLI (TokenRouter, OmniRoute, 9Router, Ollama, Groq, OpenRouter).

### 4. Shell Profile Aliases (`~/.zshrc`)
Added clean, dedicated aliases for fast terminal access across all CLI tools.

---

## 7. Commands

### Launching Claude Code with TokenRouter
```bash
# 100% Free Tier (Qwen 3.8 Max):
claude-qwen-free

# Kimi K3 (Promotional Token Tier):
claude-tokenrouter
```

### Launching Kimi Code CLI
```bash
# TokenRouter Qwen Free:
kimi-qwen-free

# TokenRouter Kimi K3:
kimi-tokenrouter

# Switch to any synced model inside Kimi Code:
# /model tokenrouter/qwen3.8-max-free
# /model 9router/ag/gemini-3.7-flash-high
# /model omniroute/auto/best-coding
```

### Launching OpenCode CLI
```bash
# TokenRouter Qwen Free:
opencode-qwen-free

# TokenRouter Kimi K3:
opencode-kimi
```

---

## 8. Verification

1. **TokenRouter Direct Health Check**:
   ```bash
   curl -s http://127.0.0.1:20148/health
   # Returns: {"ok":true,"model":"qwen/qwen3.8-max-free"}
   ```
2. **Claude Code Tool Execution & Reasoning**:
   Executed `claude doctor` and workspace shell queries using `claude-qwen-free`. Successfully performed thinking blocks (38s), directory analysis, file reads, and tool invocations.
3. **Kimi Code Model Loading**:
   Verified prompt execution on `tokenrouter/qwen3.8-max-free` and verified that all 226 models populate in `/model`.
4. **OpenCode CLI Execution**:
   Verified model listing and completion with `opencode models tokenrouter`.

---

## 9. Final Working State

- **`~/.claude/bridges/run-claude-tokenrouter.sh`**: Executable wrapper ensuring dynamic bridge lifecycle.
- **`~/.claude/bridges/tokenrouter-bridge.mjs`**: Active proxy bridge with effort normalization and retry support.
- **`~/.config/kimi-code/config.toml` & `~/.kimi-code/config.toml`**: 226 synchronized models across 6 providers.
- **`~/.config/opencode/opencode.json`**: Configured providers for TokenRouter, OmniRoute, 9Router, and Ollama.
- **`~/.zshrc`**: Exported API keys (`TOKENROUTER_API_KEY`, `TOKENROUTER_BASE_URL`) and unified alias suite.

---

## 10. Optional Cleanup

- Removed duplicate/stale `ANTHROPIC_BASE_URL` exports in `~/.zshrc`.
- Removed retired Hugging Face demo provider (`qwen-hf-free` / `qwen-3.8-27b`).
- Removed temporary nested git directory `debug-runbooks_clone/`.

---

## 11. If This Happens Again

1. **If Claude Code reports `ConnectionRefused`**:
   - Check if bridge is running: `curl http://127.0.0.1:20148/health`.
   - Restart via `claude-qwen-free` (the wrapper restarts dead bridge instances automatically).
2. **If Kimi Code throws `400 reasoning_content unsupported` on model switch**:
   - Type `/clear` to start a fresh turn without previous thinking blocks in session history.
3. **If TokenRouter returns `503 prefill failed`**:
   - Wait 5-10 seconds for the upstream GPU queue to clear; the bridge will automatically retry 3 times.
