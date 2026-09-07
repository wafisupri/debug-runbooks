# macOS Free Claude Code (FCC) — Multi-CLI Routing Runbook

**Date:** 2026-09-07 (final correction: 2026-09-08)
**Status:** Fixed / Verified / Final known-good
**Platform:** macOS (Apple Silicon / arm64), macOS 15.x (Darwin 25.6.0)
**Components:** Free Claude Code (FCC) 5.21.0, launchd, Claude Code 2.1.251, OpenClaude 0.29.1, OpenCode 1.18.29, Aider 0.86.2, Codex CLI 0.153.4, Cline CLI 3.0.60, Hermes 0.21.0, Pi 0.85.1, DeepSeek Harness (dsh) 0.1.0-rc.8, Muse 1.0.3

---

## 1. Purpose

Keep **three fully independent AI coding paths** on one macOS machine, so that using free/aggregated models never touches the paid Claude Pro subscription, and so that a failure in one path never contaminates the others:

```text
claude        -> native Anthropic / Claude Pro          (paid subscription path)
openclaude    -> 127.0.0.1:20138/v1 -> silverMBN        (OpenClaude + 9Router gateway)
fcc-*         -> 127.0.0.1:8082                         (Free Claude Code multi-provider router)
```

This is the final corrected record of the known-good state. It documents the three-path isolation, FCC LaunchAgent operation, **free-only routing**, the OpenRouter paid-credit incident, client compatibility, corrected troubleshooting lessons, backups, rollback, and security boundaries.

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
 (Claude Pro OAuth)       (OpenClaude gateway,      (FCC LaunchAgent
                           silverMBN)                 ai.fcc.server)
                                                            |
                                                     free-only routing
                                                     TokenRouter + explicit
                                                     OpenRouter :free models
