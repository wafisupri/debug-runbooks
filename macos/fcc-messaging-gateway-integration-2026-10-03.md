# FreeClaudeCode (FCC) Messaging Gateway Integration — Telegram → OpenClaw and WhatsApp → Hermes

**Date:** 2026-10-03

**Status:** Fixed / Verified

**Platform:** macOS (Apple Silicon / arm64)

**Scope:** Routing two persistent messaging gateways through a local FreeClaudeCode (FCC) service — Telegram via the OpenClaw Gateway and WhatsApp via the Hermes Gateway — without disturbing the existing provider configuration of either system.

---

## 1. Summary

The goal was to make two long-running messaging agents answer through the local FreeClaudeCode (FCC) service on `127.0.0.1:8082` instead of their existing upstream routers:

```text
Telegram → OpenClaw Gateway → FCC
WhatsApp → Hermes Gateway   → FCC
```

FCC itself was already installed, supervised by launchd, and healthy on port 8082. Both messaging systems were already connected to their respective platforms and working — the task was purely to change the model transport of each **persistent gateway**, not to install or repair the gateways.

Two things made this harder than a normal provider swap:

1. **The CLI wrapper is not the service.** Running `fcc-hermes` or an FCC-capable `openclaw` CLI invocation only affects that one process. It does **not** reconfigure a Gateway that is already running under launchd and serving Telegram or WhatsApp.
2. **FCC's working transport is the Anthropic Messages shape, not OpenAI Chat Completions.** Both gateways initially assumed an OpenAI-compatible endpoint, which produced wrong transport assumptions and 404s rather than auth errors.

After correcting the transport, registering FCC in each gateway's own configuration, adding FCC to OpenClaw's model allowlist, and restarting both gateways, both paths were functionally tested by the operator:

```text
Telegram → OpenClaw → FCC ✅
WhatsApp → Hermes → FCC ✅
```

A third path — OhMyPi (`omp`) → FCC — was attempted and is **not** working; its `404 {"detail":"Not Found"}` failure is documented separately in [OhMyPi FCC provider returns 404 — transport mismatch](omp-fcc-provider-404-transport-mismatch-2026-10-03.md) so it cannot be confused with the two verified integrations.

---

## 2. Environment

- **Operating system:** macOS on Apple Silicon (arm64), zsh
- **User binaries:** `~/.local/bin`
- **Node runtime:** managed through NVM; Homebrew also available
- **FCC service:** `free-claude-code 5.21.0`, listening on `127.0.0.1:8082`
- **FCC install:** `~/.local/share/uv/tools/free-claude-code` (uv tool)
- **FCC config:** `~/.fcc/.env` (managed by FCC; edited through the loopback admin UI where possible)
- **FCC wrappers:** `~/.local/bin/fcc-*`
- **OpenClaw:** `OpenClaw 2026.9.7 (c074824)`
- **OpenClaw CLI:** `~/.nvm/versions/node/v24.18.1/bin/openclaw` and `~/.local/bin/openclaw`
- **OpenClaw config:** `~/.openclaw/openclaw.json`
- **OpenClaw Desktop:** `/Applications/OpenClaw.app`
- **Hermes Agent:** `~/.local/bin/hermes`, config `~/.hermes/config.yaml`
- **OhMyPi (separate product):** `/opt/homebrew/bin/omp` — `omp/18.4.12`
- **Pi (separate product):** `~/.local/bin/pi`
- **Relevant ports:** FCC `8082`; OpenClaw Gateway `18789` (loopback)

Confirmed FCC launcher wrappers present at the time of this session:

```text
fcc-aider   fcc-claude  fcc-cline   fcc-codex  fcc-desktop  fcc-dsh
fcc-grok    fcc-hermes  fcc-muse    fcc-omp    fcc-opencode fcc-pi
fcc-server
```

