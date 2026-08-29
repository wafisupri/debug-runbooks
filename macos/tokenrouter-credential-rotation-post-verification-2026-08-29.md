# TokenRouter Credential Rotation — Post-Rotation Verification

**Date:** 2026-08-29  
**Status:** Fixed  
**Platform:** macOS  

---

## Summary

`STEP_2D_H4S2_R1` completed successfully. The TokenRouter credential rotation initiated in `H4S2` was post-verified: the retired (disabled) credential is rejected for authentication, and the replacement credential is provisioned through a secure environment source only. **TokenRouter credential hygiene is complete.**

No credential material appears anywhere in this document.

---

## Environment

- **Operating system:** macOS on Apple Silicon (`aarch64`)
- **Central gateway:** OmniRoute on `127.0.0.1:20128`
- **AI / agent CLIs:** OpenCode CLI, Kimi Code CLI, Codex
- **Providers / routers:** TokenRouter, OpenRouter, OmniRoute, 9Router
- **Central route:** `omniroute/coding-chain`

Versions are intentionally not enumerated where they could not be confirmed safely during this verification.

---

## Objective

The post-rotation verification had one goal: prove that the credential rotation performed in `H4S2` was effective end-to-end, without spending paid credit and without exposing any secret.

Concretely, this meant confirming:

1. The old (disabled) TokenRouter credential fails authentication.
2. The replacement credential is provisioned through a secure source and works.
3. No plaintext copy of either credential exists in active client configuration.
4. Central routing and governance invariants remain intact.

---

## Security Constraints

This task is documentation-only. No destructive rotation was re-run.

The highest-priority rule is **no secret output**: a credential (or even its prefix, length, or hash) must never be printed, logged, transmitted, or committed. Any required secret comparison is performed internally in a process and emits only safe statuses such as `PASS`, `FAIL`, `MATCH`, `NO_MATCH`, or `COUNT=0`.

The old-credential test deliberately used the **non-generation** endpoint:

```
GET https://api.tokenrouter.com/v1/models
```

This endpoint only lists models. It performs no generation and spends no paid OpenRouter credit, so it is a safe boundary for proving whether a credential is accepted or rejected.

---

## Pre-Rotation Problem / Risk

During `H4S2`, the credential rotation reached the stage where remote rotation was required. The remaining work was to prove two things:

1. That the old, rotated-out credential is actually **rejected** by the upstream service, and
2. That the replacement credential is provisioned through a secure source without reintroducing a plaintext literal into client configuration.

The old credential is not reproduced here.

---

## Verification Procedure

The following steps were performed in a sanitized manner (no secret material is reproduced):

1. **Old credential rejection check.** The old (disabled) TokenRouter credential was tested *internally* against `GET /v1/models`. The upstream returned **HTTP 401**, establishing that the old credential is disabled and its authentication is rejected.
2. **Replacement credential validity check.** The replacement credential (read from the `TOKENROUTER_API_KEY` environment source) was tested internally against `GET /v1/models`. It returned **HTTP 200**, confirming it is accepted and functional.
3. **OpenCode secure reference confirmed.** OpenCode references the replacement credential through the OpenCode environment interpolation form `{env:TOKENROUTER_API_KEY}`. No literal credential value is stored in the OpenCode config; the value is resolved from the environment at runtime.
4. **No plaintext replacement written.** The replacement credential was **not** written as a literal into any active client configuration file.
5. **Kimi left unconfigured by design.** Kimi Code CLI has no confirmed safe native environment/keychain secret reference for its TokenRouter `api_key` field, so TokenRouter remains intentionally unconfigured there. This is a deliberate security decision (see below).
6. **Codex independent of TokenRouter.** Codex has no TokenRouter dependency and continues to route centrally through OmniRoute.
7. **Central routes revalidated.** Each CLI's central route through OmniRoute / `coding-chain` was rechecked (see Routing Architecture).
8. **Shadow port check.** No listener was present on the legacy shadow port (`:20150`).
9. **Active-config resonance.** Active configuration files were compared internally for old- and new-credential literals; **both returned zero matches**.

All secret comparisons were internal; only safe statuses were reported.

---

## Routing Architecture

`CENTRAL_ROUTING_GOVERNOR = OMNIROUTE`

