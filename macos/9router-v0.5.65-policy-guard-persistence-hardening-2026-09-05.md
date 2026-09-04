# 9Router v0.5.65 Policy Guard Persistence Hardening — Universal AI Launcher v0.5.2

**Date:** 2026-09-05  
**Status:** Fixed / Verified  
**Platform:** macOS (Apple Silicon / arm64)  
**Components:** 9Router v0.5.65, Universal AI CLI Launcher v0.5.2, launchd, Node.js, policy guard

---

## 1. Summary

After upgrading 9Router to v0.5.65, the local 9Router backend remained available on `127.0.0.1:20139`, but the client-facing policy guard on `127.0.0.1:20138` failed.

The failure was not caused by the 9Router backend itself. The `ai.f0d.policyguard` LaunchAgent still existed, but its source files had disappeared from the old temporary project path:

```text
~/Unified-AI-Gateway-Tests/stage-f0d-staging/
```

The LaunchAgent therefore entered a crash loop with `MODULE_NOT_FOUND`.

The repair was completed in two phases:

1. Reconstruct and verify the policy guard on the original topology.
2. Move ownership of the guard into the persistent Universal AI CLI Launcher configuration so future gateway updates do not depend on a temporary staging project.

The final persistent policy source is now:

```text
~/.config/ai-launcher/policy-guard/
├── policy-proxy.mjs
└── proxy.config.json
```

The guard is managed by:

```text
~/Library/LaunchAgents/ai.f0d.policyguard.plist
```

and is verified through:

```bash
ai guard status
ai guard verify
ai guard repair
```

---

## 2. Final Architecture

```text
CLI / Client Fleet
       |
       v
Universal AI CLI Launcher
       |
       v
9Router Policy Guard
127.0.0.1:20138
       |
       |  catalogue filtering
       |  request-time Aion blocking
       v
9Router Backend
127.0.0.1:20139
       |
       +--> Groq
       +--> OpenRouter
       +--> NVIDIA
       +--> Antigravity
       +--> other 9Router providers
```

### Invariants

- Clients use `:20138`, not raw backend `:20139`.
- Aion models must not be exposed through the guarded catalogue.
- Requests targeting Aion must be rejected locally with HTTP 403.
- The policy guard must survive gateway package updates independently of the 9Router installation directory.
- 9Router vendor tray autostart must remain disabled on this Apple Silicon host.

---

## 3. Environment

Verified during recovery:

```text
macOS                     Apple Silicon / arm64
9Router                   0.5.65
Universal AI Launcher     0.5.2
Qwen Code                 0.23.0
Kimi Code                 0.40.1
Cline                     3.0.60
Claude Code               2.1.251
Codex CLI                 0.152.1
OpenClaude                0.29.1
OpenCode                  1.18.15
Aider                     0.82.3
```

Relevant listeners:

```text
OmniRoute                 127.0.0.1:20128
9Router Policy Guard      127.0.0.1:20138
9Router Backend           127.0.0.1:20139
FreeLLM                   127.0.0.1:3001
```

---

## 4. Symptoms

After:

```bash
npm i -g 9router@latest --prefer-online
```

9Router v0.5.65 recreated the vendor autostart path and again exposed the known tray failure:

```text
[9router] tray failed to start: spawn Unknown system error -86
```

The vendor tray path is incompatible with the native Apple Silicon setup because the bundled tray binary is x86_64 while the active Node runtime is arm64.

Separately, the custom backend remained running on `:20139`, but the policy guard on `:20138` disappeared.

LaunchAgent state:

```text
ai.9router.backend
state = running
last exit code = 0

ai.f0d.policyguard
state = spawn scheduled
runs = 4612
last exit code = 1
```

The guard log showed:

```text
Error: Cannot find module
'/Users/wfspr/Unified-AI-Gateway-Tests/stage-f0d-staging/policy-proxy.mjs'

code: 'MODULE_NOT_FOUND'
```

Only `:20139` was listening.

---

## 5. Root Cause

The earlier Unified AI Gateway optimisation work had a production dependency on a temporary staging location:

```text
~/Unified-AI-Gateway-Tests/stage-f0d-staging/
```