`fcc-omp` is a distinct wrapper from `fcc-pi`: Pi and OhMyPi are different products with different installs. `fcc-pi` ships with FCC; `fcc-omp` is a local wrapper that only exports a placeholder key before exec'ing `/opt/homebrew/bin/omp`.

---

## 3. Architecture

### Verified end state

```text
Telegram
   │
   ▼
OpenClaw Gateway            (launchd: ai.openclaw.gateway)
   │
   ▼
FCC provider                 (api: anthropic-messages)
   │
   ▼
127.0.0.1:8082
   │
   ▼
FreeClaudeCode               (free-claude-code 5.21.0)
   │
   ▼
Configured FCC upstream models
```

```text
WhatsApp
   │
   ▼
Hermes Gateway               (launchd: ai.hermes.gateway)
   │
   ▼
FCC custom provider          (api_mode: anthropic_messages)
   │
   ▼
127.0.0.1:8082
   │
   ▼
FreeClaudeCode               (free-claude-code 5.21.0)
   │
   ▼
Configured FCC upstream models
```

### The distinction that mattered most

```text
fcc-hermes                  → affects only the Hermes process it launches
fcc-capable openclaw CLI    → affects only that CLI process

ai.hermes.gateway  (launchd) → serves WhatsApp; reads ~/.hermes/config.yaml
ai.openclaw.gateway (launchd) → serves Telegram; reads ~/.openclaw/openclaw.json
```

A wrapper mutates the environment of a single child process. A Gateway is a long-lived launchd service that loads its own configuration at start. **Persistent messaging integrations must be changed in the service's own configuration or environment, then the service must be restarted.** Wrapper-based testing proves the FCC endpoint works; it does not prove the Gateway was changed.

### OpenClaw CLI is not duplicated

```text
~/.local/bin/openclaw
~/.nvm/versions/node/v24.18.1/bin/openclaw
```

Both are symlinks that resolve to the **same** Node module:

```text
~/.nvm/versions/node/v24.18.1/lib/node_modules/openclaw/openclaw.mjs
```

There was no second, independent OpenClaw install to reconcile.

---

## 4. Symptoms

- The Telegram agent answered through an existing upstream provider instead of FCC, even after FCC had been added as an OpenClaw provider.
- The WhatsApp agent answered through the pre-existing local routing setup at `127.0.0.1:20128/v1` instead of FCC, regardless of running `fcc-hermes` by hand.
- When FCC was configured as a generic OpenAI-compatible Chat Completions provider, requests failed with a bare not-found response rather than an authentication or quota error:

```text
404 {"detail":"Not Found"}
```

- `openclaw models status` showed the default model resolving to a non-FCC provider, meaning the FCC entry existed but was never selected.

---

## 5. Root Cause

Three independent causes, all of which had to be fixed:

### 5.1 Wrong transport

FCC exposes the Claude-style **Anthropic Messages** endpoint that its wrappers use. It does **not** serve the OpenAI Chat Completions path. Both gateways were initially pointed at FCC as though it were an OpenAI-compatible provider:

```text
api: openai-completions      ← incorrect for the OpenClaw/FCC path
```

The corrected transport is:

```text
api: anthropic-messages
```

This is verifiable directly against the running service (§9): the Anthropic-shaped route answers, the OpenAI-shaped route does not.

### 5.2 Provider registered ≠ model allowed

Registering the FCC provider in OpenClaw was not sufficient. OpenClaw enforces an explicit model allowlist (model policy). Until the FCC model was added to that allow set, OpenClaw would not select it, so the gateway silently stayed on its previous provider.

### 5.3 Service configuration vs. wrapper process

The gateways serving Telegram and WhatsApp are launchd services. They read `~/.openclaw/openclaw.json` and `~/.hermes/config.yaml` at start. Changing a wrapper or an environment variable in a shell does not reach an already-running service. Both services had to be changed in their own configuration and then restarted.

---

## 6. What Did Not Work

