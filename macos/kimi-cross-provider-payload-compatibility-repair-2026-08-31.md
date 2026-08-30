# Kimi Code Cross-Provider Payload Compatibility & Model Catalogue Repair — 2026-08-31

**Date:** 2026-08-31
**Status:** Fixed / Verified (PASS / CLOSED)
**Platform:** macOS (Apple Silicon, arm64)
**Components:** Kimi Code CLI, OmniRoute (:20128), 9Router (:20138/:20139), FreeLLM (:3001)

## Summary

Kimi Code CLI encountered HTTP 400 errors and request failures across upstream OpenAI-compatible provider integrations. Root cause analysis confirmed three contributing factors: injection of unsupported `prompt_cache_key` fields by Kimi Code, excessive `max_tokens` allocations exceeding upstream provider maximum output token limits (mistaking context window size for max completion tokens), and stale or retired provider catalogue entries.

Compatibility layers were repaired to sanitize `prompt_cache_key`, clamp `max_tokens` to provider-compatible output ceilings, remove genuinely decommissioned upstream models (HTTP 404/410), validate active Groq replacements (HTTP 200), and preserve quota-exhausted Cerebras models (HTTP 402, not retired). The FREE-FIRST architecture remains unchanged.

## Environment

- OS: macOS (Apple Silicon, arm64), zsh
- CLI Client: Kimi Code CLI (Gemini 3.7 Flash High / agent-swarm configuration)
- Local Gateway: OmniRoute on port `20128`
- Local Router: 9Router guard on port `20138`, backend on port `20139`
- Free Tier Gateway: FreeLLM on port `3001`
- Active Routing Model: FREE-FIRST with paid fallback architecture preserved

```
Kimi Code CLI
  ↓
OmniRoute :20128 / 9Router :20138/:20139 / FreeLLM :3001
  ↓
Upstream Providers (Groq, Cerebras, NVIDIA, Mistral, Gemini, GitHub, Cloudflare)
```

## Symptoms

1. Requests from Kimi Code to OpenAI-compatible provider endpoints failed with HTTP 400 bad request errors.
2. Ingress requests to certain strict providers failed due to `max_tokens` values set higher than provider-supported maximum output lengths.
3. Requests targeted at retired, EOL, or inaccessible model entries returned HTTP 404 or HTTP 410 errors.
4. Accounts hitting Cerebras rate/quota limits produced HTTP 402 responses.

## Root Cause

1. **`prompt_cache_key` Payload Injection:**
   Kimi Code injected `prompt_cache_key` into OpenAI-compatible request bodies. Several upstream providers reject unrecognized fields in request payloads with HTTP 400 Bad Request.

2. **Oversized `max_tokens` Allocations:**
   Requests passed `max_tokens` values corresponding to entire context window capacities rather than provider-specific maximum output completion limits. Strict providers rejected these parameters.

3. **Stale Model Catalogue Entries:**
   Several models in the provider catalogue had reached end-of-life (EOL), been decommissioned by upstreams, or were temporarily unreachable.

## What Did Not Work / Rejected Approaches

- **Broad Request Stripping:**
   Stripping `prompt_cache_key` indiscriminately across all routes was rejected; it must be preserved on upstreams that explicitly support prompt caching.
- **Treating HTTP 402 as Model Retirement:**
   Classifying Cerebras HTTP 402 errors as model EOL was rejected. HTTP 402 represents account quota/billing limits, not model retirement. Those models were preserved.
- **Treating Context Window as Output Cap:**
   Allowing `max_tokens` to reflect total context window was rejected; output limits must be clamped independently.

## Final Fix & Compatibility Repair

1. **`prompt_cache_key` Sanitization:**
   The compatibility and gateway layers strip `prompt_cache_key` for upstreams that do not support it while preserving it where explicitly supported.

2. **`max_tokens` Clamping:**
   `max_tokens` is clamped to the appropriate provider/model output cap. Smaller user/model requested values are preserved. Output token caps are strictly distinguished from context-window size.

