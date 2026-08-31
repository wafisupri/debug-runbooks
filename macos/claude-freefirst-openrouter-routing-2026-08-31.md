# Claude Code Free-First / OpenRouter Routing — Validated 3-Stage Fallback, Then Intentionally Disabled

**Date:** 2026-08-31  
**Status:** Fixed (validated end-to-end, then intentionally disabled with the tuned build preserved as a backup)  
**Platform:** macOS  

---

## Summary

A dedicated experimental launcher, `claude-freefirst`, was built to route Claude Code through a
local bridge that tries **free** model routes first and falls back to a **paid** OpenRouter route
only as a last resort. The full three-stage chain was validated end-to-end, including live
Server-Sent Events (SSE) streaming and a controlled paid-fallback test, and the per-stage
first-output timeouts were tuned to **8 s → 15 s → 90 s**.

After validation, `claude-freefirst` was **intentionally disabled** and its tuned launcher and
bridge were preserved as a backup rather than deleted. The two unrelated routes — normal `claude`
and the direct `claude-openrouter` launcher — were **not** touched by that disable operation.

No credential material appears anywhere in this document. The OpenRouter key used by the paid
fallback is referenced only as a dedicated macOS Keychain credential.

---

## Environment

- **Operating system:** macOS on Apple Silicon (`aarch64`)
- **Client:** Anthropic Claude Code CLI
- **Central gateway:** OmniRoute on `127.0.0.1:20128`
- **Experimental bridge (while enabled):** local Anthropic-compatible listener on `127.0.0.1:20150`
- **Providers / routers:** OmniRoute, OpenRouter
- **Paid-fallback credential:** dedicated macOS Keychain credential, Keychain service `OpenRouter Claude Code`

Versions are intentionally not enumerated where they could not be confirmed safely.

---

## The Three Routes (Design Intent)

The design deliberately keeps three **isolated** entry points. `claude-freefirst` was never meant
to replace normal `claude`.

| Launcher | Path | Authentication | Purpose |
|---|---|---|---|
| `claude` | normal Claude Code | Claude Pro / `claude.ai` account | Everyday use, unchanged |
| `claude-openrouter` | direct OpenRouter route | dedicated OpenRouter credential | Deliberate direct paid OpenRouter usage |
| `claude-freefirst` | local bridge → free routes first → paid OpenRouter last | dedicated OpenRouter credential for the final hop only | Experimental cost-minimising route |

`openclaude-tokenrouter` is a separate, pre-existing helper implemented as a **zsh function**
(not a standalone binary). It is unrelated to this work and was not modified.

---

## Verified Architecture

While enabled, the validated free-first chain was:

```
Claude Code
    |
    v
claude-freefirst            ($HOME/.local/bin/claude-freefirst)
    |
    v
local bridge on 127.0.0.1:20150     ($HOME/.claude/bridges/claude-freefirst-bridge.mjs)
    |                                 Anthropic-compatible POST /v1/messages
    |
    +--> 1. OmniRoute 127.0.0.1:20128
    |       route/model: auto/coding:free
    |       first-useful-output window: 8 seconds
    |
    +--> 2. OmniRoute 127.0.0.1:20128
    |       combo: openrouter-free
    |       first-useful-output window: 15 seconds
    |
    +--> 3. direct OpenRouter
            dedicated Claude Code OpenRouter Keychain credential
            transport window: 90 seconds
            paid fallback only — used only if 1 and 2 both fail
```

Behaviour rules the bridge enforced:

- Try route 1, then route 2, then route 3, in order.
- A route "succeeds" when it produces the **first meaningful** output within its window
  (meaningful SSE data, not ping/keep-alive/empty frames).
- On success, stream the response to the client immediately.
- On error, buffer the upstream response only long enough to decide whether to fall back.
- Route 3 (paid) is only ever reached when both free routes fail.

### Final validated timeout policy

| Route | Window | Meaning |
|---|---:|---|
| `auto/coding:free` | 8 s | first useful output |
| `openrouter-free` | 15 s | first useful output |
| `openrouter-paid` | 90 s | transport / final route |

A locally generated **HTTP 504** from route 1 means the bridge's own 8-second first-output
deadline expired. It does **not** necessarily mean OmniRoute itself returned 504.

---

## Test Evidence

All cases below were observed during validation. "Forced invalid" means a route was deliberately
pointed at a bad target to exercise fallback; those changes were reverted after the test.

### A — Raw bridge request
- HTTP 200
- served by `auto/coding:free`
- correct exact response content
- zero-cost OmniRoute route

### B — Claude Code client
- exact prompt / response round-trip succeeded
- process exit code `0`

### C — Claude Code tool use
- Bash tool invocation succeeded through the bridge
- exact final response: `CLAUDE_TOOL_USE_OK`

### D — FREE → FREE fallback (forced)
- route 1 deliberately forced invalid → **HTTP 404**
- route 2 `openrouter-free` succeeded
- response carried header `x-claude-freefirst-route: openrouter-free`
- OpenRouter free model selected during one verified run: `poolside/laguna-s-2.1:free`
- OmniRoute recorded response cost: `0.0000000000`

### E — Real (non-forced) free fallback
Observed in normal Claude Code operation, no forcing:
- `auto/coding:free` returned **HTTP 413** under oversized / model-limit conditions
- bridge continued to `openrouter-free`
- `openrouter-free` returned **HTTP 200**

### F — Paid fallback (forced, controlled)
Both free routes deliberately forced invalid:
- route 1 → HTTP 404
- route 2 → HTTP 404
- route 3 → `openrouter-paid` → **HTTP 200**
- exact response: `PAID_FALLBACK_OK`
- test cost reported by OpenRouter for that single request: `$0.000202`
- model returned: `anthropic/claude-sonnet-5`

