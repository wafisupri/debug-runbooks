# OpenClaude → 9Router silverMBN Authentication & Persistent Wrapper Recovery

Date: 2026-08-30
Status: Fixed / Verified
Platform: macOS
OpenClaude: v0.29.1

## Summary

OpenClaude was configured to use the local 9Router-facing endpoint and the `silverMBN` combo but returned:

```
API Error: Authentication failed (status 401)
```

The issue was resolved by using the real 9Router client credential stored in `NINEROUTER_KEY`, scoped into `OPENAI_API_KEY` specifically for the OpenClaude process, and persisting the OpenClaude wrapper in `~/.zshrc` with:

- `CLAUDE_CODE_USE_OPENAI=1`
- `OPENAI_BASE_URL="http://127.0.0.1:20138/v1"`
- `OPENAI_API_FORMAT="chat_completions"`
- `OPENAI_API_KEY="$NINEROUTER_KEY"`
- `OPENAI_MODEL="silverMBN"`

## Environment / Architecture

- OpenClaude CLI v0.29.1
- macOS Apple Silicon (arm64)

```
Client:
OpenClaude
  ↓
OpenAI-compatible interface
  ↓
127.0.0.1:20138 (9Router policy guard)
  ↓
127.0.0.1:20139 (9Router backend)
  ↓
silverMBN combo
  ↓
Selected upstream model (e.g. claude-opus-4-6-thinking)
```

*Note: OmniRoute was independently listening on `:20128` but was not the OpenClaude endpoint used for this recovery.*

## Symptoms

Initial failure when invoking OpenClaude:

```
API Error: Authentication failed (status 401).
Check your provider credential configuration.
```

The global shell environment contained generic OpenAI variables pointing elsewhere:

```bash
OPENAI_BASE_URL=https://api.groq.com/openai/v1
```

along with an unrelated global `OPENAI_API_KEY`.

## Root Cause

1. `silverMBN` itself was not the problem.
2. 9Router was healthy and running.
3. OpenClaude correctly supported Local OpenAI-compatible mode.
4. The manually launched OpenClaude session was supplying the shell's generic `OPENAI_API_KEY`, which was not the valid 9Router client key.
5. 9Router policy guard correctly rejected that credential with HTTP 401 (`invalid_api_key`).
6. `~/.zshrc` already contained `NINEROUTER_KEY`, which was the authoritative credential source for 9Router.
7. Generic `OPENAI_*` environment variables were overloaded by other providers, making global reliance on them unsafe without client-specific scoping.

## What Did Not Work / Misleading Approaches

- Deleting OpenClaude configuration files (`~/.openclaude/` or `.openclaude/settings.json`) — unnecessary; the client configuration was functional.
- Fabricating a credential such as `9router-silverMBN` — rejected by 9Router auth guard.
- Restarting or killing 9Router daemon processes before proving the failure layer — would have disrupted working local proxy infrastructure.
- Switching to a direct Gemini model instead of the configured `silverMBN` combo — bypassed the desired combo route without addressing the credential mismatch.

## Diagnostic Evidence

### Stage 1 — Runtime & Listeners

- OpenClaude: `v0.29.1`
- Active listeners:
  - `:20128` OmniRoute (LISTENING)
  - `:20138` 9Router policy guard (LISTENING)
  - `:20139` 9Router backend (LISTENING)

Initial shell environment:
```bash
CLAUDE_CODE_USE_OPENAI=UNSET
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_API_KEY=<SET, REDACTED>
```

### Stage 2 — Health & Catalogue

Front guard health check:
```
GET http://127.0.0.1:20138/api/health
→ HTTP 200
→ {"ok":true}
```

The `silverMBN` combo entry was present in the model catalogue:
```json
{
  "id": "silverMBN",
  "object": "model",
  "owned_by": "combo"
}
```

### Stage 3 — Direct Generation with Wrong Generic Key

```http
POST /v1/chat/completions
model=silverMBN
```

Result:
```json
HTTP 401
{
  "error": {
    "message": "Invalid API key",
    "type": "authentication_error",
    "code": "invalid_api_key"
  }
}
```

This confirmed that the credential — not endpoint routing or model selection — was the failure point.

### Stage 4 — Correct 9Router Credential

Inspecting `~/.zshrc` revealed:
```bash
NINEROUTER_KEY=<REDACTED>
```

Testing with the scoped credential:
```http
Authorization: Bearer $NINEROUTER_KEY
```