| Attempt | Outcome | Why it failed |
|---|---|---|
| Running `fcc-hermes` to "switch Hermes to FCC" | WhatsApp agent unchanged | The wrapper only affects that process; the WhatsApp Gateway is a separate launchd service |
| An FCC-capable `openclaw` CLI invocation | Telegram agent unchanged | Same reason — the persistent Gateway was untouched |
| Registering FCC as `api: openai-completions` | `404 {"detail":"Not Found"}` | Wrong transport; FCC serves the Anthropic Messages shape |
| Registering the FCC provider only | Provider present, still not selected | OpenClaw's model allowlist excluded the FCC model |
| Assuming `fcc-pi` covers OhMyPi | No effect on `omp` | `fcc-pi != fcc-omp`; Pi and OhMyPi are different products |

### Pitfall: Markdown-link form pasted into configuration

At one stage the base URL was accidentally written into configuration in rendered-Markdown form:

```text
[http://127.0.0.1:8082](http://127.0.0.1:8082)
```

instead of the literal URL:

```text
http://127.0.0.1:8082
```

Configuration values must contain the literal URL. Link syntax is a documentation artifact; a config parser will treat it as a literal string and fail to connect.

### Pitfall: shell pipeline and heredoc fighting over stdin

A diagnostic that tried to feed a heredoc into `python3` while a `curl` pipe was already supplying stdin failed with a Python `SyntaxError`:

```bash
curl -fsS http://127.0.0.1:8082/v1/models | python3 - <<'PY'
import json, sys
print(len(json.load(sys.stdin)["data"]))
PY
```

The FCC endpoint was not the problem — the shell was. Both the pipeline and the heredoc claimed stdin. Use one of:

```bash
# Option A: inline program, no stdin competition
curl -fsS http://127.0.0.1:8082/v1/models | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["data"]))'

# Option B: save first, then parse separately
curl -fsS http://127.0.0.1:8082/v1/models -o /tmp/fcc-models.json
python3 -c 'import json; print(len(json.load(open("/tmp/fcc-models.json"))["data"]))'
```

---

## 7. Final Fix

### 7.1 OpenClaw (Telegram)

FCC was registered as an Anthropic Messages provider, preserving all existing providers. Conceptually:

```json
{
  "baseUrl": "http://127.0.0.1:8082",
  "api": "anthropic-messages",
  "authHeader": true,
  "models": [
    {
      "id": "anthropic/tokenrouter/z-ai/glm-5.3-free",
      "name": "FCC — anthropic/tokenrouter/z-ai/glm-5.3-free",
      "reasoning": true,
      "input": ["text"],
      "contextWindow": 128000,
      "maxTokens": 16384
    }
  ]
}
```

A local FCC placeholder credential was used for the loopback proxy. **No real key value is recorded here.**

The existing OpenClaw providers — `9router`, `bai`, `groq`, `omniroute`, `ollama`, `cohere`, OpenRouter, OpenAI and others — were **preserved, not replaced**. The FCC entry was added alongside them.

Because OpenClaw enforces a model allowlist, the FCC model was also added to the allowed set:

```text
fcc/anthropic/tokenrouter/z-ai/glm-5.3-free
```

The OpenClaw default model was then set explicitly to that same ID. The `main` agent entry was left with no agent-level fallbacks, so the agent runs in strict FCC mode rather than silently failing over to another provider.

After the change the OpenClaw Gateway was restarted and the Telegram session was reset to its configured default model. The operator then tested from Telegram.

### 7.2 Hermes (WhatsApp)

The Hermes model section was changed so the **persistent Gateway** uses FCC directly. The prior configuration pointed at a different local router:

```yaml
# before
model:
  provider: custom:[local-(:20138)]
  default: auto/best-free
  base_url: http://127.0.0.1:20128/v1
  api_mode: chat_completions
```

The resulting configuration:

```yaml
# after
model:
  provider: custom
  default: anthropic/tokenrouter/z-ai/glm-5.3-free
  base_url: http://127.0.0.1:8082
  api_mode: anthropic_messages
  api_key: <local FCC placeholder / secret reference>
```