The LaunchAgent survived, but the source directory did not.

This created an incomplete persistence model:

```text
launchd definition persisted
        +
source code disappeared
        =
permanent crash loop
```

The evidence indicates the earlier optimisation project was operationally useful but not fully hardened as independent production infrastructure.

A second issue was discovered while hardening the launcher: several installer iterations could silently reinstall older source trees or fail because of macOS-specific bootstrap assumptions.

---

## 6. What Did Not Work

### Reusing the missing staging project

Attempting:

```bash
cd ~/Unified-AI-Gateway-Tests
```

failed because the directory no longer existed.

There was therefore no local Git repository from which to run:

```bash
git restore
```

### Re-bootstrapping already loaded jobs

Running `launchctl bootstrap` against jobs that were already registered produced:

```text
Bootstrap failed: 5: Input/output error
```

The appropriate operation for an already loaded job is `kickstart`, or `bootout` followed by a clean `bootstrap` when replacing its plist.

### Trusting process state alone

The 9Router backend process was listening on `:20139`, but an unauthenticated catalogue probe initially timed out.

Authenticated probes later proved both endpoints healthy:

```text
/v1/models      -> HTTP 200
/api/v1/models  -> HTTP 200
```

A listener or running PID alone is not sufficient; functional API verification is required.

### Universal launcher v0.5 stale-source install

The first v0.5 install was executed from an old reused source directory, reinstalling v0.4 code. The absence of `ai guard` exposed the downgrade.

### v0.5.1 self-contained installer

The first self-contained macOS bootstrap used a `base64` CLI invocation that was not portable to the target BSD/macOS implementation.

### v0.5.1 guard readiness

The guard could appear loaded in `launchctl` before the listener was actually accepting connections. Immediate verification returned connection refused.

---

## 7. Final Fix

### 7.1 Reconstruct the policy guard

The guard was rebuilt with:

```text
listen:    127.0.0.1:20138
upstream:  127.0.0.1:20139
policy:    block model IDs matching /aion/i
```

Two enforcement layers are preserved:

1. Filter matching model IDs from `GET /v1/models`.
2. Reject matching request bodies before forwarding.

### 7.2 Move guard ownership into Universal AI Launcher

Universal AI CLI Launcher v0.5.2 installs the guard at:

```text
~/.config/ai-launcher/policy-guard/
```

This directory is independent of:

- the 9Router npm package
- OmniRoute
- FreeLLM
- the deleted Unified-AI-Gateway-Tests staging project

### 7.3 Regenerate the LaunchAgent

The persistent LaunchAgent now points to the launcher-owned guard source.

The generated job uses the known-good native Node runtime when available:

```text
~/.hermes/node/bin/node
```

and contains explicit working-directory and PATH configuration.

### 7.4 Add readiness-aware lifecycle commands

Universal AI Launcher v0.5.2 provides:

```bash
ai guard install
ai guard status
ai guard verify
ai guard repair
```

`ai guard repair` waits for `127.0.0.1:20138` to begin accepting connections before declaring success.

If startup fails, recent stdout/stderr are surfaced immediately.

---

## 8. Verified Recovery

After:

```bash
ai guard repair
```

observed result:

```text
Listener: 127.0.0.1:20138 ready

✓ script
✓ config
✓ plist
✓ catalogue HTTP 200 models=686
✓ Aion catalogue exposure=0
✓ request policy HTTP 403 x-local-policy=blocked
```

Independent status:

```text
launchd: loaded
state = running
runs = 1
last exit code = (never exited)
```

Repeated `ai guard verify` produced the same PASS state.

---

## 9. Verification Commands

### Normal check

```bash
ai guard status
ai guard verify
```

### Gateway catalogue check

```bash
ai health 9router
ai models 9router | head -20
```

### Direct port check

```bash
lsof -nP -iTCP:20138 -iTCP:20139 -sTCP:LISTEN
```

### Manual policy invariants

Catalogue must expose zero Aion models:

```bash
curl --max-time 30 -sS \
  -H "Authorization: Bearer $NINEROUTER_API_KEY" \
  http://127.0.0.1:20138/v1/models \
  | jq '[.data[].id | select(test("aion"; "i"))] | length'
```

