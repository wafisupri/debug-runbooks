# Kimi Code 0.38 Provider Recovery & Verified 9Router Gemini Default

**Date:** 2026-08-25  
**Status:** Fixed  
**Platform:** macOS  

---

## 1. Summary

Recovered Kimi Code CLI v0.38.0 after repeated failures across several free or OpenAI-compatible model routes. The failures came from a mixture of stale reasoning history, provider quota exhaustion, unsupported request fields, output-token limits, and provider throughput limits.

The final verified solution was to:

- Disable Kimi thinking persistence globally (`thinking.enabled = false`, `thinking.keep = "none"`).
- Stop using the quota-blocked `9router/Cerebras/gpt-oss-120b` route as the default.
- Verify `9router/ag/gemini-3.7-flash-high` for both normal inference and Kimi filesystem tool use.
- Promote `9router/ag/gemini-3.7-flash-high` to `default_model`.
- Leave the remaining provider/model definitions intact as alternatives.

No Groq compatibility shim was required in the final working state.

---

## 2. Environment

- **Operating system:** macOS on Apple Silicon (`arm64`)
- **Shell:** zsh
- **Kimi Code CLI:** v0.38.0
- **Kimi executable:** `~/.kimi-code/bin/kimi`
- **Active Kimi home:** `~/.config/kimi-code`
- **Active configuration:** `~/.config/kimi-code/config.toml`
- **Workspace:** `~/GitHub/freellm`
- **Relevant local services:**
  - OmniRoute: `:20128`
  - 9Router: `127.0.0.1:20138`
  - FreeLLM: `:3001`
- **Final provider count:** 7
- **Final model count:** 236

The machine remains arm64-native; Rosetta 2 is not required for this recovery.

---

## 3. Symptoms

Kimi cycled through multiple providers/models and encountered several distinct errors:

- `429 Rate limit exceeded: free-models-per-day`
- TokenRouter: `403 User's credit limit is insufficient`
- 9Router/Cerebras: `402 Payment required`
- FreeLLM/OpenAI-compatible endpoints: `Unrecognized key(s) in object: 'prompt_cache_key'`
- OmniRoute/Groq route: `property 'prompt_cache_key' is unsupported`
- Groq GPT-OSS: oversized `max_tokens`
- Groq GPT-OSS free tier: request exceeded the provider's tokens-per-minute limit
- Older sessions using reasoning-capable models also hit rejected `reasoning_content` fields
- `--no-thinking` was not a valid option in installed Kimi Code v0.38.0

Kimi itself was installed and provider model-list endpoints were generally reachable, so this was not a basic installation or network failure.

---

## 4. Root Cause

There were multiple independent causes:

1. **Stale reasoning state** — Kimi had thinking enabled and old sessions contained reasoning-related fields that some OpenAI-compatible providers rejected.
2. **Kimi 0.38 OpenAI-compatible request behavior** — Kimi sent `prompt_cache_key` to OpenAI-compatible endpoints; several providers/routes rejected that field.
3. **Provider-specific token constraints** — Kimi requested very large output limits (`max_tokens=131072` in testing). Groq rejected values above its model limit. Even after capping output to 65536 in a temporary shim, the full Kimi request exceeded Groq's free-tier throughput budget.
4. **Quota/payment exhaustion** — several otherwise valid routes were unavailable due to free-tier quota or payment requirements.

The configuration contained a working alternative already: `9router/ag/gemini-3.7-flash-high`.

---

## 5. What Did Not Work

- **Reusing old Kimi sessions:** old sessions carried reasoning history and were not a clean way to test repaired provider settings.
- **`--no-thinking`:** Kimi Code v0.38.0 rejected the flag with `error: unknown option '--no-thinking'`. The correct fix was configuration-level thinking control.
- **FreeLLM / OmniRoute OpenAI-compatible routes:** exposed the `prompt_cache_key` incompatibility; FreeLLM also rejected Kimi's output-token size.
- **OpenRouter free route:** daily free-model quota had already been exhausted.
- **9Router → Cerebras GPT-OSS 120B:** returned a payment/quota error after the reasoning-history problem was removed.
- **Direct Groq GPT-OSS 120B:** a temporary loopback shim successfully removed `prompt_cache_key` and capped `max_tokens`, but the Kimi request still exceeded Groq's free-tier TPM allowance, so the shim was not adopted permanently.
- **Restoring arbitrary old backups:** one timestamped backup contained an earlier bad state. Recovery switched to validating exact invariants rather than assuming any older backup was good.

---

## 6. Final Fix

### 6.1 Disable thinking persistence

```toml
[thinking]
enabled = false
keep = "none"
```

### 6.2 Verify the 9Router Gemini route

```bash
cd ~/GitHub/freellm

kimi \
  -m '9router/ag/gemini-3.7-flash-high' \
  -p 'Reply exactly: KIMI_9ROUTER_GEMINI_PASS. Do not use tools.'
```