3. **Stale Model Catalogue Cleanup:**
   Removed or disabled verified unavailable models:
   - `oc/deepseek-v4-flash-free` (HTTP 400 / upstream model unavailable)
   - `NVIDIA/meta/llama-3.3-70b-instruct` (HTTP 410 / EOL)
   - `NVIDIA/nvidia/llama-3.3-nemotron-super-49b-v1.5` (HTTP 410 / EOL)
   - `NVIDIA/microsoft/phi-3.5-moe-instruct` (HTTP 404 / deployment unavailable)
   - `NVIDIA/mistralai/mixtral-8x22b-v0.1` (HTTP 404 / deployment unavailable)
   - `groq/llama-3.3-70b-versatile` (HTTP 404 / retired upstream)
   - `cerebras/llama3.1-8b` (HTTP 404 / retired upstream)

4. **Validated Active Groq Replacements:**
   - `openai/gpt-oss-120b` (HTTP 200)
   - `qwen/qwen3.8-27b` (HTTP 200)
   - `groq/compound-mini` (HTTP 200)

5. **Cerebras Quota Classification:**
   - `gpt-oss-120b` (HTTP 402 / quota exhaustion — preserved)
   - `gemma-4-31b` (HTTP 402 / quota exhaustion — preserved)

6. **Preserved Working Provider Paths:**
   - `NVIDIA/openai/gpt-oss-120b` (HTTP 200)
   - `NVIDIA/meta/muse-glimmer-30b` (HTTP 200)
   - `free-smart` (HTTP 200 via FreeLLM → Mistral)
   - `freellm/gemini/gemini-2.5-flash`
   - `freellm/github/openai/gpt-4o-mini`
   - `freellm/cloudflare/@cf/meta/llama-3.3-70b-instruct-fp8-fast`
   - `9router/NVIDIA/google/gemma-4-31b-it`

## Verification & Diagnostic Evidence

### Generation Tests

1. **Groq `openai/gpt-oss-120b`:**
   - Status: HTTP 200
   - `prompt_cache_key` stripped
   - `max_tokens` clamped
   - Result: Valid generation response

2. **Cerebras `gpt-oss-120b`:**
   - Status: HTTP 402 (Quota exhaustion)
   - Result: Correctly preserved without false EOL classification

3. **NVIDIA `openai/gpt-oss-120b`:**
   - Status: HTTP 200
   - Result: Valid response

4. **NVIDIA `meta/muse-glimmer-30b`:**
   - Status: HTTP 200
   - Result: Valid response

5. **`free-smart` Route:**
   - Status: HTTP 200
   - Result: Successfully routed via FreeLLM (:3001) to Mistral

### Final Regression State

- Kimi Code: HEALTHY
- OmniRoute (:20128): HEALTHY
- 9Router (:20138/:20139): HEALTHY
- FreeLLM (:3001): HEALTHY
- FREE-FIRST Architecture: UNCHANGED
- PAID Fallback: UNCHANGED
- `prompt_cache_key` fix: PRESERVED
- `max_tokens` fix: PRESERVED
- Secrets Changed: NONE
- Remaining Stale Models: NONE
- Final Verdict: PASS

## Rollback / Recovery Considerations

If upstream providers introduce breaking changes:
- Ingress payload transformations can be adjusted in gateway configuration (`~/.config/kimi-code/...` or router mappings).
- Clamping limits can be modified per provider catalog entry.
- Quota alerts on HTTP 402 should trigger account replenishment rather than catalogue pruning.

## Security Considerations

- No secrets, API keys, or authorization tokens were modified or logged.
- Path representations use sanitized neutral placeholders (e.g., `~/.config/...`).
- Upstream requests strip non-standard headers and unsupported payload attributes.

## AI / CLI Assistance

- **ChatGPT (GPT-5.6 Sol):** Diagnosis, remediation planning, verification strategy, and documentation guidance.
- **Kimi Code CLI:** Local inspection, implementation, testing, catalogue cleanup, regression verification, and Git/documentation execution in configured Gemini 3.7 Flash High / agent-swarm environment.