```

**Key property:** no shared credential, endpoint, or configuration file between the three paths. Native Claude and OpenClaude were not changed by FCC work.

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

> **Removed-provider history (verified):** Vercel returned HTTP 402 (no credits / payment required); Hugging Face returned HTTP 402 after monthly inference credits were depleted; OpenCode Zen returned HTTP 401 because no payment method was configured; and Groq `qwen/qwen3.8-27b` returned HTTP 413 because coding clients commonly sent roughly 13k–38k input tokens against an input-token-per-minute limit around 7,000. These are not current FCC candidates. Groq is unsuitable as a general FCC fallback for these client prompt sizes.

---

## 9. Final Free-Only Model Routing

Record the current known-good tier mappings exactly:

```text
MODEL=tokenrouter/z-ai/glm-5.3-free
MODEL_FABLE=open_router/nvidia/nemotron-3-ultra-550b-a55b:free
MODEL_OPUS=open_router/google/gemma-4-31b-it:free
MODEL_SONNET=open_router/liquid/lfm-2.5-2.6b:free
MODEL_HAIKU=open_router/poolside/laguna-s-2.1:free
```

These values were read from `~/.fcc/.env` after the final correction. Do not change them merely to chase a different model or a faster response.

---

## 10. Tier Mappings and Free-Only Policy

FCC maps Claude-compatible tier requests to the five settings above. The default and every tier now resolve to either TokenRouter free routing or explicit OpenRouter free variants.

**Do not reintroduce paid OpenRouter routes unless intentionally approved.** Review model IDs before applying configuration changes, and treat `open_router/<model>` as paid unless the ID explicitly ends with `:free` or is `openrouter/free`.

---

## 11. Final Fallback Chain

```text
open_router/openrouter/free
open_router/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
open_router/thinkingmachines/inkling:free
open_router/cohere/north-mini-code:free
open_router/dots-studio/dots-3-note-preview:free
open_router/inclusionai/ling-3.0-flash-sante:free
```

The chain is intentionally explicit and free-only. Earlier fallback history included a larger paid/mixed-provider chain and an audio transcription model (`groq/whisper-large-v3-turbo`), which was removed because it was not a general coding/chat fallback.

### Provider failure history

| Removed route/provider | Failure | Lesson |
|---|---|---|
| Vercel | HTTP 402 | No credits / payment required |
| Hugging Face | HTTP 402 | Monthly inference credits depleted |
| OpenCode Zen | HTTP 401 | No payment method |
| Groq `qwen/qwen3.8-27b` | HTTP 413 | ~7,000 input-token-per-minute limit versus ~13k–38k-token coding prompts; unsuitable as a general fallback |
| Paid OpenRouter standard variants | unexpected credit consumption | Use explicit `:free` IDs or `openrouter/free` only |

### Applying model changes safely

Model changes are visible without an FCC restart, but this final configuration should remain unchanged unless a deliberate routing review approves a change. Read current config only through the loopback admin UI/API, which masks credential values. Never paste credentials into commands, logs, screenshots, or this repository.

---

## 12. Client Compatibility Matrix

Verified final client state:

| Client | Status | Version / path | Verified model or behavior |
|---|---|---|---|
| `fcc-claude` | ✅ Working | Claude Code 2.1.251 | Tested successfully from `~/fcc-smoke-test` |
| `fcc-codex` | ✅ Working | Codex CLI 0.153.4 | Answered through `tokenrouter/z-ai/glm-5.3-free` |
| `fcc-opencode` | ✅ Working | OpenCode 1.18.29 | Answered through `tokenrouter/z-ai/glm-5.3-free` |
| `fcc-aider` | ✅ Working | Aider 0.86.2 | pipx-managed on Python 3.12 |
| `fcc-hermes` | ✅ Working | Hermes 0.21.0 | Upgraded; gateway repaired and restarted |
| `fcc-pi` | ✅ Working | Pi 0.85.1 | Routed through FCC |
| `fcc-dsh` | ✅ Working | DeepSeek Harness 0.1.0-rc.8 | Browser/web Harness; web UI listens on `127.0.0.1:3080` when launched |
| `fcc-muse` | ✅ Working | Muse 1.0.3 | Routed through FCC |
| `fcc-cline` | ✅ Working CLI | Cline CLI 3.0.60 | Later FCC Cline CLI smoke test succeeded; see §18 |
| `claude` native | ✅ Untouched | Claude Code 2.1.251 | Normal Anthropic / Claude Pro |
| `openclaude` | ✅ Untouched | OpenClaude 0.29.1 | `127.0.0.1:20138/v1`, `silverMBN` |

---

## 13. OpenRouter Paid-Credit Incident

This incident is the central correction to the original routing assumption.

FCC/OpenRouter routing was expected to be free-only, but some routes were standard paid variants. Observed examples included:

```text
open_router/anthropic/claude-fable-5.1
open_router/openai/gpt-6-astra-pro
```

Those IDs are not free merely because they use the OpenRouter provider. Some earlier requests consumed paid OpenRouter credit. No balances, account IDs, billing identifiers, or keys are recorded here.

The fix replaced those routes with explicit free-only IDs ending in `:free`, or with `openrouter/free`. Do not reintroduce a paid OpenRouter standard variant without explicit approval.

---

## 14. Why `:free` Matters

- `open_router/<model>` alone does **not** automatically mean free.
- For zero-cost OpenRouter usage, use an explicit `:free` variant or `openrouter/free`.
- Treat missing `:free` as a paid route until the provider catalogue proves otherwise.
- Audit both tier mappings and every fallback entry; a single paid fallback can reintroduce the incident.

---

## 15. OpenCode Path and Version History

A stale NVM OpenCode 1.18.15 install shadowed by the active `~/.local/bin/opencode` 1.18.29 was removed. An initial uninstall used the wrong npm prefix and briefly removed the active install; it was reinstalled with the user's normal `~/.local` npm prefix. Final state:

```text
which -a opencode -> ~/.local/bin/opencode
opencode --version -> 1.18.29
~/.nvm/.../bin/opencode -> absent
```

Lesson: with multiple npm roots, pin `npm --prefix` explicitly for install and uninstall operations.

---

## 16. Aider pipx / Python 3.12 Migration

The stale Python 3.9 Aider launcher was removed after backup; the shared 3.9 site-packages tree was intentionally left intact because other tools depended on it. Final state:

```text
which -a aider -> ~/.local/bin/aider
aider --version -> aider 0.86.2
pipx venv Python -> 3.12
```

Maintain it with `pipx upgrade aider-chat` or `pipx reinstall aider-chat`.

---

## 17. Hermes Upgrade and Restart

Hermes was upgraded, its stale gateway definition was refreshed, and the gateway was restarted. Final checks showed the launchd job running, a valid plist, a current service definition, and removal of the pending-restart marker. Non-FCC Hermes configuration, authentication, channels, and cron were not disturbed.

---

## 18. Corrected Cline Status

The final supported result is: **FCC Cline CLI works.**

Earlier compatibility testing produced conflicting behavior: one extension-oriented check surfaced an API-key validation error, but a later FCC Cline CLI smoke test completed successfully. That earlier result must not be documented as a blanket current Cline failure.

No workaround was applied to ordinary Cline configuration, and no ordinary Cline settings were modified by this FCC work.

---

## 19. Claude Shared Model-Pin Issue

During testing, `/model` persisted `groq/qwen/qwen3.8-27b` as the top-level `.model` field in `~/.claude/settings.json`. Later `fcc-claude` sessions then started with that model.

The fix:

1. Back up `~/.claude/settings.json`.
2. Delete only the top-level `.model` field.
3. Preserve `modelSettings`, `env.API_TIMEOUT_MS`, `hooks`, `permissions`, `plugins`, `statusLine`, and unrelated Claude settings.
4. Verify a fresh FCC session no longer inherits the stale pin.

Do not permanently save FCC test models in shared Claude settings.

---

## 20. Clean Workspace Smoke-Test Pattern

Running `fcc-claude` from `$HOME` could fail with:

```text
Request too large (max 32MB)
```

Cause: historical images, attachments, and session baggage accumulated in the home workspace. Use a clean directory:

```bash
mkdir -p ~/fcc-smoke-test
cd ~/fcc-smoke-test
fcc-claude
```

This resolved the request-size failure.

---

## 21. FCC Restart Health-Wait Pattern

After a kickstart, FCC may take around 8 seconds to become healthy. A fixed 2–3 second sleep is not reliable. Use:

```bash
launchctl kickstart -k gui/$(id -u)/ai.fcc.server

