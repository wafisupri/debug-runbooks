# Universal AI CLI Gateway Launcher — Cross-Platform Runbook

## Summary

Build a thin, reversible launcher above the existing AI CLI and API-gateway stack so the CLI and gateway can be selected independently without replacing existing gateway work.

Target usage:

```text
qwen-openrouter
kimi-groq
cline-9router
openclaude-freellmapi
```

Equivalent explicit form:

```bash
ai run qwen openrouter
ai run kimi groq
ai run cline 9router
ai run openclaude freellmapi
```

The launcher chooses **CLI + gateway**. The CLI's own `/model` or model picker should remain responsible for model selection wherever the client supports it.

Status: **Designed / pending validation on the actual workstation.**

## Objective

Provide a universal selection layer while preserving every existing gateway and native CLI configuration.

The launcher must remain additive:

- no gateway replacement
- no forced migration
- no automatic overwrite of native CLI configuration
- no API keys stored in launcher configuration
- no nested gateway chain by default

## Architecture

```text
                       User
                        |
                 Universal launcher
                        |
       +----------------+----------------+
       |                |                |
    Qwen Code       Kimi Code          Cline
       |                |                |
       +--------+-------+-------+--------+
                |               |
          selectable gateways / providers
                |
   OpenRouter / Groq / 9Router / FreeLLMAPI
   Cerebras / NVIDIA / existing local gateways
```

The launcher only selects session context. Native CLI configuration remains authoritative when a client requires its own provider or model catalog.

## Launcher Commands

```bash
ai list
ai status
ai doctor
ai doctor --json
ai models openrouter
ai models groq
ai models freellmapi
ai run qwen openrouter --dry-run
ai run kimi groq --dry-run
ai run cline 9router --dry-run
ai run openclaude freellmapi --dry-run
```

Create literal wrapper commands after validation:

```bash
ai wrappers
```

Expected wrappers include:

```text
qwen-openrouter
kimi-groq
cline-9router
openclaude-freellmapi
codex-openrouter
aider-cerebras
```

## Security Design

API secrets are referenced only by environment-variable name.

Example gateway mappings:

```text
OPENROUTER_API_KEY
GROQ_API_KEY
NINEROUTER_API_KEY
FREELLMAPI_API_KEY
CEREBRAS_API_KEY
NVIDIA_API_KEY
```

The launcher must not contain real secret values.

Before every commit, scan tracked and untracked candidate files for provider-key patterns and redact any credential found.

## Client Compatibility Notes

### Qwen Code

Qwen Code supports OpenAI-compatible endpoints using environment overrides such as `OPENAI_BASE_URL`, `OPENAI_API_KEY`, and `OPENAI_MODEL` / `QWEN_MODEL`. It also supports provider/model selection through its native configuration and `/model` flow.

Recommended launcher role:

```text
qwen-openrouter
    -> set OpenRouter session variables
    -> launch Qwen Code as OpenAI-compatible
    -> choose the actual model with /model or startup model selection
```

### Kimi Code CLI

Kimi Code supports OpenAI-compatible provider types and environment overrides, but arbitrary gateways and models may still require a provider/model entry in Kimi's native configuration.

Therefore the launcher should not pretend that environment variables alone create Kimi's model catalog.

### OpenCode

OpenCode supports custom OpenAI-compatible providers. Provider identity, base URL, package/wire protocol, and model catalog are native OpenCode configuration concerns.

The launcher should select the session and inject secrets, but must not silently overwrite `opencode` configuration.

### Codex

Codex supports a base-URL override for its built-in OpenAI provider. Third-party gateways may require a dedicated `model_provider` profile so the wire API and key environment variable are explicit.

### Claude Code

Claude Code expects Anthropic-compatible semantics. Only pair it with a gateway that explicitly exposes an Anthropic-compatible endpoint.

An OpenAI-compatible `/v1` endpoint is not automatically suitable for Claude Code.

### Cline / OpenClaude / Qoder

Do not finalize adapters from assumptions. Inventory the exact installed build, version, provider options, configuration location, model picker, and supported environment variables on the workstation first.

## Local Inventory

Run:

```bash
ai doctor
ai doctor --json > ai-doctor.json
```

For every CLI, record:

- executable path
- version
- native configuration location
- base-URL override
- API-key override
- startup model argument
- slash-command model picker
- whether model discovery is dynamic from `/v1/models` or static from native config
- required wire API: OpenAI Chat Completions, OpenAI Responses, Anthropic, Gemini, or another protocol

For every gateway, record:

- actual base URL
- secret environment-variable name
- whether `/v1/models` works
- authentication header format
- supported wire APIs
- health check

## Validation Sequence

Do not begin with a real model call.

1. Run `ai doctor`.
2. Correct executable names and real gateway URLs.
3. Verify secrets are present only in the environment or credential store.
4. Run each intended combination with `--dry-run`.
5. Query `/v1/models` where supported.
6. Launch the CLI.
7. Confirm the native model picker behaves as expected.
8. Send one minimal test request.
9. Confirm the direct/original CLI configuration still works without the launcher.
10. Create literal wrappers only after the pair is validated.

## Rollback

Delete only the launcher and generated wrappers.

Existing gateways and native CLI configuration remain untouched.

Windows:

```powershell
Remove-Item -Recurse -Force "$HOME\.ai-launcher" -ErrorAction SilentlyContinue
Remove-Item -Force "$HOME\bin\ai.cmd" -ErrorAction SilentlyContinue
```

macOS / Linux:

```bash
rm -rf ~/.config/ai-launcher
rm -f ~/.local/bin/ai
```

Remove generated alias wrappers from the selected bin directory if they were created.

## Secret Scan Before Commit

At minimum:

```bash
git grep -nIE '(sk-[A-Za-z0-9_-]{10,}|gsk_[A-Za-z0-9_-]{10,}|nvapi-[A-Za-z0-9_-]{10,}|api[_-]?key\s*[:=]\s*[^<[:space:]]+)' -- .
```

Any plausible credential match must be treated as sensitive until reviewed.

## Working Tree / Blocker Checks

Before commit:

```bash
git status --short
git diff --check
git diff -- README.md cross-platform/universal-ai-cli-gateway-launcher-2026-09-04.md
```

Block commit if:

- a real secret is present
- the launcher overwrites existing native CLI configuration without explicit intent
- a gateway URL is guessed rather than verified
- an adapter is marked working without a real local test
- generated runtime files or credential files are staged

## Final Working State

Not yet declared.

The architecture and launcher scaffold are complete, but machine-specific executable discovery and gateway compatibility testing must be run on the user's actual workstation before this runbook can be marked **Fixed**.

## If This Happens Again

Use this rule:

> Launcher chooses CLI + gateway. Native CLI model picker chooses the model. Native provider configuration remains authoritative where required.

Do not rebuild the entire gateway stack just to test a new CLI/provider combination.

## AI / CLI Credit

Initial architecture, compatibility research, launcher scaffold, security constraints, and runbook: **OpenAI ChatGPT — GPT-5.6 Sol**.

For every later configuration/debugging session, append the AI assistant and CLI used for the change.
