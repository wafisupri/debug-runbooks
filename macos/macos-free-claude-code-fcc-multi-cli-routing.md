# macOS Free Claude Code (FCC) — Multi-CLI Routing Runbook

**Date:** 2026-09-07
**Status:** Fixed / Verified
**Platform:** macOS (Apple Silicon / arm64), macOS 15.x (Darwin 25.6.0)
**Components:** Free Claude Code (FCC) 5.21.0, launchd, Claude Code 2.1.251, OpenClaude 0.29.1, OpenCode 1.18.29, Aider 0.86.2, Codex CLI 0.152.1, Cline CLI 3.0.60, Hermes 0.21.0, Pi 0.85.1, DeepSeek Harness (dsh) 0.1.0-rc.8, Muse 1.0.3

---

## 1. Purpose

Keep **three fully independent AI coding paths** on one macOS machine, so that using free/aggregated models never touches the paid Claude Pro subscription, and so that a failure in one path never contaminates the others:

```text
claude        -> native Anthropic / Claude Pro          (paid subscription path)
openclaude    -> 127.0.0.1:20138/v1 -> silverMBN        (OpenClaude + 9Router gateway)
fcc-*         -> 127.0.0.1:8082                         (Free Claude Code multi-provider router)
```

This runbook is the final cleanup, hardening, validation, and documentation pass. It records the verified final state, the isolation guarantees, the FCC service configuration, the model routing and fallback chain, the client compatibility matrix, the duplicate-install cleanup, the skill-format fixes, the Hermes gateway recovery, the Cline integration limitation, and the rollback procedure.

---

## 2. Architecture

```text
                     +---------------------------+
                     |   Terminal (zsh, user)    |
                     +-------------+-------------+
                                   |
        +--------------------------+--------------------------+
        |                          |                          |
        v                          v                          v
  (1) claude              (2) openclaude               (3) fcc-*
        |                          |                          |
        v                          v                          v
 api.anthropic.com        127.0.0.1:20138/v1         127.0.0.1:8082
 (OAuth subscription)     (9Router gateway,          (FCC LaunchAgent
                           model: silverMBN)          ai.fcc.server)
                                                            |
                                        +-------------------+-------------------+
                                        |                                       |
                                  OpenRouter / Gemini / Groq /            Anthropic
                                  Hugging Face / TokenRouter /            Messages API
                                  OpenCode Zen / Vercel / ...             + Responses API
```

**Key property:** no shared credential, no shared endpoint, no shared config file between the three paths.

---

## 3. Native Claude Isolation (path 1)

Native `claude` must remain on the normal Anthropic / Claude Pro path.

### Verified state

| Check | Result |
|---|---|
| `claude --version` | `2.1.251 (Claude Code)` |
| Binary | `~/.local/bin/claude` -> `~/.local/share/claude/versions/2.1.251` |
| `ANTHROPIC_BASE_URL` | **unset** |
| `ANTHROPIC_AUTH_TOKEN` | **unset** |
| `ANTHROPIC_MODEL` | **unset** |
| `ANTHROPIC_DEFAULT_OPUS` / `_SONNET` / `_HAIKU` | **unset** |
| `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY` | **unset** |
| OAuth account in `~/.claude.json` | present (`oauthAccount`) |
| Project-level env overrides referencing `ANTHROPIC*` / `BASE_URL` | **none** (4 projects checked) |

### Deliberately preserved (untouched)

These exist in `~/.claude/settings.json` and were intentionally **not** modified:

- `env.API_TIMEOUT_MS` = `600000`
- `hooks.PreToolUse` -> `rtk hook claude`
- `permissions.defaultMode` = `auto`
- `skillOverrides` (all `firecrawl-*` skills set to `off`)
- `statusLine` command
- `enableWorkflows` = `true`
- `~/.claude/settings.local.json` (onboarding state, output style, allow-list)

`~/.claude/settings.json` contains **no** `ANTHROPIC_*` env block — verified.

### Background environment note

`OPENAI_BASE_URL=https://api.groq.com/openai/v1` is exported from `~/.zshrc` for unrelated OpenAI-compatible tooling. It does **not** affect native Claude, which reads only `ANTHROPIC_*` variables. `NO_PROXY=127.0.0.1,localhost,::1` is correctly set so local gateways bypass any proxy.

---

## 4. OpenClaude Isolation (path 2)

OpenClaude remains isolated on its own gateway and is **untouched** by FCC.

```text
command      openclaude
binary       ~/Library/pnpm/bin/openclaude
endpoint     http://127.0.0.1:20138/v1
model alias  silverMBN
version      0.29.1 (OpenClaude)
listener     TCP 127.0.0.1:20138 (node PID 26192)
```

`~/.zshrc` defines an `openclaude()` wrapper that pins `OPENAI_BASE_URL="http://127.0.0.1:20138/v1"` for the invocation only. A second helper, `openclaude-tokenrouter()`, points at `https://api.tokenrouter.com/v1`. Both were left intact.

---

## 5. FCC Architecture (path 3)

