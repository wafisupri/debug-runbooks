# OpenClaude / OmniRoute Model Catalogue Repair — 2026-08-30

**Date:** 2026-08-30
**Status:** Fixed / Verified (PASS / CLOSED)
**Platform:** macOS (Apple Silicon, arm64)
**Components:** OpenCode CLI (Muse Spark 1.2), OmniRoute, 9Router, OpenClaw

## Summary

OpenClaude/OpenCode-compatible `/model` routing exposed malformed or non-callable model identities. OpenRouter models were listed with an incorrect extra compatibility namespace, GitHub entries returned `model_not_supported`, and several NVIDIA selections appeared unavailable. The underlying cause was a stray 9Router provider configuration; the fix was configuration/database cleanup with no source-level namespace stripping. Final verification proved a zero-cost OpenRouter FREE generation, FREE-FIRST preservation, and persistence through restart.

## Environment

- OS: macOS Apple Silicon (arm64), zsh
- OmniRoute: 3.8.49 (dist banner v16.2.12), port `20128`, `~/.nvm/versions/node/v24.18.1/lib/node_modules/omniroute/dist`
- 9Router: 0.5.55/0.5.59, backend port `20139`, guard port `20138` (policy proxy), `~/.local/lib/node_modules/9router/app`
- OpenClaw: healthy on `127.0.0.1:18789` but NOT in this incident request path
- OpenCode CLI: provider `omniroute` baseURL `http://127.0.0.1:20128/v1` model `omniroute/coding-chain`
- Routing combos: `coding-chain` → `openrouter-free` → `openrouter-paid` (strategy `priority`, `maxRetries 2`)
- OpenRouter free-sync LaunchAgent: `ai.omniroute.openrouter-free-sync` (interval 21600s, script `~/.omniroute/scripts/refresh-openrouter-free.mjs`)

```
Client (OpenCode / OpenClaude-compatible)
  ↓
OmniRoute :20128 (coding-chain)
  ↓
openrouter-free (FREE) → openrouter-paid (paid last-resort)
  ↓
Upstream providers (OpenRouter, etc.)

9Router:
  guard :20138 → backend :20139
  (separate path for some clients, not the validated OpenCode path)

OpenClaw :18789 — healthy, proven NOT involved (see verification)
```

## Symptoms

- `/v1/models` (OmniRoute :20128 and 9Router :20139) listed entries resembling `OpenRouter/anthropic/tencent/...` and `OpenRouter/anthropic/inclusionai/...` where the canonical OpenRouter ID should have been `tencent/...` or `inclusionai/...`.
- Some entries displayed formatting artifacts such as literal `[1m]` sequences.
- Selecting those malformed models produced errors like “is not a valid model ID” or `model_not_supported`.
- GitHub `gh/gpt-5.6-luna`, `gh/gpt-5.6-luna-free-auto`, `gh/oswe-vscode-prime` returned `model_not_supported` even though listed.
- Several NVIDIA and Cerebras selections were previously reported unavailable or quota-gated, requiring separate classification.
- Initial triage suspected a model-ID normalization bug.

> Sanitized examples only. Raw error bodies containing token material are omitted.

## Architecture

```
OpenCode CLI  →  OmniRoute :20128  →  combo routing  →  upstream OpenRouter API
                                       (verified via :20128)

9Router guard :20138  →  9Router backend :20139  →  providerNodes / providerConnections
 (policy)                (model catalogue, 562 models)

OpenClaw :18789 — gateway for other clients; lsof/pid audit proved it was not
the serving process for the OpenCode CLI request path (see Verification).
```

Authoritative runtime is the installed/prebuilt OmniRoute and 9Router (`dist` / `.next-cli-build`), NOT any checkout under `/tmp`.

## Root Cause

A stray 9Router provider node existed:

- type `anthropic-compatible`
- name `OpenRouter`
- base URL `https://openrouter.ai/api/v1`
- prefix `OpenRouter`

This node fetched the OpenRouter catalogue through an Anthropic-compatible code path and re-exposed it with an additional `OpenRouter/anthropic/` wrapper. Its associated provider connection contributed the same malformed entries to the merged catalogue. The result was provider-qualified identities that did not match any canonical OpenRouter model.