This single request only demonstrates that the paid route works and uses the dedicated guarded
OpenRouter credential. The OpenRouter-side monthly budget / guardrail was configured separately
and is **not** proven by this one request.

### G — Streaming
The original bridge buffered complete upstream responses, causing large perceived latency.
Diagnostics showed examples such as:
- a successful free Nemotron request taking ~68 seconds
- other free attempts returning 429, 502, and 413
- free fallback able to spend significant time before returning any output

The bridge was changed to:
- wait for the first meaningful output
- distinguish meaningful SSE data from ping / empty traffic
- stream successful responses immediately
- buffer error responses only long enough to evaluate fallback
- retain the paid route as the final fallback

Verified streaming PASS:
- route 1 deliberately invalid
- route 2 `openrouter-free`
- log line: `stream committed: openrouter-free HTTP 200`
- SSE deltas arrived incrementally
- exact reconstructed reply: `FREE_STREAM_FALLBACK_OK`
- selected model: `poolside/laguna-s-2.1:free`
- recorded OmniRoute response cost: `0.0000000000`

### H — Final timeout tuning
Final acceptance run:
- `FREEFIRST_FINAL_TUNING_OK`
- route 1 timing out with a **local** HTTP 504 after the new 8-second window
- successful fallback to `openrouter-free`
- stream committed successfully
- a direct probe measured first byte at ~8.6 seconds in one fallback test

---

## Finding — `free-stack` was not used as route 3

The pre-existing `free-stack` combo was evaluated as a candidate third stage and rejected.
Audit of the inspected call set showed:

- persisted `free-stack` effectively routed to Groq `openai/gpt-oss-120b`
- zero successful calls in the inspected set
- failures were predominantly **HTTP 413**, with some 400 / 502
- request sizes exceeded provider TPM / model constraints

`free-stack` is **not** claimed to be broken globally — only that, based on the observed audit, it
was unsuitable for this Claude Code fallback path. The chain was intentionally simplified to:

1. `auto/coding:free`
2. `openrouter-free`
3. dedicated OpenRouter paid fallback

---

## Finding — `openrouter-free`

`openrouter-free` is an existing explicit priority combo containing OpenRouter `:free` models.
Verified calls through it showed **zero** recorded response cost and reliably provided the second
free tier. No credentials are reproduced here.

---

## Non-Blocking Warning — unrecognized model

During validation Claude Code emitted:

```
[claude-code:unrecognized_model] {"model":"auto/coding:free","query_source":"sdk"}
```

- Claude Code does not natively recognise the custom gateway model identifier.
- It was **non-blocking** during validation: requests still reached the bridge and completed.
- This is separate from routing correctness.
- This warning is **not** claimed to be permanently fixed.

---

## Final State — `claude-freefirst` Intentionally Disabled

After successful validation, `claude-freefirst` was intentionally disabled.

| Component | Final state |
|---|---|
| `claude` | available — Claude Pro / `claude.ai`, unchanged |
| `claude-openrouter` | available — direct OpenRouter route, not disabled |
| `claude-freefirst` | intentionally **NOT FOUND** (disabled) |
| bridge listener `127.0.0.1:20150` | stopped while freefirst is disabled |
| `openclaude-tokenrouter` | available — a zsh function, not a standalone binary |

The validated, tuned freefirst build was preserved (not deleted) under:

```
$HOME/.claude/disabled-freefirst-20260831-015841/
    claude-freefirst
    claude-freefirst-bridge.mjs
```

Neither the live files nor the backup files are committed to this repository; only their purpose
and `$HOME`-relative locations are documented here.

Notes:

- `claude-openrouter` remained intact and was **not** intentionally disabled.
- `openclaude-tokenrouter` is implemented as a zsh function. An earlier audit briefly treated it
  as missing because it was inspected from a shell context that could not see interactive zsh
  functions. No restoration was required.

---

## If This Happens Again

To re-enable and re-validate the free-first route safely:

1. Restore the two files from `$HOME/.claude/disabled-freefirst-20260831-015841/` to
   `$HOME/.local/bin/claude-freefirst` and `$HOME/.claude/bridges/claude-freefirst-bridge.mjs`.
2. Confirm OmniRoute is listening on `127.0.0.1:20128` and start the bridge on `127.0.0.1:20150`.
3. Keep the tuned windows: `auto/coding:free` 8 s, `openrouter-free` 15 s, `openrouter-paid` 90 s.
4. Verify order: free route 1 → free route 2 → paid route 3, paid reached only on double free failure.
5. Test streaming with route 1 forced invalid; expect `stream committed: openrouter-free` and
   incremental SSE deltas.
6. Keep the OpenRouter paid credential in the Keychain service `OpenRouter Claude Code`; never
   write it as a plaintext literal into any launcher, bridge, or config file.
7. Leave normal `claude` and `claude-openrouter` untouched — they are independent routes.
8. Treat a local HTTP 504 on route 1 as the bridge's first-output deadline, not an OmniRoute 504.

---

## Configuration Provenance

This is a tooling / provenance record, not a claim of authorship ownership. None of the parties
below officially endorsed this configuration.

- **Configuration design, diagnostic reasoning, test planning, safety checks, documentation guidance:**
  OpenAI ChatGPT — GPT-5.6 Sol
- **Local implementation, shell execution, inspection, validation, final timeout tuning:**
  Anthropic Claude Code CLI
- **Routing infrastructure involved:** OmniRoute, OpenRouter

This runbook was created from a verified operational session and was sanitized before publication;
no credentials were copied from any keychain, shell profile, provider database, log, or environment
variable into this document.