Observed:

```text
KIMI_9ROUTER_GEMINI_PASS
```

### 6.3 Verify Kimi tool use

```bash
cd ~/GitHub/freellm

node -e '
const p = require("./package.json");
console.log("EXPECTED_PROJECT_NAME=" + p.name);
'

kimi \
  -m '9router/ag/gemini-3.7-flash-high' \
  -p 'Use your file-reading tool to read ./package.json. Do not modify any files and do not use shell commands. Reply with exactly one line in this format: KIMI_PROJECT_NAME=<the value of the name field>'
```

Observed values matched:

```text
EXPECTED_PROJECT_NAME=freellm
KIMI_PROJECT_NAME=freellm
```

### 6.4 Promote the verified model to default

```diff
-default_model = "9router/Cerebras/gpt-oss-120b"
+default_model = "9router/ag/gemini-3.7-flash-high"
```

The thinking configuration, 7 providers, and 236 model definitions remained intact.

---

## 7. Commands

### Check the active configuration

```bash
python3 - "$HOME/.config/kimi-code/config.toml" <<'PY'
import sys
import tomllib

with open(sys.argv[1], "rb") as f:
    cfg = tomllib.load(f)

thinking = cfg.get("thinking", {})
print("default_model    =", repr(cfg.get("default_model")))
print("thinking.enabled =", repr(thinking.get("enabled")))
print("thinking.keep    =", repr(thinking.get("keep")))
print("providers        =", len(cfg.get("providers", {})))
print("models           =", len(cfg.get("models", {})))
PY
```

Expected:

```text
default_model    = '9router/ag/gemini-3.7-flash-high'
thinking.enabled = False
thinking.keep    = 'none'
providers        = 7
models           = 236
```

### Normal Kimi use inside the FreeLLM repository

```bash
cd ~/GitHub/freellm
kimi
```

### Test the default without specifying `-m`

```bash
cd ~/GitHub/freellm

kimi \
  -p 'Reply exactly: KIMI_DEFAULT_PASS. Do not use tools.'
```

Expected:

```text
KIMI_DEFAULT_PASS
```

### Optional zsh setting for pasted comments

```bash
setopt interactivecomments
```

---

## 8. Verification

The recovery was considered complete only after all of these passed:

1. `thinking.enabled = false`, `thinking.keep = "none"`, 7 providers preserved, 236 models preserved.
2. Explicit `9router/ag/gemini-3.7-flash-high` inference returned the sentinel string.
3. Kimi's read-only file tool read `./package.json` and returned the same `freellm` package name as independent Node.js ground truth.
4. Kimi started without `-m` and returned `KIMI_DEFAULT_PASS`.
5. The final promotion diff changed only `default_model`.

---

## 9. Final Working State

```text
Kimi Code              0.38.0
Default model          9router/ag/gemini-3.7-flash-high
Thinking               disabled
Reasoning preservation none
Providers              7
Models                  236
Normal inference        PASS
File-reading tool use   PASS
Default-model smoke     PASS
Compatibility shim      not required
```

Relevant TOML:

```toml
default_model = "9router/ag/gemini-3.7-flash-high"

[thinking]
enabled = false
keep = "none"
```

The previous `9router/Cerebras/gpt-oss-120b` model entry remains configured as an alternative; it is simply no longer the default.

Final promotion backup:

```text
~/.config/kimi-code/config.toml.pre-default-promotion-20260825-165422
```

---

## 10. Optional Cleanup

Temporary Groq compatibility shims were not part of the final solution.

Old Kimi config backups may be archived later, but keep the final known-good promotion backup until the configuration has remained stable through normal use.

A shell wrapper may optionally make `kimi` always start in `~/GitHub/freellm`; that convenience change is separate from the verified provider recovery.

---

## 11. If This Happens Again

1. Do not resume an old failing Kimi session.
2. Confirm the active config is `~/.config/kimi-code/config.toml`.
3. Validate:

```text
thinking.enabled = false
thinking.keep    = "none"
default_model    = "9router/ag/gemini-3.7-flash-high"
```

4. Run a fresh default smoke test:

```bash
cd ~/GitHub/freellm
kimi -p 'Reply exactly: KIMI_DEFAULT_PASS. Do not use tools.'
```

5. If the default route fails, test the explicit model:

```bash
kimi \
  -m '9router/ag/gemini-3.7-flash-high' \
  -p 'Reply exactly: KIMI_9ROUTER_GEMINI_PASS. Do not use tools.'
```

6. If inference works but coding actions fail, rerun the read-only `package.json` tool-use test before making provider/config changes.
7. Treat `402`, `403`, and `429` responses as provider quota/payment conditions unless evidence shows a local configuration problem.
8. If an OpenAI-compatible route reports `prompt_cache_key` as unsupported, isolate it as a Kimi/provider protocol compatibility issue rather than repeatedly rotating models.
