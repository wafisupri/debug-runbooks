# 9Router Apple Silicon Headless Recovery, Persistence Repair & Gateway Topology

**Date:** 2026-08-26  
**Status:** Fixed / Healthy  
**Platform:** macOS (Apple Silicon / arm64)  

---

## 1. Summary

This runbook documents the complete recovery, persistence hardening, policy enforcement, and crash-recovery verification of 9Router and the local AI gateway stack on macOS Apple Silicon (`arm64`).

The recovery progressed through four distinct phases:

1. **Original failure:** 9Router failed on startup with macOS error `-86` (`spawn Unknown system error -86`) because its vendor LaunchAgent (`com.9router.autostart`) attempted to launch an `x86_64` tray binary (`systray2`) on an arm64-native Node runtime without Rosetta 2.
2. **Intermediate fix (SUPERSEDED):** `com.9router.autostart.plist` was modified to execute 9Router's headless entrypoint (`custom-server.js`) directly. This restored runtime services prior to reboot.
3. **Reboot persistence failure:** A real system reboot on 2026-08-26 exposed that 9Router's vendor autostart mechanisms reverted/recreated `com.9router.autostart.plist` back to the broken tray configuration (`cli.js --tray --skip-update` with `KeepAlive=false`). The service failed with error `-86` and remained dead, causing policy guard upstream timeouts (`HTTP 502`).
4. **Final permanent solution:** The vendor-owned `com.9router.autostart` LaunchAgent was permanently unloaded, disabled, and removed from active rotation. A new, independently-managed LaunchAgent (`ai.9router.backend`) was created to launch `custom-server.js` with `KeepAlive=true` and explicit environment variables. Two-layer local policy enforcement (Aion exclusion via catalogue filtering and request-time blocking) and SIGTERM automatic crash recovery were verified end-to-end.

---

## 2. Final Architecture & Topology

The production multi-gateway stack operates across dedicated, non-overlapping loopback listeners managed by `launchd`:

```text
+-----------------------------------------------------------------------------------+
|                              LOCAL AI GATEWAY TOPOLOGY                            |
+-----------------------------------------------------------------------------------+

 [ Clients / CLI Fleet ]
   |
   +---> FreeLLM Gateway           127.0.0.1:3001   (LaunchAgent: ai.freellm.gateway)
   |
   +---> OmniRoute Gateway         127.0.0.1:20128  (LaunchAgent: ai.omniroute.gateway)
   |       |
   |       +---> OpenClaw          127.0.0.1:18789  (LaunchAgent: ai.openclaw.gateway)
   |               (primary route: omniroute/auto/best-fast)
   |               (OmniRoute provider: http://127.0.0.1:20128/v1)
   |               (9Router provider:  http://127.0.0.1:20138/v1 - NEVER :20139)
   |
   +---> 9Router Policy Guard     127.0.0.1:20138  (LaunchAgent: ai.f0d.policyguard)
           |   - In-memory catalogue filtering (592 models visible)
           |   - Local request-time policy (Aion -> HTTP 403)
           |   - Policy source SHA-256: 3ec56116ca398aafb93b75d1878d4e16e446d5dcfbe81b5452465f72cd8c0a7e
           v
         9Router Backend Server   127.0.0.1:20139  (LaunchAgent: ai.9router.backend)
               - Standalone Next.js custom server (custom-server.js)
               - Node v22.23.2 arm64-native runtime
               - Database: ~/.9router/db/data.sqlite (596 models raw)
```

### Gateway Service Registry

| Service | Listener | LaunchAgent Label | Managed Entrypoint / Script | RunAtLoad | KeepAlive |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **FreeLLM** | `127.0.0.1:3001` | `ai.freellm.gateway` | FreeLLM Gateway Daemon | `true` | `true` |
| **OmniRoute** | `127.0.0.1:20128` | `ai.omniroute.gateway` | OmniRoute Core Gateway | `true` | `true` |
| **OpenClaw** | `127.0.0.1:18789` | `ai.openclaw.gateway` | OpenClaw Gateway Service | `true` | `true` |
| **Policy Guard** | `127.0.0.1:20138` | `ai.f0d.policyguard` | `policy-proxy.mjs` | `true` | `true` |
| **9Router Backend** | `127.0.0.1:20139` | `ai.9router.backend` | `custom-server.js` | `true` | `true` |