```text
package          free-claude-code 5.21.0
install          uv tool -> ~/.local/share/uv/tools/free-claude-code
binaries         ~/.local/bin/fcc-* (symlinks into the uv tool venv)
service label    ai.fcc.server
plist            ~/Library/LaunchAgents/ai.fcc.server.plist
bind             127.0.0.1:8082
admin UI         http://127.0.0.1:8082/admin  (loopback-only)
config file      ~/.fcc/.env  (managed by FCC; edit via /admin when possible)
auth store       ~/.fcc/auth/openai.json
logs             ~/.local/var/log/fcc-server.log
                 ~/.local/var/log/fcc-server.error.log
```

### Available FCC client wrappers

```text
fcc-aider    fcc-claude   fcc-cline    fcc-codex    fcc-desktop
fcc-dsh      fcc-grok     fcc-hermes   fcc-muse     fcc-opencode
fcc-pi       fcc-server
```

Each wrapper injects FCC routing **process-locally** (env + a generated process-local config) and then execs the real client binary. FCC credentials are never persisted into the client's own config files.

---

## 6. FCC LaunchAgent Service

### plist (verified valid)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>ai.fcc.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/wfspr/.local/bin/fcc-server</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProcessType</key>
    <string>Background</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOST</key>
        <string>127.0.0.1</string>
        <key>PATH</key>
        <string>/Users/wfspr/.local/bin:/Users/wfspr/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>PYTHONUNBUFFERED</key>
        <string>1</string>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/wfspr/.local/var/log/fcc-server.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/wfspr/.local/var/log/fcc-server.error.log</string>
    <key>ThrottleInterval</key>
    <integer>5</integer>
</dict>
</plist>
```

`HOST=127.0.0.1` in the plist is what keeps the socket loopback-only. Older log lines show `Uvicorn running on http://0.0.0.0:8082` from a previous configuration; the **current** process correctly reports:

```text
INFO: Admin UI: http://127.0.0.1:8082/admin (local-only)
INFO: Uvicorn running on http://127.0.0.1:8082
```

### Service management

```bash
# Status (ground truth under this macOS build)
launchctl print gui/$(id -u)/ai.fcc.server     # reliable
launchctl list | grep -i fcc                   # may return nothing; use print

# Normal restart
launchctl kickstart -k gui/$(id -u)/ai.fcc.server

# Full unload / reload (only if needed)
launchctl bootout   gui/$(id -u) ~/Library/LaunchAgents/ai.fcc.server.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.fcc.server.plist

# Validate plist
plutil -lint ~/Library/LaunchAgents/ai.fcc.server.plist    # -> OK
```

**Do not** start a second `fcc-server` by hand while the LaunchAgent is loaded — it owns port 8082.

### Verified service state

| Check | Result |
|---|---|
| `launchctl print gui/$(id -u)/ai.fcc.server` | `state = running`, `pid = 89189` |
| `plutil -lint` | `OK` |
| `lsof -nP -iTCP:8082 -sTCP:LISTEN` | single listener, `127.0.0.1:8082` (python3.14, PID 89189) |
| `curl http://127.0.0.1:8082/health` | `{"status":"healthy"}` (HTTP 200) |
| `curl -o /dev/null -w '%{http_code}' http://127.0.0.1:8082/admin` | `200` |
| Duplicate `fcc-server` processes | **none** (one listener, one job) |

The service survives terminal closure because it is a launchd LaunchAgent with `KeepAlive` + `RunAtLoad`, not a foreground shell job.

---

## 7. Installation

FCC is installed as a `uv` tool and exposes one wrapper per supported client:

```bash
# Install / upgrade (uv tool)
uv tool install free-claude-code            # or: uv tool upgrade free-claude-code

# Result
fcc-server --version                        # free-claude-code 5.21.0
ls -l ~/.local/bin/fcc-*                    # one wrapper per client

# Service
cp <plist> ~/Library/LaunchAgents/ai.fcc.server.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.fcc.server.plist
```

Then configure providers and models in the admin UI at `http://127.0.0.1:8082/admin` (sections: **Providers**, **Model Routing**, **Reasoning**, **Runtime**, ...).

---

## 8. Provider Configuration

Providers are configured in the FCC admin UI and persisted to `~/.fcc/.env`. Configured (**key names only** — no values are ever printed or committed):

```text
nvidia_nim        open_router      groq          gemini
deepseek          mistral          opencode_zen  opencode_go
vercel (AI GW)    huggingface      kimi          cerebras
tokenrouter       ollama           ollama_cloud  lmstudio  llamacpp
```

Not configured (no key present — expected): ClinePass, OpenAI/ChatGPT connected account, xAI, QwenCloud, Together, DeepInfra, SiliconFlow, Nebius, Chutes, Featherless, Agnes, ZenMux, W&B, Azure OpenAI, Vertex, Codestral, Bedrock, Cohere, Wafer, Kimi Code, Kilo, MiniMax, SambaNova, Fireworks, Novita, Cloudflare, ZAI, NaraRoute, Poolside, LLM7.

> **Operational note (verified 2026-09-07):** the Vercel AI Gateway account currently has **zero credit balance**. Its models (including `vercel/openai/gpt-6-astra-fast`) return `HTTP 402 / insufficient_funds`. This is an account-billing condition, not an FCC defect. Add credits at the Vercel AI Gateway dashboard if that provider should be used again.

---

## 9. Model Routing