```
OpenCode
  -> omniroute/coding-chain
  -> 127.0.0.1:20128/v1

Kimi Code CLI
  -> omniroute/coding-chain
  -> 127.0.0.1:20128/v1

Codex
  -> model_provider = omniroute
  -> model = coding-chain
  -> 127.0.0.1:20128/v1
```

There is **no duplicate client-side fallback logic**. The free-first policy is preserved with OpenRouter paid **last**.

The currently verified OpenRouter free pool is:

- `poolside/laguna-s-2.1:free`
- `cohere/north-mini-code:free`
- `nvidia/nemotron-3-super-120b-a12b:free`
- `minimax/minimax-m2.7:free`
- `inclusionai/ling-3.0-flash-fin:free`

Model availability is not guaranteed permanent; upstream providers may add, remove, or rename free endpoints at any time.

---

## Kimi Security Decision

TokenRouter is intentionally **NOT_CONFIGURED** for Kimi Code CLI.

This is because no safe **native** environment or keychain secret reference could be confirmed for Kimi's TokenRouter `api_key` field. Rather than reintroduce a plaintext credential, TokenRouter was left unconfigured in Kimi.

This is a **deliberate security decision, not a routing failure**. Kimi continues to operate normally through its central OmniRoute route (`omniroute/coding-chain`).

---

## Verification Results

```
OLD_TOKEN_DISABLED                        = PASS
OLD_TOKEN_AUTH_REJECTED                   = PASS
REPLACEMENT_TOKEN_PROVISIONED             = PASS
OPENCODE_SECURE_ENV_REFERENCE             = PASS
KIMI_TOKENROUTER                          = NOT_CONFIGURED_BY_DESIGN
CODEX_TOKENROUTER_DEPENDENCY              = NONE
OLD_TOKEN_ACTIVE_CONFIG_MATCHES           = 0
NEW_TOKEN_PLAINTEXT_ACTIVE_MATCHES        = 0
CENTRAL_ROUTING_GOVERNOR                  = OMNIROUTE
DUPLICATE_CLIENT_FALLBACK_LOGIC           = ABSENT
FREE_FIRST_ORDER_INTACT                   = PASS
OPENROUTER_PAID_LAST                      = PASS
SHADOW_20150_ABSENT                       = PASS
TOKENROUTER_CREDENTIAL_HYGIENE            = COMPLETE
STEP_2D_H4S2                              = PASS
STEP_2D_H4S2_R1                           = PASS
ROLLBACK_REQUIRED                         = NO
```

---

## Known Non-Blocking Issue

`auto/coding:free` has a **pre-existing built-in HTTP 502 state**.

This is a provider-level serving-path state rather than a routing or credential problem, and it was **not fixed** by this work. It does not block closure because `openrouter-free` is operational and the overall free-first chain remains functional.

Do not interpret this runbook as claiming the 502 itself was resolved.

---

## Final Working State

```
STEP_2D_H1       = PASS
STEP_2D_H2       = PASS
STEP_2D_H3       = PASS
STEP_2D_H3R1     = PASS
STEP_2D_H3R1_RV  = PASS
STEP_2D_H4       = PASS
STEP_2D_H4S      = PASS
STEP_2D_H4S2     = PASS
STEP_2D_H4S2_R1  = PASS
```

---

## If This Happens Again

To re-verify (or re-run) a TokenRouter credential rotation safely:

1. **Never paste or print credentials** at any point during diagnosis. Do not display them, their prefixes, lengths, or hashes.
2. Test the retired credential only against the **non-generation** `GET /v1/models` endpoint; expect **HTTP 401**.
3. Test the replacement credential against the same endpoint; expect **HTTP 200**.
4. Provision the replacement **only** through the secure source (e.g., the environment reference used by OpenCode); never write it as a plaintext literal into a config file.
5. Internally scan active configs for both old and new credential literals; expect **zero matches for each**.
6. Reconfirm the central route (`omniroute/coding-chain`) on each CLI and the absence of a `:20150` shadow listener.
7. Report only safe statuses (`PASS` / `FAIL` / `COUNT=0`) and keep all secret material out of any log or commit.

---

## Attribution

- **Configuration / security verification:** AI model GPT-5.6 Luna; CLI/agent environment OpenCode CLI.
- **Repository documentation / final validation / commit:** OpenClaude CLI; AI model not programmatically confirmed (attributed without guessing).
- This runbook was created from a verified operational session and was **sanitized before publication**; no credentials were copied from any backup or config file into this document.