Expected:

```text
0
```

Synthetic blocked request:

```bash
curl -i --max-time 10 \
  http://127.0.0.1:20138/v1/chat/completions \
  -H "Authorization: Bearer $NINEROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "aion-test-model",
    "messages": [{"role": "user", "content": "ping"}]
  }'
```

Expected:

```text
HTTP/1.1 403 Forbidden
x-local-policy: blocked
```

---

## 10. Future Upgrade Procedure

Normal 9Router update:

```bash
npm i -g 9router@latest --prefer-online

ai guard verify
```

If verification fails:

```bash
ai guard repair
ai guard verify
```

Manual JavaScript reconstruction should no longer be part of normal maintenance.

### Do not re-enable vendor tray autostart

The vendor `com.9router.autostart` path remains unsuitable on this host.

If an update recreates it:

```bash
launchctl bootout "gui/$(id -u)/com.9router.autostart" 2>/dev/null || true
launchctl disable "gui/$(id -u)/com.9router.autostart" 2>/dev/null || true
rm -f ~/Library/LaunchAgents/com.9router.autostart.plist
```

---

## 11. Security / Secret Hygiene

- No API key values are stored in the launcher configuration or this runbook.
- Diagnostic commands refer only to environment-variable names.
- A complete OmniRoute credential was exposed during terminal diagnostics and should be rotated after the hardened configuration remains stable.
- Do not commit full shell dumps, debug ZIPs, environment exports, database files, or generated API responses if they contain credentials.
- Continue routing clients through guarded `:20138`; direct client access to `:20139` bypasses the local policy layer.

---

## 12. Current Related CLI / Gateway State

```text
Universal AI Launcher 0.5.2        VERIFIED
Qwen -> OpenRouter                 VERIFIED
Qwen -> OmniRoute                  VERIFIED
9Router backend :20139             VERIFIED
9Router guard :20138               VERIFIED / HARDENED

Kimi -> direct Groq                BLOCKED: prompt_cache_key
Kimi -> OmniRoute -> Groq          BLOCKED: prompt_cache_key
Kimi -> 9Router -> Groq            NEXT TEST
Cline -> 9Router                   NEXT TEST
OpenClaude -> FreeLLMAPI           PENDING distinct FreeLLMAPI port
```

The 9Router policy-guard hardening itself is complete even though the wider Universal AI Launcher validation matrix is still in progress.

---

## 13. Final Working State

```text
Universal AI Launcher       0.5.2
Policy source               ~/.config/ai-launcher/policy-guard/
Policy LaunchAgent          ai.f0d.policyguard
Policy listener             127.0.0.1:20138
9Router backend             127.0.0.1:20139
Guard catalogue             HTTP 200
Visible models              686 during final verification
Aion catalogue exposure     0
Aion request enforcement    HTTP 403
launchd state               running
launchd exits               none
Status                      FIXED / VERIFIED
```

---

## 14. If This Happens Again

1. Do not rebuild the proxy manually.
2. Run:

   ```bash
   ai guard verify
   ```

3. If it fails:

   ```bash
   ai guard repair
   ai guard verify
   ```

4. If `:20139` is unavailable, troubleshoot `ai.9router.backend`.
5. If an update recreated `com.9router.autostart`, retire it again.
6. Keep clients pointed at `:20138`, never raw `:20139`.
7. Only investigate source files manually if `ai guard repair` itself fails.

---

## 15. AI / CLI Credit

- **OpenAI ChatGPT — GPT-5.6 Sol:** root-cause analysis, recovery design, policy reconstruction, launcher hardening architecture, v0.5-v0.5.2 packaging corrections, verification strategy, and documentation.
- **Qwen Code CLI:** earlier Universal AI Launcher, OpenRouter, OmniRoute, B.AI, and model-switching validation.
- **Kimi Code CLI 0.40.1:** exposed current Groq and OmniRoute/Groq payload compatibility issues.
- **Cline CLI 3.0.60:** part of the pending 9Router client validation path.
- **9Router v0.5.65:** backend under recovery and verification; its update exposed the persistence weakness.