for i in {1..20}; do
  if curl -fsS http://127.0.0.1:8082/health >/dev/null 2>&1; then
    echo "FCC healthy after ${i}s"
    curl -fsS http://127.0.0.1:8082/health
    echo
    break
  fi
  sleep 1
done
```

Do not start a second server while the LaunchAgent owns port 8082.

---

## 22. Skill Warning Fixes

Four skill-format warnings were repaired after backups:

- Missing YAML frontmatter for `ian-xiaohei-illustrations`.
- Duplicate skill ID `ip-illustration-character-system`; the canonical directory was kept.
- Malformed YAML in `firecrawl-build` caused by unquoted `": "` sequences.
- Over-long `firecrawl-monitor` description (1,069 characters; reduced to 956).

Each repaired `SKILL.md` was validated with a YAML parser. The duplicate-directory repair was backed up as a full tree, including its `.git` directory. Lesson: parse the pristine backup rather than manually slicing YAML block scalars.

---

## 23. DSH Web Behavior

`fcc-dsh` is a browser/web Harness path. When launched, its web UI listens on loopback only:

```text
http://127.0.0.1:3080
```

A manual DSH process currently owns port 3080. Do not start a second DSH instance against the same port.

---

## 24. DSH LaunchAgent Prepared State

A separate LaunchAgent plist was prepared:

```text
~/Library/LaunchAgents/ai.fcc.dsh.plist
```

Design:

```text
Label             ai.fcc.dsh
ProgramArguments  ~/.local/bin/fcc-dsh --no-open
WorkingDirectory  /Users/wfspr
StandardOutPath   ~/Library/Logs/fcc-dsh.log
StandardErrorPath ~/Library/Logs/fcc-dsh.err.log
RunAtLoad         true
KeepAlive          true
```

It was intentionally **not bootstrapped** while a manually launched `fcc-dsh` already owned port 3080. Verification on 2026-09-08 found the plist valid but the service not loaded. Therefore its status is **prepared/pending**, not active. Do not call it active without checking `launchctl print gui/$(id -u)/ai.fcc.dsh`.

---

## 25. Cerebras Future Benchmark Note

A Cerebras-routed test responded in about 5 seconds, noticeably faster than several other free routes. That is a useful signal only. Future benchmarking should compare TTFT, coding quality, tool use, context handling, rate limits, free-tier stability, and reproducibility.

Do not change the current final routing because of one fast test.

---

## 26. Troubleshooting

### `Request too large (max 32MB)`

Use the clean `~/fcc-smoke-test` directory in §20.

### FCC not healthy after restart

Use the 20-second health-wait loop in §21; do not rely on a fixed short sleep.

### HTTP 402 from Vercel or Hugging Face

These provider routes were removed. Do not restore them without resolving billing/credits and explicit approval.

### HTTP 401 from OpenCode Zen

OpenCode Zen was removed because no payment method was configured.

### HTTP 413 from Groq

The model's input-token-per-minute ceiling was too low for typical coding prompts; it is not a suitable general FCC fallback.

### `PermissionError: ... ~/.fcc/config.lock`

A client sandbox is blocking FCC's config lock. Re-run with an appropriate file policy.

### `fcc-codex` outside a git repository

Use `--skip-git-repo-check` and redirect stdin from `/dev/null` for one-shot tests.

### `/v1/responses` streaming-only

Requests to `/v1/responses` must enable streaming.

---

## 27. Security Considerations

- FCC binds only to `127.0.0.1:8082`; do not expose it to LAN/WAN, SSH forwarding, `0.0.0.0`, or an unauthenticated reverse proxy.
- The admin endpoint is loopback-only.
- Do not commit `~/.fcc/.env`, `~/.fcc/auth/*`, client credentials, Authorization headers, passwords, tokens, or secret-bearing environment variables.
- Record provider/key **names**, never values.
- Keep native Claude and OpenClaude configuration isolated from FCC changes.
- Redact terminal output before using it as evidence.

---

## 28. Backups

Existing FCC work backups are under:

```text
~/dsh/fcc-backups-20260906-235410/
```

They include the pre-change FCC environment, Aider removal records, OpenCode removal records, and skill files/directories. The final documentation edit also backed up the two repository files under `/tmp/debug-runbooks-backups/` before changes; those temporary backups are not committed.

The untracked `backups/` directory in the repository predates this final correction and is not included in the commit.

---

## 29. Rollback

For FCC routing, restore the appropriate backed-up environment file and restart FCC, then use the health-wait loop. Do not roll back to paid OpenRouter standard variants; if a rollback source contains them, replace those entries with explicit free-only IDs before applying.

For skill changes, restore the corresponding file or full directory from `~/dsh/fcc-backups-20260906-235410/skills/`. For service-only problems, use `launchctl kickstart`, or bootout/bootstrap only when necessary. Always verify health afterward.

---

## 30. Final Known-Good State

```text
Native claude           normal Anthropic / Claude Pro; untouched
OpenClaude              custom gateway; 127.0.0.1:20138/v1; silverMBN; untouched
FCC service             LaunchAgent ai.fcc.server
FCC server              ~/.local/bin/fcc-server
FCC bind                127.0.0.1:8082
FCC admin               http://127.0.0.1:8082/admin
FCC health              http://127.0.0.1:8082/health
MODEL                   tokenrouter/z-ai/glm-5.3-free
MODEL_FABLE             open_router/nvidia/nemotron-3-ultra-550b-a55b:free
MODEL_OPUS              open_router/google/gemma-4-31b-it:free
MODEL_SONNET            open_router/liquid/lfm-2.5-2.6b:free
MODEL_HAIKU             open_router/poolside/laguna-s-2.1:free
Fallbacks               6 explicit free-only OpenRouter entries (see §11)
FCC clients             claude, codex, opencode, aider, hermes, pi, dsh, muse, cline(CLI) verified
OpenCode                one install at ~/.local/bin/opencode, 1.18.29
Aider                   0.86.2 via pipx on Python 3.12
Hermes                  upgraded and gateway running
DSH web UI              127.0.0.1:3080 when manually launched
DSH LaunchAgent         prepared/pending; not loaded
```

---

## 31. AI / CLI Assistance

Only tools actually used are credited:

- **ChatGPT** — troubleshooting guidance, architecture review, and routing diagnosis.
- **DeepSeek Harness via `fcc-dsh`** — cleanup, validation, skill repairs, Hermes repair, initial runbook creation/update, and Git work.
- **OpenAI Codex via `fcc-codex`** — final runbook correction and final repository validation.

---

*End of runbook.*