The configuration file was **backed up before modification** (§10). The Hermes Gateway was then restarted. Because the WhatsApp integration is served by that persistent Gateway, the WhatsApp agent inherited the FCC model. The operator tested from WhatsApp.

---

## 8. Commands

### Confirm FCC is up before touching either gateway

```bash
# Ground truth for the FCC listener
lsof -nP -iTCP:8082 -sTCP:LISTEN

# Health
curl -fsS http://127.0.0.1:8082/health
```

### OpenClaw: inspect, then restart

```bash
# Resolved default model only — prints no credentials
openclaw models status --plain

# Default / fallbacks / allowlist only (auth section filtered out)
openclaw models status | sed -n '/^Default/p;/^Fallbacks/p;/^Allowed models/p'

# Restart the Gateway service that serves Telegram
openclaw gateway restart
```

### Hermes: restart the Gateway that serves WhatsApp

```bash
# CLI path
hermes gateway restart

# launchd path (use when the CLI reports a stale service state; see §13)
launchctl kickstart -k gui/$(id -u)/ai.hermes.gateway
```

### Back up before editing either config

```bash
# Timestamped backups, created before any edit
cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.pre-fcc-$(date +%Y%m%d-%H%M%S)
cp ~/.hermes/config.yaml    ~/.hermes/config.yaml.pre-fcc-$(date +%Y%m%d-%H%M%S)
```

---

## 9. Verification

### FCC transport — the decisive check

This is the check that proves *why* the OpenClaw/Hermes configuration works and the OhMyPi configuration does not. It prints HTTP status codes only, never response bodies.

```bash
curl -s -o /dev/null -w 'POST /v1/messages        -> %{http_code}\n' \
  -X POST http://127.0.0.1:8082/v1/messages \
  -H 'content-type: application/json' \
  -d '{"model":"anthropic/tokenrouter/z-ai/glm-5.3-free","max_tokens":16,"messages":[{"role":"user","content":"hi"}]}'

curl -s -o /dev/null -w 'POST /v1/chat/completions -> %{http_code}\n' \
  -X POST http://127.0.0.1:8082/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"anthropic/tokenrouter/z-ai/glm-5.3-free","max_tokens":16,"messages":[{"role":"user","content":"hi"}]}'
```

Expected result:

```text
POST /v1/messages        -> 200
POST /v1/chat/completions -> 404
```

The Anthropic Messages shape is served; the OpenAI Chat Completions shape is not. This is exactly why `api: anthropic-messages` / `api_mode: anthropic_messages` is required.

### FCC model catalogue is reachable

```bash
curl -fsS http://127.0.0.1:8082/v1/models \
  | python3 -c 'import json,sys; d=json.load(sys.stdin)["data"]; print("models:", len(d)); print(d[0]["id"])'
```

Expected result (count varies with FCC routing config):

```text
models: 3246
anthropic/tokenrouter/z-ai/glm-5.3-free
```

> **Important:** a successful `/v1/models` listing proves only that model *discovery* works. It does **not** prove the client is using the correct request transport. OhMyPi discovered FCC models successfully and still failed every request (§13).

### OpenClaw default model

```bash
openclaw models status --plain
```

Expected result:

```text
fcc/anthropic/tokenrouter/z-ai/glm-5.3-free
```

Filtered status view:

```bash
openclaw models status | sed -n '/^Default/p;/^Fallbacks/p;/^Allowed models/p'
```

Observed:

```text
Default       : fcc/anthropic/tokenrouter/z-ai/glm-5.3-free
Fallbacks (2) : omniroute/free-stack, openrouter/free
Allowed models (27): … fcc/anthropic/tokenrouter/z-ai/glm-5.3-free …
```

The global default retains two fallbacks, while the `main` agent entry resolves to:

```text
primary   : fcc/anthropic/tokenrouter/z-ai/glm-5.3-free
fallbacks : []          # 0 agent-level fallbacks
```

