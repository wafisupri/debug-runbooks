# OhMyPi (OMP) → FreeClaudeCode (FCC) — `404 {"detail":"Not Found"}` Transport Mismatch

**Date:** 2026-10-03

**Status:** Partial / Investigating

**Platform:** macOS (Apple Silicon / arm64)

**Scope:** OhMyPi (`omp`) can discover FCC models but every request to an FCC-selected model fails with `404 {"detail":"Not Found"}`. The FCC endpoint itself is healthy. This runbook is deliberately separate from the verified Telegram/OpenClaw and WhatsApp/Hermes integrations so the unresolved OMP path cannot be mistaken for a working one.

---

## 1. Summary

An FCC provider was added inside OhMyPi and FCC models became visible in OhMyPi's model catalogue, including models under the `fcc` provider. Despite that, requests to several FCC-selected models all failed:

```text
404 {"detail":"Not Found"}
```

The root cause is a **request-transport mismatch**, not a missing model and not an FCC outage. OhMyPi's FCC provider is declared as an OpenAI-compatible provider (`api: openai-completions`), so OhMyPi sends Chat Completions requests. FCC does not serve that shape — it serves the Claude-style **Anthropic Messages** shape. The Anthropic route answers; the OpenAI route returns the bare 404 that OhMyPi surfaces.

Model discovery succeeded because OhMyPi uses an OpenAI-style model-list probe (`openai-models-list`) against `/v1/models`, which FCC does serve. Discovery success masked the transport failure.

**This path is not fixed.** It is recorded as an open, partially-characterised issue.

---

## 2. Environment

- **Operating system:** macOS on Apple Silicon (arm64), zsh
- **OhMyPi:** `/opt/homebrew/bin/omp` — `omp/18.4.12`
- **OhMyPi provider config:** `~/.omp/agent/models.yml`
- **OhMyPi main config:** `~/.omp/agent/config.yml`
- **OhMyPi logs:** `~/.omp/logs/omp.<date>.<pid>.log` (JSON lines)
- **Pi (a different product):** `~/.local/bin/pi`
- **FCC wrapper for OMP:** `~/.local/bin/fcc-omp` (local wrapper, not shipped with FCC)
- **FCC service:** `free-claude-code 5.21.0` on `127.0.0.1:8082`

> `fcc-pi != fcc-omp`. Pi and OhMyPi are separate products with separate installs. `fcc-pi` ships with FCC; `fcc-omp` is a small local wrapper that exports a placeholder key and execs `/opt/homebrew/bin/omp`. Do not conflate them.

---

## 3. Architecture (attempted)

```text
OhMyPi (omp)
   │
   ▼
FCC provider  ── api: openai-completions  ──►  Chat Completions shape
   │
   ▼
http://127.0.0.1:8082/v1
   │
   ▼
FreeClaudeCode 5.21.0
   │
   ✗  /v1/chat/completions  → 404 {"detail":"Not Found"}
```

The intended shape, which the two verified integrations use, is:

```text
client  ── api: anthropic-messages ──►  /v1/messages  → 200
```

---

## 4. Symptoms

Every FCC-selected model in OhMyPi failed with the same bare 404. Distinct models observed failing in `~/.omp/logs/`:

```text
fcc/anthropic/vercel/xiaomi/mimo-v2.6-pro-ultraspeed
fcc/anthropic/vercel/moonshotai/kimi-k3-fast
fcc/anthropic/vercel/typesafe-ai/jev
fcc/anthropic/tokenrouter/openai/gpt-5.5
fcc/anthropic/nvidia_nim/01-ai/yi-large
```

Representative log lines:

```text
{"message":"title-generator: response error","provider":"fcc","id":"anthropic/vercel/xiaomi/mimo-v2.6-pro-ultraspeed","reason":"provider-response-error","stopReason":"error","errorMessage":"404 {\"detail\":\"Not Found\"}"}
{"message":"agent turn ended with provider error","provider":"fcc","model":"anthropic/vercel/moonshotai/kimi-k3-fast","errorMessage":"404 {\"detail\":\"Not Found\"}","errorStatus":404}
```

Across the captured logs there were **five** FCC provider-error events and **zero** successful FCC turns:

```text
successful FCC yields : 0
FCC provider errors   : 5
```

Meanwhile the FCC service reported healthy and the same models were reachable through other clients.

---

## 5. Root Cause

**OhMyPi's FCC provider is declared with the wrong transport shape.**