Legitimate OpenRouter IDs already contain vendor namespaces (e.g., `anthropic/...`, `google/...`, `qwen/...`, `poolside/...`, `tencent/...`, `inclusionai/...`). The stray node incorrectly prepended an extra compatibility namespace, breaking those legitimate namespaces.

## What Did Not Work / Rejected Approach

- **Generic namespace stripping** — e.g., `split("/").slice(1)` or “remove everything before the first slash” for slash-containing IDs. Rejected as unsafe because it destroys legitimate vendor namespaces (`anthropic/`, `google/`, `poolside/`, etc.) and would silently reroute valid models to wrong upstreams. Verification showed that `openrouter/anthropic/` (102 models), `openrouter/google/` (106), `openrouter/tencent/` (16) are legitimate and must remain intact.

- **Patching source under `/tmp/9router-source`** — not authoritative; `/tmp` is not the production installation. Those experimental edits were reverted (`git status` clean, diff 0).

- **Injecting non-authoritative `~/.local/lib/node_modules/omniroute/src/app/...`** files (including a spurious `/v1/models/[kind]` route) — removed; the prebuilt `dist` is the serving artifact.

- **Assuming OpenClaw was the router** — disproven via PID/lsof/LaunchAgent audit (serving PID 91998 is `node .../omniroute/bin/omniroute.mjs serve`, parent of 9Router’s `next-server`, not `openclaw` on :18789).

- **Treating all catalogue entries as equally callable** — GitHub/Copilot and Cerebras entries require separate entitlement/billing classification (see Verification).

## Final Fix

Configuration/database cleanup only — no source-level stripping added.

Logical operations:

1. Located the stray 9Router `anthropic-compatible` OpenRouter provider node and its associated connection in `~/.9router/db/data.sqlite` (`providerNodes` / `providerConnections`).
2. Removed both rows (placeholder form):

```sql
-- executed via sqlite3 against the 9Router database
DELETE FROM providerNodes WHERE id = '<STRAY_NODE_ID>';
DELETE FROM providerConnections WHERE id = '<STRAY_CONNECTION_ID>';
```

3. Restarted the 9Router backend normally via its LaunchAgent:

```bash
launchctl kickstart -k gui/<UID>/ai.9router.backend
```

4. Verified the catalogue no longer contains malformed entries and that legitimate vendor namespaces remain.
5. Verified persistence: the node and malformed count remain zero after restart; the OpenRouter free-sync does not recreate provider nodes.

Why this fixes the underlying problem: the malformed identities were synthetic catalogue entries produced by the stray compatibility node. Removing the node removes the source of synthesis; legitimate vendor-qualified IDs were never broken and required no transformation.

## Commands

Consolidated diagnostic and recovery sequence (sanitized, placeholders for IDs):

```bash
# Locate repository and snapshot state
pwd
git rev-parse --show-toplevel
git remote -v
git branch --show-current
git rev-parse HEAD
git status --short

# Identify serving runtime (example)
lsof -i :20128 -i :20138 -i :20139 -i :18789 -sTCP:LISTEN
ps aux | grep -E "omniroute|9router|policy-proxy|openclaw"

# Inspect catalogues
curl -s http://127.0.0.1:20128/v1/models | python3 -m json.tool | head
curl -s http://127.0.0.1:20139/v1/models | python3 -m json.tool | head

# Verify malformed count is zero (examples)
curl -s http://127.0.0.1:20139/v1/models \
  | python3 -c "import json,sys; d=json.load(sys.stdin); ids=[m['id'] for m in d['data']]; print(sum(1 for i in ids if '[1m' in i or 'anthropic/inclusionai' in i))"

# Inspect 9Router DB (sanitized)
sqlite3 ~/.9router/db/data.sqlite "SELECT id, name, type FROM providerNodes;"
sqlite3 ~/.9router/db/data.sqlite "SELECT id, provider FROM providerConnections;"

# Remove stray node/connection (placeholder IDs)
sqlite3 ~/.9router/db/data.sqlite "DELETE FROM providerNodes WHERE id='<STRAY_NODE_ID>';"
sqlite3 ~/.9router/db/data.sqlite "DELETE FROM providerConnections WHERE id='<STRAY_CONNECTION_ID>';"

# Normal restart (no manual copy to /tmp)
launchctl kickstart -k gui/<UID>/ai.9router.backend
sleep 5
curl -s http://127.0.0.1:20139/v1/models | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d['data']))"

# OmniRoute routing verification (FREE path)
curl -s http://127.0.0.1:20128/v1/chat/completions \
  -H "Authorization: Bearer <OMNIROUTE_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"coding-chain","messages":[{"role":"user","content":"Reply exactly:\nOPENROUTER_MODEL_OK"}],"max_tokens":20,"temperature":0}' \
  | python3 -m json.tool
```