---

## 3. Symptoms

### Initial Outage
Requests directed to the client-facing 9Router interface on port `20138` returned `HTTP 502 Bad Gateway`:

```bash
curl -i http://127.0.0.1:20138/v1/models
```

```http
HTTP/1.1 502 Bad Gateway
content-type: application/json; charset=utf-8

{"error":{"code":"upstream_unavailable"}}
```

Port inspection showed the backend port `20139` missing:

```bash
lsof -nP -iTCP:20128,20138,20139 -sTCP:LISTEN
```

```text
*:20128             OmniRoute (listening)
127.0.0.1:20138     Policy Guard Proxy (listening)
127.0.0.1:20139     NOT LISTENING
```

`launchd` reported the job was stopped:

```bash
launchctl print "gui/$(id -u)/com.9router.autostart"
# state = not running, last exit code = 0
```

The error log (`/tmp/9router.error.log`) recorded spawn error `-86`:

```text
[9router] tray failed to start: spawn Unknown system error -86
Error: spawn Unknown system error -86
    at ChildProcess.spawn (node:internal/child_process:421:11)
    at Object.spawn (node:child_process:761:9)
    at .../systray2/index.js:105:27
```

---

## 4. Root Cause

Binary architecture inspection revealed a CPU architecture mismatch:

```bash
uname -m
# arm64

file /Users/wfspr/.hermes/node/bin/node
# Mach-O 64-bit executable arm64

file ~/.9router/runtime/node_modules/systray2/traybin/tray_darwin_release
# Mach-O 64-bit executable x86_64
```

1. The host environment is Apple Silicon (`arm64`) running an `arm64`-native Node.js runtime (`v22.23.2` / `v24.18.1`).
2. The bundled `systray2` binary inside 9Router's runtime was pre-compiled exclusively for `x86_64`.
3. Without Rosetta 2 installed, the kernel rejected the `execve` call with `ENOEXEC` (macOS system error `-86`: bad CPU type in executable).
4. When tray initialization crashed, the 9Router CLI lifecycle handler exited immediately rather than allowing the HTTP server to remain running in the background.

---

## 5. Why the First Persistence Fix Was Insufficient (SUPERSEDED)

In the initial troubleshooting session, `~/Library/LaunchAgents/com.9router.autostart.plist` was directly modified to execute `custom-server.js` instead of `cli.js --tray`.

While this restored the backend during the active login session, **it was fundamentally fragile**:

- The label `com.9router.autostart` is owned by the vendor package.
- 9Router contains internal autostart management routines capable of regenerating `com.9router.autostart.plist` during updates, self-repair routines, or UI interactions.
- Re-using vendor plist names creates an ownership conflict between custom operational overrides and package-managed defaults.

---

## 6. Reboot Failure Evidence

On 2026-08-26, a full system reboot (`uptime: up 5 mins`) was performed. The reboot exposed the failure of the intermediate fix:

```text
Service Status Post-Reboot:
  :3001   (FreeLLM)      -> HEALTHY (HTTP 200)
  :18789  (OpenClaw)     -> HEALTHY (HTTP 200)
  :20128  (OmniRoute)    -> HEALTHY (HTTP 200)
  :20138  (Policy Guard) -> HEALTHY (HTTP 502 upstream_unavailable)
  :20139  (9Router)      -> MISSING (HTTP 000 connection refused)
```

### Diagnosis Findings

1. `~/Library/LaunchAgents/com.9router.autostart.plist` had reverted to launching:
   ```text
   /Users/wfspr/.hermes/node/bin/node
   /Users/wfspr/.local/lib/node_modules/9router/cli.js
   --tray
   --skip-update
   ```
2. The plist had `RunAtLoad=true` but `KeepAlive=false`.
3. On boot, `launchd` executed the tray CLI. It threw error `-86` and exited with return code `0`.
4. Because `KeepAlive` was `false`, `launchd` made no attempt to restart or maintain the service.
5. The policy guard (`:20138`) remained alive, returning `HTTP 403` for local Aion policy checks, but `HTTP 502` for all valid model requests because port `:20139` was unreachable.