Current tier mappings (**unchanged during this pass** — tier overrides were deliberately not touched):

| Setting | Model |
|---|---|
| `MODEL` (default) | `open_router/anthropic/claude-fable-5.1` |
| `MODEL_FABLE` | `vercel/openai/gpt-6-astra-fast` |
| `MODEL_OPUS` | `gemini/models/gemini-3.8-flash` |
| `MODEL_SONNET` | `tokenrouter/stealth/ox-alpha` |
| `MODEL_HAIKU` | `huggingface/MiniMaxAI/MiniMax-M3` |

Clients request a tier (or the public slug) and FCC resolves it to a provider-specific wire slug, e.g. `anthropic/open_router/anthropic/claude-fable-5.1` for the Anthropic Messages view and `open_router/anthropic/claude-fable-5.1` for the OpenAI Responses view. `GET /v1/models` exposes 2,532 wire slugs across both views.

---

## 10. Tier Overrides

**Deliberately not changed.** `MODEL`, `MODEL_FABLE`, `MODEL_OPUS`, `MODEL_SONNET`, and `MODEL_HAIKU` were recorded (see section 9) and left exactly as found, per the change-control rule for this pass: *"DO NOT blindly change tier overrides."*

One consequence is documented rather than silently fixed:

- `MODEL_FABLE` = `vercel/openai/gpt-6-astra-fast`, and Vercel currently returns `402 insufficient_funds`. Any client whose tier resolution selects **Fable** therefore starts on a provider that cannot bill. FCC's per-request fallback chain (section 11) covers this *only* for retryable failures — see the important caveat in section 11.

---

## 11. Fallback Routing

### Before (over-sized, 14 entries, with an audio model in the chain)

```text
open_router/openai/gpt-6-astra-pro
open_router/anthropic/claude-fable-5.1
gemini/models/gemini-3.8-flash
groq/qwen/qwen3.8-27b
opencode_zen/grok-4.6
huggingface/zai-org/GLM-5.3
huggingface/MiniMaxAI/MiniMax-M3
huggingface/stepfun-ai/Step-3.7-Flash
huggingface/XiaomiMiMo/MiMo-V2.5-Pro
open_router/meta/muse-spark-1.3
tokenrouter/sakana/fugu-ultra
tokenrouter/tencent/hy4-preview
huggingface/deepseek-ai/DeepSeek-R1-Distill-Llama-70B
huggingface/google/gemma-4-31B-it
```

Problem: `groq/whisper-large-v3-turbo` (an **audio transcription** model, not a coding/chat model) had been part of the coding fallback chain. It was removed.

### After (7 entries, 6 distinct providers)

```text
open_router/anthropic/claude-fable-5.1     # OpenRouter   - primary coding model
gemini/models/gemini-3.8-flash             # Google Gemini
groq/qwen/qwen3.8-27b                      # Groq
opencode_zen/grok-4.6                      # OpenCode Zen
tokenrouter/stealth/ox-alpha               # TokenRouter
huggingface/MiniMaxAI/MiniMax-M3           # Hugging Face
vercel/openai/gpt-6-astra-fast             # Vercel AI Gateway (currently 402 - see §8)
```

Design goals met: 5–8 entries, coding/tool-use capable, provider diversity (6 distinct providers, so one provider outage cannot kill the chain), no audio/embedding/vision-only models.

### How FCC actually walks the chain (important)

Read from the installed source (`free_claude_code/providers/failure_policy.py`, `application/execution.py`):

- `_is_retryable_status(status)` returns true **only for `429` and `500–599`**.
- A candidate that fails with any other status — including **`402 Payment Required`** — is raised **immediately**; the remaining fallbacks are **not** tried.
- Therefore a `402` from the *primary* candidate produces a hard failure with the upstream `402` error surfaced to the client, even when healthy fallbacks exist behind it.

This explains the transient `Upstream provider VERCEL returned HTTP 402` errors seen during validation: the request's first candidate resolved to a Vercel-hosted model, and a 402 is non-retryable, so the chain stopped. After the FCC service was restarted (fresh settings snapshot), the same clients resolved directly to OpenRouter and succeeded on every run.

> **If Vercel 402s reappear:** either top up the Vercel AI Gateway balance, or change `MODEL_FABLE` away from the Vercel slug (tier overrides are intentionally unchanged in this pass). Do **not** expect the fallback chain to rescue a 402.

### Applying model changes safely

FCC exposes a loopback-only admin API. Model changes do **not** require a service restart (`restart_required = false`); `PROXY_AUTH_ENABLED` and logging flags do.

```bash
# Read current config (secrets are masked server-side)
curl -s http://127.0.0.1:8082/admin/api/config | python3 -m json.tool

# Apply a value
curl -s -X POST http://127.0.0.1:8082/admin/api/config/apply \
  -H 'Content-Type: application/json' \
  -d '{"values": {"MODEL_FALLBACKS": "open_router/anthropic/claude-fable-5.1,gemini/models/gemini-3.8-flash,groq/qwen/qwen3.8-27b,opencode_zen/grok-4.6,tokenrouter/stealth/ox-alpha,huggingface/MiniMaxAI/MiniMax-M3,vercel/openai/gpt-6-astra-fast"}}'

# Response contains: applied, valid, errors, env_preview (masked), restart{required,automatic}
```