No credential values are included above; `<OMNIROUTE_API_KEY>` is the restricted key scoped to `coding-chain` (`allowed_models ["coding-chain"]`).

## Verification

Authoritative conclusions are derived from the closed PASS state documented in the incident evidence.

### Catalogue counts after repair

| Endpoint | Total | OpenRouter | NVIDIA | gh/ | Malformed `[1m]` / `anthropic/inclusionai` / `anthropic/tencent` | Notes |
|---|---:|---:|---:|---:|---:|---|
| OmniRoute :20128 | 1066 | 885 | 0 | 0 | 0 | `openrouter/anthropic/` 102 legitimate remain |
| 9Router backend :20139 | 562 | 385 | 76 | 32 | 0 | `openrouter/anthropic/` 28 legitimate |
| 9Router guard :20138 | 560 | — | — | — | 0 | mirrors backend minus 2 internal |

Duplicated-prefix check `openrouter/openrouter` (6) corresponds to intentional pseudo-models (`auto`, `free`, `fusion`, etc.), not malformed stripped IDs.

ANSI contamination: 0 entries containing literal `\x1b` or `[1m` / `[0m`.

### OpenRouter FREE path

- Live catalogue `https://openrouter.ai/api/v1/models` total 396, free 21, filtered to 6 via blocklist (shown below).
- `openrouter-free` combo after repair contained exactly the 6 filtered models, matching the live filtered set:
  - `openrouter/inclusionai/ling-3.0-flash-fin:free`
  - `openrouter/poolside/laguna-s-2.1:free`
  - `openrouter/cohere/north-mini-code:free`
  - `openrouter/minimax/minimax-m3:free`
  - `openrouter/minimax/minimax-m2.7:free`
  - `openrouter/nvidia/nemotron-3-super-120b-a12b:free`
- Request via `coding-chain` (which chains `auto/coding:free` → `openrouter-free` → `openrouter-paid`):

```json
HTTP 200
model: minimax/minimax-m3:free
content: OPENROUTER_MODEL_OK
headers: x-omniroute-provider: openrouter
         x-omniroute-model: minimax/minimax-m3:free
         x-omniroute-response-cost: 0.0000000000
         x-omniroute-decision: strategy=priority
```

Fallback behavior verified: `inclusionai` 502 and `cohere` 502 and `poolside` 429 advanced to the next FREE entry without manual `/model` switching; final success was FREE and cost remained zero.

Legitimate vendor namespaces preserved: `openrouter/anthropic/`, `openrouter/google/`, `openrouter/poolside/`, `openrouter/tencent/`, `openrouter/inclusionai/` etc. intact.

### NVIDIA

- Live `https://integrate.api.nvidia.com/v1/models` via `<NVIDIA_API_KEY>` returned 83 models.
- 9Router exposed 76 `NVIDIA/...` — strict subset, 0 stale (no 9Router NVIDIA model missing from live; 7 live embedding models not exposed is expected).
- Specifically `poolside/laguna-xs-2.1`, `01-ai/yi-large`, `adept/fuyu-8b`, `ai21labs/jamba-1.5-large-instruct`, `aisingapore/sea-lion-7b-instruct`, `bigcode/starcoder2-15b` all classified `CURRENT_CALLABLE` (live True, 9Router True).
- Route health proven with direct NVIDIA generation `NVIDIA_ROUTE_OK` (HTTP 200) via `meta/llama-3.2-90b-vision-instruct` (live model); this proved earlier NVIDIA failures were not caused by the malformed OpenRouter node.

### GitHub / Copilot