`~/.omp/agent/models.yml` (as configured at the time of this session):

```yaml
providers:
  fcc:
    baseUrl: http://127.0.0.1:8082/v1
    api: openai-completions
    apiKey: FCC_OMP_API_KEY
    authHeader: true
    discovery:
      type: openai-models-list
```

And `~/.omp/agent/config.yml` selected it as the default role:

```yaml
modelRoles:
  default: fcc/anthropic/vercel/typesafe-ai/jev
```

`api: openai-completions` makes OhMyPi send requests in the OpenAI Chat Completions shape. FCC does not serve that shape, so every inference request 404s.

This is confirmed directly against the running FCC service (§7): the Anthropic Messages route returns `200`, and the Chat Completions route returns `404`.

### Why the models still appeared

OhMyPi's `discovery.type: openai-models-list` probes `/v1/models`. FCC serves that route and returns a large catalogue (3,246 entries during this session), including every `anthropic/…` and `claude-3-freecc-no-thinking/…` variant. The picker therefore looked fully populated while every actual request failed.

**Model discovery is not transport compatibility.**

---

## 6. What Did Not Work

| Attempt | Outcome | Why |
|---|---|---|
| Relying on `/v1/models` discovery | Models listed, all requests 404 | Discovery uses a route FCC serves; inference uses a route it does not |
| Selecting a different FCC model | Same 404 for every model tried | The failure is in the request shape, not the model ID |
| Running `fcc-omp` | No change | The wrapper only exports `FCC_OMP_API_KEY` and execs `omp`; it does not alter the transport declared in `models.yml` |
| Assuming FCC was down | Incorrect | FCC was healthy; other clients answered through it |
| Assuming the model ID was wrong | Incorrect | The IDs are valid and were served to other clients |

---

## 7. Verification (current, partial)

### FCC is healthy

```bash
curl -fsS http://127.0.0.1:8082/health
```

Expected result:

```text
{"status":"healthy"}
```

### FCC serves the Anthropic Messages shape, not Chat Completions

Prints HTTP status codes only — no response bodies.

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

Observed result:

```text
POST /v1/messages        -> 200
POST /v1/chat/completions -> 404
```

This is the decisive evidence: the shape OhMyPi uses is the shape FCC does not serve.

### Model discovery succeeds (and is misleading)

```bash
curl -fsS http://127.0.0.1:8082/v1/models \
  | python3 -c 'import json,sys; d=json.load(sys.stdin)["data"]; print("models:", len(d))'
```

Observed result:

```text
models: 3246
```

A successful catalogue probe. It proves nothing about request compatibility.

---

## 8. Failed-Approach Detail: the shell pitfall

A first attempt to count models failed with a Python `SyntaxError` that had nothing to do with FCC:

```bash
# BROKEN: the pipe and the heredoc both claim stdin
curl -fsS http://127.0.0.1:8082/v1/models | python3 - <<'PY'
import json, sys
print(len(json.load(sys.stdin)["data"]))
PY
```

Correct patterns:

```bash
# Inline program — no stdin competition
curl -fsS http://127.0.0.1:8082/v1/models | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["data"]))'

# Or save first, parse separately
curl -fsS http://127.0.0.1:8082/v1/models -o /tmp/fcc-models.json
python3 -c 'import json; print(len(json.load(open("/tmp/fcc-models.json"))["data"]))'
```

---

## 9. Current Working State

```text
OhMyPi → FCC                    ✗  not working (404 transport mismatch)
omp version                     omp/18.4.12
omp binary                      /opt/homebrew/bin/omp
FCC provider (omp)              baseUrl http://127.0.0.1:8082/v1
                                api: openai-completions        ← root cause
                                discovery: openai-models-list
                                apiKey: FCC_OMP_API_KEY (env reference)
modelRoles.default              fcc/anthropic/vercel/typesafe-ai/jev
FCC service                     free-claude-code 5.21.0, healthy on 127.0.0.1:8082
FCC transport                   Anthropic Messages (200); Chat Completions (404)
successful FCC turns in logs    0
FCC provider errors in logs     5
```

Not verified as working, and must not be reported as working.

---

## 10. Rollback

No OMP configuration backup was created for this session, so there is no timestamped file to restore. To revert the OMP-side change:

