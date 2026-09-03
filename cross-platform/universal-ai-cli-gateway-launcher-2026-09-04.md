# Universal AI CLI Gateway Launcher — Cross-Platform Runbook

**Date:** 2026-09-04  
**Status:** Partial / v0.4 ready for workstation validation  
**Platform validated so far:** macOS  

## Summary

A thin launcher now sits above the existing CLI and gateway stack so the CLI and gateway can be chosen independently without replacing prior gateway work.

Core rule:

> Launcher chooses CLI + gateway. Native `/model` chooses the model where supported.

Verified on the target workstation:

- Universal launcher installs and runs.
- `qwen-openrouter` works.
- Qwen native `/model` works with the curated provider catalogue.
- `if/qwen3.7-max` through OmniRoute works.
- B.AI MiMo V2.5 works.

Not yet fully verified:

- Kimi -> Groq direct is blocked by a known Kimi 0.39.1 payload incompatibility.
- Cline -> 9Router must be re-tested after correcting the launcher from the guessed `:9000` endpoint to the verified policy-guard endpoint `:20138`.
- FreeLLMAPI is not installed yet and must not collide with the existing FreeLLM service on `:3001`.

## Verified workstation inventory

- Aider 0.82.3
- Claude Code 2.1.251
- Cline 3.0.60
- Codex CLI 0.152.1
- Kimi Code 0.39.1
- OpenClaude 0.29.1
- OpenCode 1.18.15
- Qwen Code 0.23.0 during validation

## Verified local gateway topology

```text
FreeLLM              127.0.0.1:3001
OmniRoute            127.0.0.1:20128
9Router Policy Guard 127.0.0.1:20138   <- client-facing endpoint
9Router Backend      127.0.0.1:20139
```

The original launcher scaffold used `localhost:9000` for 9Router. That value was incorrect for this workstation and is fixed in v0.4.

## v0.4 fixes

### 1. Dry-run semantics fixed

Observed failure:

```bash
ai run kimi groq --dry-run
```

The launcher printed the configuration but then forwarded `--dry-run` into Kimi, causing:

```text
error: unknown option '--dry-run'
```

The same problem occurred with Cline.

Root cause: `argparse.REMAINDER` consumed launcher options written after the positional `CLIENT GATEWAY` arguments.

v0.4 recovers `--dry-run`, `--force`, and `--model` from the remainder before constructing the client command. A dry run now exits before the CLI is executed.

### 2. 9Router endpoint corrected

Old scaffold value:

```text
http://localhost:9000/v1
```

Verified client-facing endpoint:

```text
http://127.0.0.1:20138/v1
```

The `:20138` policy guard is intentionally preferred over direct backend `:20139` because it preserves local catalogue and request-time policy enforcement.

### 3. OmniRoute added as a first-class gateway

```text
http://127.0.0.1:20128/v1
```

New aliases include:

```text
qwen-omniroute
kimi-omniroute
```

### 4. Kimi 0.39.1 -> direct Groq compatibility guard

Groq itself was healthy during validation:

```text
HTTP 200
14 models
```

But Kimi Code 0.39.1 injected `prompt_cache_key`. Direct Groq calls rejected the field with HTTP 400.

This is a previously solved compatibility class in the existing Kimi cross-provider runbook: unsupported `prompt_cache_key` must be stripped only for providers that reject it, while preserving prompt caching where supported.

v0.4 therefore blocks `kimi + groq` by default and recommends:

```bash
kimi-omniroute
```

Then choose a `groq/...` model from Kimi `/model`. The existing OmniRoute compatibility layer is the intended sanitizing path.

A deliberate direct retest can still be forced with `--force`, but it is not the recommended daily path.

### 5. FreeLLMAPI collision guard

Existing FreeLLM already owns:

```text
127.0.0.1:3001
```

Therefore the prospective FreeLLMAPI entry is disabled in v0.4 until a distinct verified listener is chosen during installation. The launcher must never silently connect `openclaude-freellmapi` to the existing FreeLLM service and mislabel it as FreeLLMAPI.

### 6. Safe config migration

v0.4 adds:

```bash
ai migrate
```

It backs up the existing launcher config and only changes recognized v0.3 defaults:

- `9router` `:9000` -> `:20138`
- add OmniRoute `:20128`
- add `qwen-omniroute`
- add `kimi-omniroute`
- add Kimi->Groq compatibility guard
- disable the uninstalled FreeLLMAPI `:3001` placeholder

## Upstream model observations

Two OpenRouter free slugs returned HTTP 404 during Qwen validation:

```text
z-ai/glm-4.5-air:free
openai/gpt-oss-120b:free
```

Those are upstream catalogue changes, not launcher failures. The paid slugs were reported by OpenRouter as the available replacements.

## Current validation matrix

| Combination | Status |
|---|---|
| Universal launcher | Working |
| Qwen -> OpenRouter | Verified |
| Qwen -> OmniRoute -> `if/qwen3.7-max` | Verified |
| Qwen -> B.AI MiMo V2.5 | Verified |
| Kimi -> Groq direct | Blocked: `prompt_cache_key` HTTP 400 |
| Kimi -> OmniRoute -> Groq model | Ready for re-validation in v0.4 |
| Cline -> 9Router `:20138` | Ready for re-validation in v0.4 |
| OpenClaude -> FreeLLMAPI | Pending FreeLLMAPI install on non-conflicting port |

## Upgrade / validation commands

```bash
./install.sh
rehash
ai migrate
ai wrappers
rehash

ai health 9router
ai models 9router | head -20

ai health omniroute
ai models omniroute | head -20

ai run kimi groq --dry-run
# Expected: compatibility BLOCK; Kimi must not launch.

ai run kimi omniroute --dry-run
# Expected: Command: kimi, then exit without launching.

kimi-omniroute
# In Kimi /model choose a groq/... model and send a minimal test.

cline-9router
# Verify the selected 9Router model actually uses the corrected :20138 path.
```

## Security / secret hygiene

- No API key values are stored in launcher JSON.
- Only environment-variable names are stored.
- Diagnostic output masks credentials.
- Do not commit `.env`, shell profiles, credential exports, debug ZIPs, or full API responses containing secrets.
- FreeLLMAPI must receive a distinct verified port before enabling its alias.

## Rollback

`ai migrate` writes a backup next to the current config:

```text
config.json.pre-v0.4.bak
```

To roll back the migration, restore that backup and regenerate wrappers.

The launcher remains additive; existing gateways and native CLI configuration are not replaced.

## Blockers before marking Fixed

- Verify `kimi-omniroute` with at least one `groq/...` model.
- Verify `cline-9router` after the `:20138` correction.
- Install FreeLLMAPI on a distinct port and verify `openclaude-freellmapi`.
- Re-run secret scan and working-tree checks after the final documentation update.

## AI / CLI credit

- **OpenAI ChatGPT — GPT-5.6 Sol:** launcher architecture, v0.4 debugging, migration design, compatibility analysis, packaging, and runbook maintenance.
- **Qwen Code CLI:** workstation validation of `qwen-openrouter`, model switching, OmniRoute, OpenRouter, and B.AI model paths.
- **Kimi Code CLI:** exposed the direct Groq `prompt_cache_key` incompatibility during validation.
- **Cline CLI:** launched during 9Router testing; routing verification remains pending after endpoint correction.