---

## 12. Client Compatibility Matrix

All tests were one-shot, non-destructive, run from `/tmp/fcc-matrix`, and each client was asked to reply with its confirmation string.

| Client | Version | Model shown | Result | Notes |
|---|---|---|---|---|
| `fcc-claude` | 2.1.251 (Claude Code) | `open_router/anthropic/claude-fable-5.1` | ✅ PASS | `fcc-claude -p "..."` |
| `fcc-opencode` | 1.18.29 | `open_router/anthropic/claude-fable-5.1` (header: `> build · open_router/anthropic/claude-fable-5.1`) | ✅ PASS | Intermittent Vercel 402s earlier in the session; clean after FCC restart |
| `fcc-codex` | codex-cli 0.152.1 | `open_router/anthropic/claude-fable-5.1`, provider `fcc` | ✅ PASS | Verified 3 consecutive runs; needs `--skip-git-repo-check` outside a git repo |
| `fcc-aider` | 0.86.2 | `anthropic/open_router/anthropic/claude-fable-5.1` (whole edit format) | ✅ PASS | Run with `--no-git` outside a repo |
| `fcc-hermes` | 0.21.0 (upstream 485aaf69) | routed via FCC | ✅ PASS | `fcc-hermes -z "<prompt>"` |
| `fcc-pi` | 0.85.1 | routed via FCC | ✅ PASS | `fcc-pi -p "<prompt>"` (`--print` = non-interactive) |
| `fcc-dsh` | 0.1.0-rc.8 | routed via FCC | ✅ PASS | `fcc-dsh --profile headless "<task>"` answers and exits |
| `fcc-muse` | Muse Code 1.0.3 | routed via FCC | ✅ PASS | `fcc-muse exec "<prompt>"` (headless) |
| `fcc-cline` (CLI) | 3.0.60 | `open_router/anthropic/claude-fable-5.1`, provider `openai-native` | ✅ PASS | The **CLI** works. See section 16 for the VS Code extension limitation |
| `claude` (native) | 2.1.251 | Claude Pro / Anthropic | ✅ PASS | Untouched; not routed through FCC |
| `openclaude` | 0.29.1 | `silverMBN` @ 127.0.0.1:20138/v1 | ✅ PASS | Untouched; independent gateway |

---

## 13. OpenCode Upgrade / Path Issue and Fix

### Problem

Two OpenCode installs existed; the older one was shadowed but still on `PATH`:

```text
/Users/wfspr/.local/bin/opencode                      -> 1.18.29   (wins; PATH order)
/Users/wfspr/.nvm/versions/node/v24.18.1/bin/opencode -> 1.18.15   (stale, shadowed)
```

`~/.local/bin` appears before the NVM bin directory in `PATH`, so 1.18.29 was already the effective binary.

### What was done

1. Backed up the removal record (`REMOVAL-RECORD.txt`, including the restore command).
2. Removed the stale NVM install.

```bash
# Preferred update workflow (unchanged)
opencode upgrade -m npm
rehash          # zsh: refresh the command hash table after a global npm change
```

### ⚠️ Incident during cleanup — and the fix

The first removal attempt used the NVM copy's `npm` **without** pinning its prefix. Because the user's npm prefix resolves to `~/.local`, `npm uninstall -g opencode-ai` removed the **active** `~/.local` install (1.18.29) instead of the NVM copy. Symptom:

```text
ls: /Users/wfspr/.local/bin/opencode: No such file or directory
ls: /Users/wfspr/.local/lib/node_modules/opencode-ai: No such file or directory
```