```bash
# 1. Snapshot the current files before editing
cp ~/.omp/agent/models.yml  ~/.omp/agent/models.yml.pre-fcc-$(date +%Y%m%d-%H%M%S)
cp ~/.omp/agent/config.yml  ~/.omp/agent/config.yml.pre-fcc-$(date +%Y%m%d-%H%M%S)

# 2. Remove the fcc entry from the providers block in ~/.omp/agent/models.yml
#    and point modelRoles.default in ~/.omp/agent/config.yml back at the
#    previous working model.

# 3. Restart omp and confirm the previous default model resolves.
```

Reverting OMP has no effect on the verified Telegram/OpenClaw or WhatsApp/Hermes integrations — they use separate configuration.

---

## 11. Security Considerations

- The OMP FCC provider references its key through an environment variable name (`FCC_OMP_API_KEY`). Do not paste the resolved value into documentation, logs, or the repository.
- `~/.omp/agent/config.yml` and `~/.omp/agent/models.yml` are machine-local and may contain provider references. Do not commit them.
- FCC remains loopback-only. This issue introduces no new listening surface.
- The diagnostic commands above print only HTTP status codes and model counts — never response bodies or credentials.

---

## 12. Lessons Learned

1. **`/v1/models` success is not request compatibility.** A client can enumerate a catalogue over one transport and fail every inference request over another.
2. **A bare `404 {"detail":"Not Found"}` on an existing model usually means the request shape is wrong**, not that the model is missing. Check the route the client actually calls.
3. **Wrappers do not fix transport.** `fcc-omp` exports a key; it cannot change the `api:` shape declared in `models.yml`.
4. **Verify the transport, not just the endpoint.** `POST /v1/messages` → `200` alongside `POST /v1/chat/completions` → `404` is a two-line diagnosis worth keeping in the toolbox.
5. **Product names collide.** `fcc-pi` and `fcc-omp` target different products.

---

## 13. Known Limitations

- The fix direction is known but **not implemented or verified**: OhMyPi would need to speak the Anthropic Messages shape to FCC, or FCC would need an OpenAI-compatible Chat Completions surface on this path. Whether OhMyPi's provider model supports that shape was not established in this session.
- All five observed FCC failures in the OMP logs were `404` transport errors. No FCC-side error was observed, so no FCC change is indicated by this evidence.
- The failure was characterised from existing logs plus a direct transport probe. A clean, single-model reproduction with an isolated OMP profile was not run.
- Because no OMP backup was taken before the provider was added, the exact pre-change OMP configuration is not recoverable from a file; revert by removing the provider entry as described in §10.

---

## 14. If This Happens Again

### Shortest diagnostic sequence

```bash
# 1. Is FCC healthy?
curl -fsS http://127.0.0.1:8082/health

# 2. Which transport does FCC serve?
curl -s -o /dev/null -w 'messages=%{http_code} ' -X POST http://127.0.0.1:8082/v1/messages \
  -H 'content-type: application/json' \
  -d '{"model":"anthropic/tokenrouter/z-ai/glm-5.3-free","max_tokens":8,"messages":[{"role":"user","content":"hi"}]}'
curl -s -o /dev/null -w 'chat=%{http_code}\n' -X POST http://127.0.0.1:8082/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"anthropic/tokenrouter/z-ai/glm-5.3-free","max_tokens":8,"messages":[{"role":"user","content":"hi"}]}'

# 3. What shape is OMP declared to use?
grep -A4 'fcc:' ~/.omp/agent/models.yml

# 4. What did OMP actually log?
grep -h '"provider":"fcc"' ~/.omp/logs/*.log | grep -c 'provider error'
```

If step 2 shows `messages=200 chat=404` and step 3 shows `api: openai-completions`, the diagnosis is confirmed: the client is using the wrong transport shape.

### Shortest recovery procedure

1. Confirm FCC health and the transport signature.
2. Confirm the `api:` value OhMyPi uses for the FCC provider.
3. If they disagree, change OhMyPi's FCC provider to the Anthropic Messages shape (if supported), or point OhMyPi at a provider that does serve Chat Completions.
4. If they already agree, the problem is elsewhere — re-check the log lines for the real error and treat this runbook as a starting point only.
5. Do not add more models in response to a 404 on an existing model.

---

## 15. Credits

Troubleshooting and documentation assisted by:

- **ChatGPT — GPT-5.6 Sol** — troubleshooting guidance and architecture review.
- **WorkBuddy AI — DeepSeek-4.1-Flash** — repository inspection, live-state verification, and documentation.

Configuration changes and any interactive testing were performed by the operator. Neither assistant executed changes to the operator's systems.

---

*End of runbook.*