---

## 7. Final Dedicated LaunchAgent Solution

To permanently eliminate ownership conflicts and guarantee headless persistence across reboots, the vendor autostart job was retired and replaced with an independent, dedicated LaunchAgent.

### Step 1: Retire and Disable Vendor Autostart

1. Back up vendor plist:
   ```bash
   mkdir -p ~/Library/LaunchAgents/9router-backups
   cp ~/Library/LaunchAgents/com.9router.autostart.plist \
      ~/Library/LaunchAgents/9router-backups/com.9router.autostart-before-stage1u-r2-20260826-050655.plist
   ```
   *(Vendor plist SHA-256 before retirement: `07c29dae6fa4df2ca89af76dbcab1aeb6259bab3f8ab4c94fa048966b07f9378`)*

2. Bootout and remove vendor plist:
   ```bash
   launchctl bootout "gui/$(id -u)/com.9router.autostart" 2>/dev/null || true
   launchctl disable "gui/$(id -u)/com.9router.autostart"
   rm -f ~/Library/LaunchAgents/com.9router.autostart.plist
   ```

> **WARNING:** Never use the "Enable Auto-start" option inside 9Router's UI or menu bar; doing so recreates the broken `com.9router.autostart.plist`.

### Step 2: Create Dedicated Backend LaunchAgent (`ai.9router.backend`)

File: `~/Library/LaunchAgents/ai.9router.backend.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>ai.9router.backend</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/wfspr/.hermes/node/bin/node</string>
        <string>/Users/wfspr/.local/lib/node_modules/9router/app/custom-server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/wfspr/.local/lib/node_modules/9router/app</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOSTNAME</key>
        <string>127.0.0.1</string>
        <key>PORT</key>
        <string>20139</string>
        <key>NODE_ENV</key>
        <string>production</string>
        <key>PATH</key>
        <string>/Users/wfspr/.hermes/node/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>/tmp/9router-backend.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/9router-backend.error.log</string>
</dict>
</plist>
```

*(Verified SHA-256 of `custom-server.js`: `c3b4f23acd30384d814ac16f729cc956db717a342abc68a74153f87bbe45ff3f`)*

### Step 3: Lint and Bootstrap

```bash
plutil -lint ~/Library/LaunchAgents/ai.9router.backend.plist
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/ai.9router.backend.plist
```

---

## 8. Policy Guard & Catalogue Filtering

The policy guard (`127.0.0.1:20138`, LaunchAgent `ai.f0d.policyguard`, source SHA-256: `3ec56116ca398aafb93b75d1878d4e16e446d5dcfbe81b5452465f72cd8c0a7e`) enforces a strict, two-layer local Aion isolation policy.

### Layer 1: Catalogue Filtering (`GET /v1/models`)

The policy guard intercepts `GET /v1/models`, queries upstream backend `:20139`, strips out all blocked Aion model records, and appends the header `x-local-policy-catalogue: filtered`.

- **Backend raw models (`:20139`):** 596 models (contains 4 Aion models)
- **Guarded visible models (`:20138`):** 592 models (0 Aion models)
- **Multiset validation:** Guard multiset strictly equals `Backend Multiset - {Aion Models}`.

```bash
# Verify model counts
curl -s http://127.0.0.1:20139/v1/models | jq '.data | length'
# Output: 596

curl -s http://127.0.0.1:20138/v1/models | jq '.data | length'
# Output: 592

curl -s http://127.0.0.1:20138/v1/models | jq '.data[] | select(.id | test("aion"; "i"))'
# Output: (empty)
```

### Layer 2: Request-Time Enforcement (`POST /v1/chat/completions`)

Requests targeting any blocked Aion model are rejected immediately by the guard proxy before reaching the backend:

- **HTTP Status:** `403 Forbidden`
- **Header:** `x-local-policy: blocked`

```bash
curl -i -s http://127.0.0.1:20138/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"aion-test-model","messages":[{"role":"user","content":"ping"}]}'
```