`GET /v1/models` returned HTTP 200 and exposed `silverMBN`.

One subsequent generation attempt returned:
```json
HTTP 502
{"error":{"code":"upstream_unavailable"}}
```

This 502 was isolated as transient rather than an authentication failure.

### Stage 5 — Transient 502 Isolation & Verification

- Front guard `:20138` health: `HTTP 200`
- Backend `:20139` health: `HTTP 200`
- Backend catalogue: `HTTP 200` (`MODEL_COUNT = 562`)
- `silverMBN`: present, `owned_by=combo`
- `hermes-main`: present, `owned_by=combo`
- `silverMBN` through `:20138`: `FRONT_SILVER_OK` (`HTTP 200`)
- `silverMBN` directly through `:20139`: `BACKEND_SILVER_OK` (`HTTP 200`)
- Concrete model through `:20138`: `DIRECT_MODEL_OK` (`HTTP 200`)

Conclusion:
- Guard: functional
- Backend: functional
- Authentication: functional
- `silverMBN`: functional
- Direct provider/model routing: functional
- Earlier 502: transient upstream provider error

The upstream model selected by `silverMBN` during verification was reported as `claude-opus-4-6-thinking`.

## Final Fix

Updated the persistent OpenClaude wrapper in `~/.zshrc`:

```bash
openclaude() {
  if [[ -z "${NINEROUTER_KEY:-}" ]]; then
    echo "ERROR: NINEROUTER_KEY is not set."
    return 1
  fi

  CLAUDE_CODE_USE_OPENAI=1 \
  OPENAI_BASE_URL="http://127.0.0.1:20138/v1" \
  OPENAI_API_FORMAT="chat_completions" \
  OPENAI_API_KEY="$NINEROUTER_KEY" \
  OPENAI_MODEL="silverMBN" \
  command openclaude "$@"
}
```

*Note: Previously, this wrapper defaulted to `ag/gemini-3.7-flash-high`. It was updated to `silverMBN` after backing up `~/.zshrc`.*

## Final Verification

Ordinary launch without manual env prefixes:

```bash
openclaude
```

Startup banner:
```
Provider   Local OpenAI-compatible
Model      silverMBN
Endpoint   http://127.0.0.1:20138/v1
```

Verification prompt:
```
Reply exactly: OPENCLAUDE_WRAPPER_PERSISTENT_OK
```

Response:
```
OPENCLAUDE_WRAPPER_PERSISTENT_OK
```

## Final Working State

| Check | Result |
| --- | --- |
| OpenClaude v0.29.1 starts | PASS |
| Persistent `~/.zshrc` wrapper | PASS |
| `NINEROUTER_KEY` mapping | PASS |
| Local OpenAI-compatible mode | PASS |
| `:20138` policy guard | PASS |
| `:20139` backend | PASS |
| `silverMBN` visible | PASS |
| `silverMBN` direct generation | PASS |
| OpenClaude → `silverMBN` | PASS |
| Persistence after `source ~/.zshrc` | PASS |
| Manual env prefix required | NO |

## Security Notes

- Never commit `NINEROUTER_KEY` or literal credentials.
- Never commit values from `OPENAI_API_KEY`, `GROQ_API_KEY`, Gemini keys, TokenRouter keys, Keychain dumps, or provider tokens.
- Keep runbooks restricted to environment variable names and `<REDACTED>` placeholders.
- Scoping credentials within dedicated wrapper functions prevents environment pollution across distinct CLI tools.

## Follow-up / Not Part of This Fix

The following items were out of scope for this recovery:

1. Audit whether `silverMBN` strictly adheres to the intended FREE-FIRST routing policy under all failover conditions.
2. Determine whether OpenClaude's displayed session cost (`$0.14`) reflects local estimation or upstream provider billing.
3. Audit why `silverMBN` dynamically routed to `claude-opus-4-6-thinking`.
4. Consolidate and clean duplicate global `OPENAI_API_KEY` / `OPENAI_BASE_URL` exports across shell configs.
5. Verify the separate `openclaude-tokenrouter()` launcher function.

## Attribution

### AI / CLI Attribution

- **Diagnosis, staged verification design, and recovery guidance:** ChatGPT — GPT-5.6 Sol
- **Execution and end-to-end CLI verification:** OpenClaude CLI v0.29.1
- **Routing infrastructure:** 9Router local policy guard (`:20138`) and backend (`:20139`)