The operator observed the agent-level view as `Default (agent): fcc/anthropic/tokenrouter/z-ai/glm-5.3-free` with `Fallbacks (0) (agent): -`, which is consistent with the `main` entry having no agent-level fallbacks. The agent therefore operates in strict FCC mode.

### Gateway services are running

```bash
launchctl print gui/$(id -u)/ai.openclaw.gateway | sed -n '1,6p'
launchctl print gui/$(id -u)/ai.hermes.gateway   | sed -n '1,6p'
launchctl print gui/$(id -u)/ai.fcc.server       | sed -n '1,6p'
```

Expected result (each):

```text
state = running
```

### Functional verification

| Path | Method | Result |
|---|---|---|
| Telegram → OpenClaw → FCC | Operator sent a message to the Telegram bot after gateway restart and Telegram session reset | ✅ Confirmed working by the operator |
| WhatsApp → Hermes → FCC | Operator sent a message to the WhatsApp agent after gateway restart | ✅ Confirmed working by the operator |

Both confirmations came from the operator; the messaging platforms themselves were not exercised by the documentation tooling.

---

## 10. Rollback

Both systems can be reverted independently. Each was backed up immediately before editing, with a timestamped filename.

### OpenClaw (Telegram)

```bash
# 1. List the available pre-change backups
ls -l ~/.openclaw/openclaw.json.pre-fcc-*

# 2. Restore (filename confirmed on this host)
cp ~/.openclaw/openclaw.json.pre-fcc-20261003-050234 ~/.openclaw/openclaw.json

# 3. Restart the Gateway that serves Telegram
openclaw gateway restart

# 4. Verify
openclaw models status --plain
```

The backup created for this session was:

```text
~/.openclaw/openclaw.json.pre-fcc-20261003-050234
```

### Hermes (WhatsApp)

```bash
# 1. List the available pre-change backups
ls -l ~/.hermes/config.yaml.pre-fcc-*

# 2. Restore (filename confirmed on this host)
cp ~/.hermes/config.yaml.pre-fcc-20261003-063514 ~/.hermes/config.yaml

# 3. Restart the Gateway that serves WhatsApp
hermes gateway restart

# 4. Verify
launchctl print gui/$(id -u)/ai.hermes.gateway | sed -n '1,6p'
```

The backup created for this session was:

```text
~/.hermes/config.yaml.pre-fcc-20261003-063514
```

### Notes

- Restoring only one side leaves the other integration on FCC. Roll back both only if FCC itself is the problem.
- The timestamps above were read from the host, not invented. On a different machine, use the timestamp of the backup that actually exists.
- FCC itself needed no rollback: no FCC-side configuration was changed for this work.
- Prefer `openclaw gateway restart` / `hermes gateway restart`. Fall back to `launchctl kickstart -k gui/$(id -u)/<label>` only if the CLI path reports a stale service state.

---

## 11. Security Considerations

- FCC binds to loopback only (`127.0.0.1:8082`). Do not expose it to the LAN/WAN, `0.0.0.0`, SSH forwarding, or an unauthenticated reverse proxy.
- Both gateways reach FCC over loopback. Keep it that way — this integration adds no new listening surface.
- **Never commit:** `~/.fcc/.env`, `~/.openclaw/openclaw.json`, `~/.hermes/config.yaml`, provider keys, Authorization headers, Telegram bot tokens, WhatsApp session material, or any `sk-*` style secret.
- The FCC credentials used by both gateways are **local placeholders** for the loopback proxy. They are documented here only as `<local FCC placeholder / secret reference>`; the real values live in the respective config files.
- Credential-bearing config files should stay at `0600` and remain outside the repository.
- Commands in this runbook are written to be **secret-safe by construction**:
  - `openclaw models status --plain` prints only the resolved model ID.
  - The filtered `models status` command uses `sed` to emit only the `Default`, `Fallbacks` and `Allowed models` lines, dropping the auth-overview section entirely.
  - The transport check uses `curl -o /dev/null -w '%{http_code}'`, so no response body is ever printed.
  - No command requires the operator to redact output by hand.