```http
HTTP/1.1 403 Forbidden
x-local-policy: blocked
content-type: application/json

{"error":{"message":"Model blocked by local policy","type":"policy_violation"}}
```

---

## 9. Crash-Recovery Verification

To verify that `KeepAlive=true` on `ai.9router.backend` functions under actual process termination, a SIGTERM fault-injection test (Stage 1V) was executed:

1. **Pre-test state:** Backend running under PID `10231` (`runs = 1`).
2. **Action:** Sent `SIGTERM` directly to the backend process:
   ```bash
   kill -TERM 10231
   ```
3. **Automatic recovery:** `launchd` immediately detected termination and restarted the custom server under PID `10364` (`runs = 2`, `last exit code = 0`).
4. **Post-recovery verification:**
   - `:20139 /v1/models` -> `HTTP 200` (596 models)
   - `:20138 /v1/models` -> `HTTP 200` (592 models, header `x-local-policy-catalogue: filtered`)
   - Aion test request to `:20138` -> `HTTP 403` (`x-local-policy: blocked`)
   - Vendor autostart job and plist remained absent.
   - Dependent gateways (FreeLLM `:3001`, OmniRoute `:20128`, OpenClaw `:18789`) operated without disruption.

This confirms that crash recovery is actively enforced by the operating system kernel and `launchd`.

---

## 10. OpenClaw Routing & CLI Integrations

### OpenClaw Gateway Routing Rules

OpenClaw (`:18789`) is configured to route across local gateways:

- **Primary routing:** `omniroute/auto/best-fast`
- **OmniRoute provider endpoint:** `http://127.0.0.1:20128/v1`
- **9Router provider endpoint:** `http://127.0.0.1:20138/v1` (Guarded interface)
- **Invariant:** OpenClaw and client applications must **never** point directly to `:20139`.

### OpenClaude Scoped Shell Integration

To use 9Router with OpenClaude CLI without setting persistent global environment variables that conflict with other tools, a scoped shell wrapper is maintained in `~/.zshrc`:

```bash
# >>> OPENCLAUDE 9ROUTER DEFAULT >>>
openclaude() {
  if [[ -z "${NINEROUTER_KEY:-}" ]]; then
    echo "ERROR: NINEROUTER_KEY is not set."
    return 1
  fi

  CLAUDE_CODE_USE_OPENAI=1 \
  OPENAI_BASE_URL="http://127.0.0.1:20138/v1" \
  OPENAI_API_FORMAT="chat_completions" \
  OPENAI_API_KEY="$NINEROUTER_KEY" \
  OPENAI_MODEL="ag/gemini-3.7-flash-high" \
  command openclaude "$@"
}
# <<< OPENCLAUDE 9ROUTER DEFAULT <<<
```

---

## 11. Verification Commands

Run this one-line suite to verify the entire local AI gateway infrastructure:

```bash
# 1. Check all listening ports
lsof -nP -iTCP:3001,18789,20128,20138,20139 -sTCP:LISTEN

# 2. Verify launchd service status
launchctl print "gui/$(id -u)/ai.9router.backend" | grep -E "state =|pid =|program ="
launchctl print "gui/$(id -u)/ai.f0d.policyguard" | grep -E "state =|pid ="
launchctl print "gui/$(id -u)/ai.omniroute.gateway" | grep -E "state =|pid ="
launchctl print "gui/$(id -u)/ai.openclaw.gateway" | grep -E "state =|pid ="
launchctl print "gui/$(id -u)/ai.freellm.gateway" | grep -E "state =|pid ="

# 3. Confirm vendor autostart is absent
launchctl print "gui/$(id -u)/com.9router.autostart" 2>&1 | grep -q "Could not find" && echo "PASS: Vendor autostart retired"

# 4. Check HTTP endpoints and catalogue filtering
curl -s -o /dev/null -w "Backend :20139 -> HTTP %{http_code}\n" http://127.0.0.1:20139/v1/models
curl -s -i http://127.0.0.1:20138/v1/models | grep -E "HTTP/|x-local-policy-catalogue:"

# 5. Check request-time Aion blocking
curl -s -i http://127.0.0.1:20138/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"aion-blocked-test","messages":[{"role":"user","content":"test"}]}' | grep -E "HTTP/|x-local-policy:"
```