- Live `https://api.githubcopilot.com/models` with `free_limited_copilot` SKU returned 53 models.
- Previously failing `gh/gpt-5.6-luna`, `gh/gpt-5.6-luna-free-auto`, `gh/oswe-vscode-prime` are present in live and in 9Router `gh/` (32) — classified as real provider models but SKU/account-gated (`model_not_supported` due to picker entitlement), not stale aliases requiring `gh/` stripping. No stripping fix required.

### Cerebras

- `qwen-3-32b` — `MODEL_UNAVAILABLE` / stale (9Router lists it, live now returns 403/404 or unavailable).
- `gpt-oss-120b` — `QUOTA_EXHAUSTED` / `BILLING_REQUIRED` (live 402; previously observed quota-specific response, not “invalid model”). Billing unchanged (not enabled for this validation).

### Routing / Error handling

Validated distinction among:

- `MODEL_INVALID` / `MODEL_UNAVAILABLE` / `QUOTA_EXHAUSTED` / `RATE_LIMIT` → correctly advance to next FREE
- `AUTH_FAILURE` / `POLICY_BLOCK` / `BILLING_REQUIRED` / `BAD_REQUEST` → correctly do not bypass or loop
- Paid fallback `openrouter-paid` (3 models) remained last-resort and was not hit; unexpected paid requests 0.

### Services

| Port | Service | Health |
|---|---|---|
| 20128 | OmniRoute | 200 (1066 models) |
| 20138 | 9Router guard (policy) | 200 (560 models) |
| 20139 | 9Router backend | 200 (562 models) |
| 18789 | OpenClaw | 200 (healthy but NOT in request path) |

Aion guard unchanged: `blockedPrefixes ["openrouter/aion-labs/","aion-labs/"]` in `~/Unified-AI-Gateway-Tests/stage-f0d-staging/proxy.config.json` still present; 4 `aion-labs` models remain listed but are policy-blocked at request time.

### Persistence

- `launchctl kickstart -k gui/<UID>/ai.9router.backend` → counts stable 562, malformed 0, node count 14, deleted IDs still absent.
- `ai.omniroute.openrouter-free-sync` (script `refresh-openrouter-free.mjs`) touches only `combos` table where `name='openrouter-free'` via `sqlite3 UPDATE combos ...`; it does not create `providerNodes` / `providerConnections` and preserves `openrouter/<id>` canonical form. It correctly reduced 21 live free models to 6 via its `BROKEN_MODEL_PATTERNS` blocklist (excluding `thinkingmachines/inkling`, `liquid/lfm-2.5-2.6b`, `nvidia/nemotron-3.5-lightning`, `google/gemma-4-*`, `google/lyria-*`, `z-ai/glm-5.2`, `poolside/laguna-xs-2.1`, `openrouter/free`).

### Clean state summary

| Check | Result |
|---|---|
| `/tmp/9router-source` working tree | clean (0 diffs) |
| Persistent OmniRoute `src/app` injection | absent (`No such file or directory`) |
| Persistent 9Router install edits | none (not a git repo, `.next-cli-build` only) |
| Stray OpenRouter DB node | absent (0 rows) |
| Stray provider connection | absent (0 rows) |
| Malformed models | 0 |
| Unnecessary `[kind]` addition | absent |
| Production `/tmp` dependency | none |

## Final Working State

- Catalogue: malformed 0, ANSI 0, vendor namespaces intact
- OpenRouter FREE: `OPENROUTER_MODEL_OK` via `coding-chain` with cost 0
- NVIDIA: catalogues aligned, route health `NVIDIA_ROUTE_OK`
- GitHub/Copilot: previous `model_not_supported` correctly attributed to SKU gating, not aliasing
- Cerebras: quota/billing classification separated from invalid
- Routing: FREE-FIRST preserved, paid fallback last-resort
- Services: all healthy, OpenClaw not involved, Aion guard intact
- Persistence: restart clean, sync safe, no `/tmp` dependency
- Overall: **PASS / CLOSED**

## Optional Cleanup

None required. The following non-required items could be considered separately:

- Reconcile the full live free set (21) vs. curated 6 if upstream blocklisted models become callable in future (update `BROKEN_MODEL_PATTERNS` then).
- Review `openrouter-paid` membership if provider pricing changes.