- Keep the existing OpenClaw provider credentials untouched. This work added a provider; it did not rotate or remove any.

---

## 12. Lessons Learned

1. **A CLI wrapper is not a service.** `fcc-hermes` proves the FCC endpoint works for one process. It does nothing to a launchd Gateway already serving WhatsApp. Change the service's own config, then restart the service.
2. **Transport shape matters more than provider registration.** "OpenAI-compatible" is not a single thing. FCC serves the Anthropic Messages shape; a client configured for Chat Completions will get a bare 404, which looks like a routing bug but is a protocol mismatch.
3. **A 404 on a model request is a transport symptom, not a missing model.** The model existed and was listed by `/v1/models`. The *request shape* was wrong.
4. **Registering a provider is not the same as allowing a model.** OpenClaw's allowlist is a separate gate. Adding a provider without adding its model to the allowlist changes nothing visible.
5. **`/v1/models` success proves discovery, not request compatibility.** Model listing can succeed over one transport while inference fails over another.
6. **Distinguish products with similar names.** `fcc-pi != fcc-omp`; Pi and OhMyPi are separate installs (`~/.local/bin/pi` vs `/opt/homebrew/bin/omp`).
7. **Watch for rendered-Markdown leaking into config.** `[http://127.0.0.1:8082](http://127.0.0.1:8082)` is not a URL. Paste literal values into configuration files.
8. **One stdin consumer per pipeline.** `curl … | python3 - <<'PY'` gives stdin to both the pipe and the heredoc. Use `python3 -c '…'`, or write the JSON to a file first.
9. **Trust `launchctl print` over CLI status summaries.** Service-state detection in a CLI wrapper can disagree with launchd's own view (see §13).

---

## 13. Known Limitations

### OhMyPi → FCC is **not** working

A third path was attempted and left unresolved. An FCC provider is exposed inside OhMyPi and FCC models are visible there, including models under the `fcc` provider — but OhMyPi requests return:

```text
404 {"detail":"Not Found"}
```

for several FCC-selected models. This is the same transport mismatch described in §5.1: OhMyPi's FCC provider is configured for the OpenAI Chat Completions shape, while FCC serves the Anthropic Messages shape. Model discovery succeeding through `/v1/models` masked the problem.

**OhMyPi → FCC must not be documented as successful.** It is recorded separately in [OhMyPi FCC provider returns 404 — transport mismatch](omp-fcc-provider-404-transport-mismatch-2026-10-03.md) and is explicitly out of scope for the two verified integrations above.

### `hermes gateway status` may report a stale service state

`hermes gateway status` was observed reporting that the gateway service is "not loaded" while `launchctl print gui/$(id -u)/ai.hermes.gateway` showed the job `state = running` with a live PID and a valid service definition. The launchd job is the ground truth for whether WhatsApp is being served. Use `launchctl print` to confirm, and `launchctl kickstart -k` if a restart must be forced.

### Scope of verification

Functional confirmation for both integrations came from the operator sending real messages through Telegram and WhatsApp. Automated end-to-end message delivery was not exercised, and no platform credentials were inspected during documentation.

---

## 14. Final Working State