---

## 12. Rollback

If emergency rollback to a manual debugging instance is required:

```bash
# 1. Stop dedicated backend LaunchAgent
launchctl bootout "gui/$(id -u)/ai.9router.backend" 2>/dev/null || true

# 2. Run standalone custom-server in foreground with debug output
HOSTNAME=127.0.0.1 \
PORT=20139 \
NODE_ENV=production \
/Users/wfspr/.hermes/node/bin/node \
/Users/wfspr/.local/lib/node_modules/9router/app/custom-server.js

# 3. If restoring archived vendor plist for inspection (NOT recommended for production):
cp ~/Library/LaunchAgents/9router-backups/com.9router.autostart-before-stage1u-r2-20260826-050655.plist \
   ~/Library/LaunchAgents/com.9router.autostart.plist
```

---

## 13. What Not to Do

- **DO NOT re-enable "Auto-start" from 9Router UI/tray:** This regenerates the broken `com.9router.autostart.plist` tray job.
- **DO NOT point clients or OpenClaw directly to `:20139`:** Bypasses local policy filtering and logging.
- **DO NOT install Rosetta 2 as a workaround:** Running `custom-server.js` directly is fully native `arm64` and requires zero x86 translation.
- **DO NOT rely on process names alone (`next-server`):** `custom-server.js` starts a Next.js server instance which reports process title `next-server (v16.2.1)`. Verify via `launchctl print gui/$(id -u)/ai.9router.backend` or the command path.
- **DO NOT delete `~/.9router/db/data.sqlite`:** Provider configurations, API keys, and routing weights are stored here and are unaffected by startup bugs.
- **DO NOT export global OpenAI variables in shell config:** Scoping prevents conflicts across divergent CLI tools (Codex, Kimi, OpenCode, Claude).

---

## 14. Quick Diagnostic Flow

```text
                        [ Gateway Failure / 502 ]
                                    |
                    Check listeners: lsof -nP -iTCP:...
                                    |
         +--------------------------+--------------------------+
         |                                                     |
  :20139 is missing                                     :20138 is missing
         |                                                     |
Check ai.9router.backend:                             Check ai.f0d.policyguard:
launchctl print gui/.../ai.9router.backend            launchctl print gui/.../ai.f0d.policyguard
         |                                                     |
         +--------------------------+--------------------------+
                                    |
                    Tail logs in /tmp/9router-backend*.log
                                    |
         +--------------------------+--------------------------+
         |                                                     |
  Error -86 in logs                             Port conflict or config issue
         |                                                     |
Confirm binary and LaunchAgent:                 Check process holding port:
Run custom-server.js directly                   lsof -iTCP:20139
Disable com.9router.autostart                   Restart target LaunchAgent
```

---

## 15. Final Status

- **Operational Status:** `FIXED / HEALTHY`

### Verified Components
- [x] Dedicated persistent LaunchAgent installed (`ai.9router.backend`).
- [x] 9Router backend operating headlessly on `127.0.0.1:20139` under native `arm64` Node runtime.
- [x] Policy guard operating on `127.0.0.1:20138` with upstream target `:20139`.
- [x] Two-layer Aion policy verified (catalogue filtering: 596 -> 592 models; request-time blocking: `HTTP 403`).
- [x] Automatic crash recovery verified via SIGTERM process test (`KeepAlive=true` active).
- [x] Vendor tray-autostart conflict isolated and deactivated (`com.9router.autostart` disabled and removed).
- [x] Gateway peers healthy: FreeLLM (`:3001`), OmniRoute (`:20128`), OpenClaw (`:18789`).
- [x] OpenClaude CLI scoped wrapper validated against guarded endpoint.

### Deferred
- [ ] One normal macOS reboot and login cycle verification with the finalized `ai.9router.backend` configuration (previous reboot on 2026-08-26 verified the failure of `com.9router.autostart`; post-repair reboot deferred to avoid interrupting active terminal workflows).