Recovery (matches the user's preferred workflow and install location):

```bash
npm install -g opencode-ai@latest      # prefix ~/.local
opencode --version                     # -> 1.18.29
```

The stale NVM tree was then removed directly. Final state: **one** OpenCode on `PATH`.

### Final state

```text
which -a opencode        -> /Users/wfspr/.local/bin/opencode
opencode --version       -> 1.18.29
~/.nvm/.../bin/opencode  -> absent
```

### Lesson

When a machine has several npm global roots, always pin the prefix explicitly:

```bash
npm --prefix "$HOME/.local"                                  install -g <pkg>
npm --prefix "$HOME/.nvm/versions/node/v24.18.1"             uninstall -g <pkg>
```

---

## 14. Aider pipx / Python 3.12 Migration

### Problem

Two Aider installs:

```text
/Users/wfspr/.local/bin/aider            -> aider 0.86.2 (pipx, Python 3.12.14)   [wanted]
/Users/wfspr/Library/Python/3.9/bin/aider -> aider 0.82.3 (CPython 3.9, CLT site-packages) [stale]
```

### Verification before removal

- `~/.local/bin/aider` -> `~/Library/Application Support/pipx/venvs/aider-chat/bin/aider`
- Venv interpreter: **Python 3.12.14** (`pyvenv.cfg` -> `/opt/homebrew/opt/python@3.12/bin`)
- Version reported by that venv: `aider 0.86.2` ✅
- `which -a aider` order: `~/.local/bin` first ✅
- Reference scan for `Python/3.9/bin/aider` in `~/.zshrc`, `~/.zprofile`, `~/.bashrc`, aider config: **no matches** ✅

### What was done

- Backed up the 3.9 launcher (`aider.bin`) plus a removal record.
- Removed only the launcher `~/Library/Python/3.9/bin/aider`.
- **Left** `~/Library/Python/3.9/lib/python/site-packages/` (≈1.1 GB, shared by other 3.9 tooling) in place — deleting it was not clearly safe.

### Final state

```text
which -a aider    -> /Users/wfspr/.local/bin/aider
aider --version   -> aider 0.86.2
pipx venv python  -> 3.12.14
```

### Preferred maintenance commands

```bash
pipx upgrade aider-chat          # upgrade in place on Python 3.12
pipx reinstall aider-chat        # rebuild the venv if it breaks
aider --version                  # confirm
```

---

## 15. Hermes Upgrade / Restart

### Initial state

```text
hermes --version  -> Hermes Agent v0.21.0 (2026.8.31) · upstream 00140a85

hermes gateway status
  ⚠ A previous `hermes update` pulled new code but did not restart running gateways.
    Gateways may still be serving pre-update modules (mixed sys.modules).
  ⚠ Service definition is stale relative to the current Hermes install
  ✗ Gateway service is not loaded
    Note: a detached gateway process is running (PID 16675)
```

The interrupted update had left `~/.hermes/fleet_restart_pending` behind, so every CLI invocation re-printed the stale-code warning.

### What was done

```bash
hermes gateway restart      # stopped PID 16675, requested service restart (drains in-flight runs)
hermes gateway start        # refreshed the launchd plist:
                            #   "↻ Updated gateway launchd service definition ..."
                            #   "✓ Service started"
hermes update --check       # "⚕ Update available: 43 commits behind origin/main."
hermes update --yes         # pulled 43 commits, ran the pending fleet restart,
                            # cleared fleet_restart_pending
```

### Final state

```text
hermes --version       -> Hermes Agent v0.21.0 (2026.8.31) · upstream 22c5684b
                          local 485aaf69 (+1 carried commit)
launchctl print gui/$(id -u)/ai.hermes.gateway -> state = running, pid = 41505
plutil -lint ~/Library/LaunchAgents/ai.hermes.gateway.plist -> OK
hermes gateway status  -> "✓ Service definition matches the current Hermes install"
~/.hermes/fleet_restart_pending -> removed (stale-code warning gone)
```

Remaining cosmetic contradiction: `hermes gateway status` still prints "Gateway service is not loaded / a detached gateway process is running (PID …)", while `launchctl print` shows the same job as `state = running` with that PID. Hermes's status probe and launchd disagree on this build; launchd is authoritative and the gateway is live.

**Not disturbed:** Hermes's non-FCC provider configuration (`~/.hermes/config.yaml`), auth, channels, and cron. Two stale update autostash entries (>7 days old) were reported by Hermes and intentionally left for the user to review.

---

## 16. Cline Known Issue

### What was observed (final, non-destructive check)

The `fcc-cline` **CLI** (v3.0.60) works:

```bash
cd /tmp && fcc-cline --json "Reply with exactly: FCC cline works."
# ... {"type":"run_result","finishReason":"completed",
#      "text":"FCC cline works.",
#      "model":{"id":"open_router/anthropic/claude-fable-5.1","provider":"openai-native"}}
```

### The reported failure

The user's failure occurs on the **Cline VS Code extension** path:

```text
model: open_router/anthropic/claude-fable-5.1
FCC generates: protocol = openai-responses
               baseUrl  = http://127.0.0.1:8082/v1
               proxy token = freecc
error: "Incorrect API key provided: freecc"
```

The extension treats the FCC proxy token as a real OpenAI Platform API key and rejects it at/near the OpenAI endpoint rather than using it as an FCC proxy token.

### Recorded as

> **Known FCC 5.21.0 / Cline 3.0.60+ integration issue** — FCC's `openai-responses` + proxy-token configuration is not accepted by the Cline VS Code extension, which validates the key against OpenAI Platform semantics.

### Action taken

**No workaround applied to ordinary Cline configuration.** Per the change-control rule, ordinary Cline settings were not mutated. The condition is documented here instead. The CLI path is verified working and remains the supported way to use Cline with FCC.

---

## 17. Skill Warnings / Fixes

All four reported warnings were fixed. Every file was backed up **before** modification, original intent and body content were preserved, and each `SKILL.md` was re-validated with a YAML parser afterwards.

Backups: `~/dsh/fcc-backups-20260906-235410/skills/`

### 17.1 `~/.codex/skills/ian-xiaohei-illustrations/SKILL.md` — missing frontmatter

The file began directly with `# Ian Xiaohei Illustrations` and had no `---`-delimited YAML block.

Fix — a frontmatter block was prepended; the entire original body (268 lines) is unchanged:

```yaml
---
name: ian-xiaohei-illustrations
description: >-
  Transform judgments, processes, states, and metaphors from Chinese articles
  into clean, hand-drawn, quirky 16:9 body illustrations with the "Little Black"
  character, minimal red/orange/blue Chinese handwritten annotations, and
  information-rich explainer diagrams. Use when the user asks for Ian Xiaohei
  illustrations, 小黑插画, or a 16:9 hand-drawn article explanation image.
---
```

Validated: parses cleanly, `name` correct, description 371 chars.

### 17.2 Duplicate skill ID `ip-illustration-character-system`

Two directories declared the same skill ID:

```text
~/.codex/skills/ip-illustration-character-system/   SKILL.md 17,957 B  (canonical, kept)
~/.codex/skills/ip_illustration_for_yourself/       SKILL.md 18,009 B  (duplicate, removed)
```

The two `SKILL.md` files differed by exactly one line (a localized note: Chinese vs English wording). The canonical hyphen-named copy was kept; the underscore-named copy was removed after a full backup **including its `.git` directory** (38 MB) was taken.

```text
Removed: ~/.codex/skills/ip_illustration_for_yourself/
Kept:    ~/.codex/skills/ip-illustration-character-system/
Backup:  fcc-backups-20260906-235410/skills/ip_illustration_for_yourself-FULL/
```

### 17.3 `~/.agents/skills/firecrawl-build/SKILL.md` — malformed YAML

Cause: the `description` value was an **unquoted scalar containing `": "`** sequences (`...needs web data inside the app: web search, ...`), which is illegal in YAML:

```text
yaml.scanner.ScannerError: mapping values are not allowed here
  in "<unicode string>", line 3, column 124
```

Fix — the frontmatter was re-emitted with the description (unchanged text, 701 chars) safely quoted, preserving every other key (`name`, `license`, `metadata{author,version,homepage,source}`, `inputs[]`, `references[]`). Validated: parses cleanly, all keys and values intact.

### 17.4 `~/.agents/skills/firecrawl-monitor/SKILL.md` — description too long

The description was 1,069 characters (limit 1,024). Fix — the final sentence (*"Recommend this instead of repeated one-off scrapes whenever the user needs the same URL checked more than once."*) was dropped, keeping all trigger phrases and the AI-judge behaviour. New length: **956 characters**.

> **Regression caught and re-fixed:** the first rewrite extracted the description from raw text and accidentally kept the YAML block-scalar indicator, producing a description that began with `"| Detect when content..."`. It parsed, but the skill catalog then displayed a stray `| `. The file was regenerated from the pristine backup (parsing the block scalar correctly) and re-validated: description now starts with `Detect when content on a website changes and get notified…`, 956 chars.

**Lesson:** when repairing skill frontmatter, parse the **backup** with a real YAML parser rather than slicing raw lines; block scalars (`|`, `>-`) are easy to corrupt by hand.

---

## 18. Troubleshooting

### Symptom: `Upstream provider VERCEL returned HTTP 402 / insufficient_funds`

Meaning: the request's candidate resolved to a Vercel AI Gateway model and the account has no credits. Because 402 is **not** in FCC's retryable set (429, 5xx), remaining fallbacks are skipped (section 11).

```bash
# Confirm the balance problem is upstream, not FCC:
curl -s http://127.0.0.1:8082/health                      # healthy
grep -E "402 Payment Required" ~/.local/var/log/fcc-server.log | tail -n 5
```

Actions: top up Vercel AI Gateway, or move `MODEL_FABLE` off the Vercel slug, or restart FCC so the client re-resolves to OpenRouter:

```bash
launchctl kickstart -k gui/$(id -u)/ai.fcc.server
```

### Symptom: `PermissionError: ... '/Users/wfspr/.fcc/config.lock'`

An agent sandbox is blocking writes/opens outside its workspace; every `fcc-*` wrapper opens that lock at startup. Re-run the client with a broader file policy (or outside the sandbox).

### Symptom: `fcc-codex` — "Not inside a trusted directory"

```bash
fcc-codex exec --skip-git-repo-check "<prompt>" < /dev/null
```

Codex also reads stdin; redirect from `/dev/null` for one-shot runs.

### Symptom: `FCC /v1/responses supports streaming only`

`/v1/responses` requires streaming:

```bash
curl -s -N -X POST http://127.0.0.1:8082/v1/responses \
  -H 'Content-Type: application/json' \
  -d '{"model":"open_router/anthropic/claude-fable-5.1",
       "input":"ping","stream":true}'
```

### Symptom: skill not loading / "missing frontmatter" / "description too long"

Validate before and after any edit:

```bash
python3 - <<'EOF'
import yaml, sys
p = "<path>/SKILL.md"
t = open(p).read()
assert t.startswith("---"), "missing frontmatter"
d = yaml.safe_load(t.split("---", 2)[1])
print("name:", d.get("name"), "| desc chars:", len(d.get("description", "")), "(limit 1024)")
EOF
```

### Symptom: `401 {"detail":"Invalid proxy authentication token"}`

FCC proxy auth is enabled but the client is not presenting the retained token. Check `PROXY_AUTH_ENABLED` and the retained `ANTHROPIC_AUTH_TOKEN` in the admin UI (section 19). Reverting `PROXY_AUTH_ENABLED=false` restores the current known-good state.

---

## 19. Security Considerations

### FCC proxy / API authentication

Current setting:

```text
PROXY_AUTH_ENABLED = false
```

- FCC is bound to **`127.0.0.1:8082` only** (`HOST=127.0.0.1` in the LaunchAgent plist; current process logs `Uvicorn running on http://127.0.0.1:8082`).
- The admin API (`/admin`, `/admin/api/*`) is additionally guarded by a loopback check (`require_loopback_admin`).
- A non-empty `ANTHROPIC_AUTH_TOKEN` is retained by FCC and passed to every harness; enabling `PROXY_AUTH_ENABLED` requires exactly that token on FCC API routes. `PROXY_AUTH_ENABLED` is `restart_required = true`.

**Assessment for this machine:** with FCC reachable only from loopback, the residual risk is any local process on the same user account. Enabling proxy auth would require every FCC-launched client to present the retained token; that is the supported mechanism, but it must be validated against all eight clients before it is left on. It was **not** enabled in this pass, because doing so unvalidated would risk breaking the verified client matrix.

**If you enable it later:**

1. Note the retained token value from the admin UI (do not paste it anywhere).
2. Set `PROXY_AUTH_ENABLED = true` via `/admin/api/config/apply`; FCC restarts automatically.
3. Re-run the full matrix from section 12.
4. If any client fails with `401 Invalid proxy authentication token`, set `PROXY_AUTH_ENABLED = false` and restart.

**Hardening rules currently in force:**

- Never expose 8082 to the LAN/WAN — no SSH/port forwarding, no `0.0.0.0` bind, no reverse proxy without auth.
- Never commit `~/.fcc/.env`, `~/.fcc/auth/*`, client configs containing keys, or terminal dumps containing tokens.
- Only environment-variable **names** appear in this runbook; no values.

### Secret scan

See section 22.

---

## 20. Verification Commands

```bash
# --- Isolation -----------------------------------------------------------
claude --version
for v in ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN ANTHROPIC_MODEL \
         ANTHROPIC_DEFAULT_OPUS ANTHROPIC_DEFAULT_SONNET ANTHROPIC_DEFAULT_HAIKU \
         CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY; do
  printenv "$v" >/dev/null 2>&1 && echo "$v=SET" || echo "$v=unset"
done
python3 -c "import json;d=json.load(open('$HOME/.claude.json'));print('env block:',d.get('env'))"

openclaude --version
lsof -nP -iTCP:20138 -sTCP:LISTEN

# --- FCC service ---------------------------------------------------------
launchctl print gui/$(id -u)/ai.fcc.server
plutil -lint ~/Library/LaunchAgents/ai.fcc.server.plist
lsof -nP -iTCP:8082 -sTCP:LISTEN
curl -s http://127.0.0.1:8082/health
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8082/admin
fcc-server --version

# --- FCC routing ---------------------------------------------------------
grep -E '^(MODEL|MODEL_FABLE|MODEL_OPUS|MODEL_SONNET|MODEL_HAIKU|MODEL_FALLBACKS)=' ~/.fcc/.env
curl -s "http://127.0.0.1:8082/v1/models" | python3 -c "import json,sys;print(len(json.load(sys.stdin)['data']),'slugs')"

# --- Clients -------------------------------------------------------------
fcc-claude   -p "Reply with exactly: FCC claude works."
fcc-opencode run "Reply with exactly: FCC opencode works."
fcc-codex    exec --skip-git-repo-check "Reply with exactly: FCC codex works." < /dev/null
fcc-aider    --message "Reply with exactly: FCC aider works." --no-git --yes-always --no-check-update
fcc-hermes   -z "Reply with exactly: FCC hermes works."
fcc-pi       -p "Reply with exactly: FCC pi works."
fcc-dsh      --profile headless "Reply with exactly: FCC dsh works."
fcc-muse     exec "Reply with exactly: FCC muse works."
fcc-cline    --json "Reply with exactly: FCC cline works."

# --- Tools ---------------------------------------------------------------
which -a opencode aider; opencode --version; aider --version
hermes --version; hermes gateway status
launchctl print gui/$(id -u)/ai.hermes.gateway
```

---

## 21. Rollback Procedure

### FCC config (`~/.fcc/.env`)

```bash
# Backups taken in this pass
ls -l ~/dsh/fcc-backups-20260906-235410/
cp -p ~/dsh/fcc-backups-20260906-235410/fcc-env.bak-20260906-235410 ~/.fcc/.env
launchctl kickstart -k gui/$(id -u)/ai.fcc.server
curl -s http://127.0.0.1:8082/health
```

The pre-change fallback list (14 entries, section 11) is recorded in that backup and in this runbook — restore the file, then restart.

### Fallback chain only

```bash
curl -s -X POST http://127.0.0.1:8082/admin/api/config/apply \
  -H 'Content-Type: application/json' \
  -d '{"values": {"MODEL_FALLBACKS": "<paste the 14-entry list from section 11>"}}'
```

### Skills

```bash
cp -p ~/dsh/fcc-backups-20260906-235410/skills/<name>.SKILL.md <original path>
# duplicate skill (full tree, including .git):
cp -R ~/dsh/fcc-backups-20260906-235410/skills/ip_illustration_for_yourself-FULL \
      ~/.codex/skills/ip_illustration_for_yourself
```

### Hermes

```bash
# The update advanced upstream 00140a85 -> 485aaf69 (43 commits).
# To move back (only if truly needed):
git -C ~/.hermes/hermes-agent log --oneline -n 5
# Hermes manages its own checkout; prefer `hermes gateway restart` over manual edits.
```

### Services

```bash
launchctl kickstart -k gui/$(id -u)/ai.fcc.server
launchctl bootout   gui/$(id -u) ~/Library/LaunchAgents/ai.fcc.server.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.fcc.server.plist
```

---

## 22. Backups Created

All backups from this pass live under the working directory used for the session:

```text
~/dsh/fcc-backups-20260906-235410/
├── fcc-env.bak-20260906-235410                 # ~/.fcc/.env (models + settings, pre-change)
├── aider-3.9-removed/
│   ├── REMOVAL-RECORD.txt                      # what was removed, why, how to restore
│   └── aider.bin                               # ~/Library/Python/3.9/bin/aider launcher
├── opencode-nvm-removed/
│   └── REMOVAL-RECORD.txt                      # stale NVM copy + restore command + incident note
└── skills/
    ├── ian-xiaohei-illustrations.SKILL.md
    ├── ip-illustration-character-system.SKILL.md
    ├── ip_illustration_for_yourself.SKILL.md
    ├── ip_illustration_for_yourself-FULL/      # full tree incl. .git (38 MB)
    ├── firecrawl-build.SKILL.md
    └── firecrawl-monitor.SKILL.md
```

Also present (pre-existing, unrelated): `~/Library/LaunchAgents/*.plist.bak` copies in `~/GitHub/debug-runbooks/backups/2026-09-06_212700/` (FCC, FreeLLM, OmniRoute plists) — left untracked, not committed.

---

## 23. Secret Scan

Performed before documentation and commit, across the changed files, the runbook, and the repository working tree.

Patterns searched: `sk-` (and `sk-ant-`, `sk-proj-`, `sk-or-`, `sk-sp-`), `AIza`, `gsk_`, `hf_`, `xoxb-`, `ghp_`, `AKIA`, `Bearer `, `Authorization:`, `api[_-]?key`, `token`, `secret`, `password`, provider-specific prefixes.

```bash
# Scan the runbook and any file about to be committed
grep -n -E "sk-[A-Za-z0-9]{8,}|AIza[0-9A-Za-z_-]{10,}|gsk_[A-Za-z0-9]{10,}|hf_[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{10,}|xoxb-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{10,}|Bearer [A-Za-z0-9._-]{10,}|Authorization: [A-Za-z0-9._-]{10,}" <files>
```

**Result: clean.**

- No secret **values** appear in this runbook — only environment-variable **names**.
- FCC secrets stay in `~/.fcc/.env` (mode `0600`) and `~/.fcc/auth/` (mode `0700`), both outside the repository.
- The repository commit contains documentation only.
- Terminal output in this session was filtered with redaction before being used as evidence.

---

## 24. Final Known-Good State

```text
FCC                      5.21.0, LaunchAgent ai.fcc.server, 127.0.0.1:8082, healthy
FCC plist                valid (plutil -lint OK), KeepAlive + RunAtLoad, single process
FCC admin UI             http://127.0.0.1:8082/admin (loopback-only)
FCC proxy auth           PROXY_AUTH_ENABLED=false (loopback-only; documented)
MODEL                    open_router/anthropic/claude-fable-5.1
MODEL_FABLE              vercel/openai/gpt-6-astra-fast   (unchanged; Vercel currently 402)
MODEL_OPUS               gemini/models/gemini-3.8-flash   (unchanged)
MODEL_SONNET             tokenrouter/stealth/ox-alpha     (unchanged)
MODEL_HAIKU              huggingface/MiniMaxAI/MiniMax-M3 (unchanged)
MODEL_FALLBACKS          7 entries / 6 providers (whisper removed; see §11)
Native claude            2.1.251, Anthropic/Claude Pro, no ANTHROPIC_* overrides
OpenClaude               0.29.1, 127.0.0.1:20138/v1, silverMBN
OpenCode                 1.18.29 at ~/.local/bin/opencode (single install)
Aider                    0.86.2 pipx on Python 3.12.14 (3.9 launcher removed)
Hermes                   0.21.0, upstream 485aaf69, gateway running under launchd
Clients passing          claude, opencode, codex, aider, hermes, pi, dsh, muse, cline(CLI)
Skills                   4 warnings fixed and validated
```

---

## 25. AI / CLI Assistance

- **ChatGPT** — troubleshooting guidance and architecture review for the three-path isolation design, the FCC fallback semantics, and the change-control decisions.
- **DeepSeek Harness (dsh) 0.1.0-rc.8 running via `fcc-dsh`** — performed this final cleanup, hardening, validation, and documentation pass: isolation verification, FCC service checks, fallback-chain cleanup, duplicate-install removal, skill-format fixes, Hermes gateway recovery, the Cline check, the full client matrix, the secret scan, and the repository commit/push.
- **Hermes Agent v0.21.0** — its own update and gateway restart were executed by Hermes itself (`hermes update --yes`, `hermes gateway restart/start`).
- **Tools used for verification only:** `launchctl`, `plutil`, `lsof`, `curl`, `git`, `pipx`/`python3`, `npm`, `python3 -c` (YAML validation), `grep`.

---

*End of runbook.*