Do not restore the deleted stray node/connection; do not reintroduce generic namespace stripping.

## If This Happens Again

Shortest diagnostic sequence:

```bash
# 1. Snapshot state
pwd; git -C ~/GitHub/debug-runbooks status --short
lsof -i :20128 -i :20138 -i :20139 -i :18789 -sTCP:LISTEN

# 2. Prove runtime ownership (do not assume /tmp)
ps aux | grep -E "omniroute|9router" | grep -v grep
ls -ld ~/.nvm/versions/node/*/lib/node_modules/omniroute/dist

# 3. Check malformed counts
curl -s http://127.0.0.1:20139/v1/models | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for m in d['data'] if '[1m' in m['id'] or 'anthropic/inclusionai' in m['id']))"
curl -s http://127.0.0.1:20128/v1/models | python3 -c "import json,sys; d=json.load(sys.stdin); print('total',len(d['data']))"

# 4. Check catalogue source
sqlite3 ~/.9router/db/data.sqlite "SELECT id, name, type FROM providerNodes;"

# 5. Verify real FREE generation (restricted key must use coding-chain)
curl -s http://127.0.0.1:20128/v1/chat/completions \
  -H "Authorization: Bearer <OMNIROUTE_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"coding-chain","messages":[{"role":"user","content":"Reply exactly:\nOPENROUTER_MODEL_OK"}],"max_tokens":20}' \
  | python3 -m json.tool
```

Shortest recovery (if the same stray node reappears):

```bash
sqlite3 ~/.9router/db/data.sqlite "DELETE FROM providerNodes WHERE id='<STRAY_NODE_ID>';"
sqlite3 ~/.9router/db/data.sqlite "DELETE FROM providerConnections WHERE id='<STRAY_CONNECTION_ID>';"
launchctl kickstart -k gui/<UID>/ai.9router.backend
# re-run verification steps above
```

Do not add generic `split("/").slice(1)` normalization.


## Authoritative Conclusions

- Root cause: stray 9Router anthropic-compatible OpenRouter node + connection
- Source-code normalization patch required: NO
- OpenClaw involved: NO
- Malformed model count after repair: 0
- OpenRouter FREE real generation: PASS (OPENROUTER_MODEL_OK, cost 0)
- Unexpected paid usage: 0
- Restart persistence: PASS
- Overall: PASS / CLOSED

## Lessons Learned

1. Distinguish display IDs, route IDs, and canonical upstream model IDs — vendor namespaces are part of the canonical ID.
2. Do not strip arbitrary namespace components — legitimate IDs contain vendor prefixes by design.
3. Prove runtime ownership before patching source — `/tmp` checkouts are not production.
4. Catalogue presence ≠ account entitlement — `model_not_supported` or quota/billing may still gate a listed model (GitHub SKU, Cerebras quota).
5. Separate invalid / unavailable / quota / billing / auth / policy failures — each has different fallback semantics.
6. Test FREE-FIRST end-to-end (real generation with cost) rather than relying on catalogue listing alone.
7. Verify persistence through normal service restart (LaunchAgent), not just DB deletion.
8. Sync/automation that touches `combos` must not touch `providerNodes`/`providerConnections`.

## AI / CLI Attribution

### AI / CLI Attribution

- **Final clean-room investigation, repair validation, and closure:** OpenCode CLI using Muse Spark 1.2 (OpenCode Zen).
- **Earlier diagnostic attempts:** OpenClaude CLI using multiple routed provider models.
- **Human operator:** repository owner/operator.

No AI independently performed actions that were actually executed by the operator; all service restarts and DB modifications were operator-executed and verified.

## Rollback

Do not restore the bad node by default. Rollback would require restoring the known-good pre-change database backup only if the deletion itself caused a regression:

```bash
# conceptual only — do not execute unless regression proven
cp ~/.omniroute/db_backups/openrouter-free.pre-sync-<timestamp>.json /tmp/rollback.json
# or restore full sqlite backup if providerNodes deletion regressed
cp ~/.9router/db/data.sqlite.bak /tmp/check  # if a backup exists
```

No secret-bearing SQL dumps should be committed.