```text
Telegram → OpenClaw → FCC ✅
WhatsApp → Hermes → FCC ✅
OhMyPi   → FCC          ✗  (404 transport mismatch — documented separately)

FCC service             free-claude-code 5.21.0
FCC listener            127.0.0.1:8082 (loopback only)
FCC health              {"status":"healthy"}
FCC transport           Anthropic Messages  (POST /v1/messages → 200)
                        Chat Completions is not served (POST /v1/chat/completions → 404)

OpenClaw version        OpenClaw 2026.9.7 (c074824)
OpenClaw config         ~/.openclaw/openclaw.json
OpenClaw FCC provider   baseUrl http://127.0.0.1:8082, api anthropic-messages, authHeader true
OpenClaw FCC model      fcc/anthropic/tokenrouter/z-ai/glm-5.3-free  (in the model allowlist)
OpenClaw default model  fcc/anthropic/tokenrouter/z-ai/glm-5.3-free
OpenClaw main agent     primary FCC, agent-level fallbacks: 0
OpenClaw gateway        launchd ai.openclaw.gateway — running
OpenClaw channels       telegram
OpenClaw providers      existing providers preserved (9router, bai, groq, omniroute,
                        ollama, cohere, OpenRouter, OpenAI, …); FCC added alongside

Hermes config           ~/.hermes/config.yaml
Hermes model provider   custom
Hermes model default    anthropic/tokenrouter/z-ai/glm-5.3-free
Hermes base_url         http://127.0.0.1:8082
Hermes api_mode         anthropic_messages
Hermes api_key          local FCC placeholder (not recorded)
Hermes gateway          launchd ai.hermes.gateway — running
Hermes channel          WhatsApp

Backups                 ~/.openclaw/openclaw.json.pre-fcc-20261003-050234
                        ~/.hermes/config.yaml.pre-fcc-20261003-063514
```

---

## 15. Optional Cleanup

- Older pre-change backups (`openclaw.json.bak.1` … `.bak.4`, dated Hermes `.bak-*` files) predate this work and can be pruned once the new rollback points above are no longer needed. Keep at least the two `pre-fcc-*` backups.
- If the OhMyPi path is abandoned, its FCC provider entry in `~/.omp/agent/models.yml` can be removed to avoid confusing model listings. Do not remove it while the issue is still being investigated.
- No FCC-side cleanup is required — no FCC configuration was changed.

---

## 16. If This Happens Again

### Shortest diagnostic sequence

```bash
# 1. Is FCC up?
curl -fsS http://127.0.0.1:8082/health

# 2. Which transport does FCC actually serve?
curl -s -o /dev/null -w 'messages=%{http_code} ' -X POST http://127.0.0.1:8082/v1/messages \
  -H 'content-type: application/json' \
  -d '{"model":"anthropic/tokenrouter/z-ai/glm-5.3-free","max_tokens":8,"messages":[{"role":"user","content":"hi"}]}'
curl -s -o /dev/null -w 'chat=%{http_code}\n' -X POST http://127.0.0.1:8082/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"anthropic/tokenrouter/z-ai/glm-5.3-free","max_tokens":8,"messages":[{"role":"user","content":"hi"}]}'

# 3. What is OpenClaw actually resolving to?
openclaw models status --plain

# 4. Are both gateways running?
launchctl print gui/$(id -u)/ai.openclaw.gateway | sed -n '1,4p'
launchctl print gui/$(id -u)/ai.hermes.gateway   | sed -n '1,4p'
```

Expected: `messages=200 chat=404`, a `fcc/…` default model, and `state = running` for both jobs.

### Shortest recovery procedure

1. Confirm FCC health and the `messages=200 / chat=404` transport signature.
2. If the transport signature is wrong, FCC is not the problem you think it is — stop and inspect FCC itself.
3. If a gateway is not on FCC: verify the provider entry **and** (for OpenClaw) the model allowlist, then restart the gateway.
4. If a gateway is running but still on the old model, the config edit did not take effect — re-check the config file and restart again.
5. If a recent edit broke the gateway, restore the matching `pre-fcc-*` backup and restart.
6. Do not "fix" a 404 by adding more models. A 404 on an existing model is a transport-shape problem.

---

## 17. Credits

Troubleshooting and documentation assisted by:

- **ChatGPT — GPT-5.6 Sol** — troubleshooting guidance and architecture review.
- **WorkBuddy AI — DeepSeek-4.1-Flash** — repository inspection, live-state verification, and documentation.

Configuration changes, gateway restarts, and the Telegram/WhatsApp functional confirmations were performed by the operator. Neither assistant executed changes to the operator's systems.

---

*End of runbook.*
