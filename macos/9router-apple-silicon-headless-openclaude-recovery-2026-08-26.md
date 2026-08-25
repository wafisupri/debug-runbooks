# 9Router Apple Silicon Headless Recovery & OpenClaude Integration

**Date:** 2026-08-26  
**Status:** Fixed  
**Platform:** macOS  

---

## 1. Summary

Recovered 9Router on an Apple Silicon (`arm64`) Mac after the LaunchAgent repeatedly crashed on startup with macOS error `-86` (`spawn Unknown system error -86`). The crash prevented the 9Router backend from listening on `127.0.0.1:20139`, which caused the policy guard on `127.0.0.1:20138` to return `HTTP 502 upstream_unavailable`.

The failure was traced to 9Router's optional macOS tray manager (`systray2`), which attempted to execute an `x86_64` binary on an arm64-native Node.js runtime without Rosetta.

The verified solution was to:

1. Reconfigure the `com.9router.autostart` LaunchAgent to bypass the CLI and tray binary entirely.
2. Launch 9Router's standalone headless server (`custom-server.js`) directly on `127.0.0.1:20139`.
3. Verify end-to-end inference through the policy proxy (`127.0.0.1:20138`) using `ag/gemini-3.7-flash-high`.
4. Validate OpenClaude CLI integration and configure a scoped shell wrapper in `~/.zshrc`.

Rosetta 2 was not required. The 9Router database, provider configurations, models, and policy guard remained intact.

---

## 2. Environment

- **Operating system:** macOS (Apple Silicon / `arm64`, Darwin 25.6.0)
- **Node.js runtime:** Node.js v24.18.1 (`/Users/wfspr/.hermes/node/bin/node`, Mach-O 64-bit arm64)
- **9Router version:** `v0.5.55` (`~/.local/lib/node_modules/9router`)
- **OpenClaude version:** `v0.29.1`
- **LaunchAgent:** `~/Library/LaunchAgents/com.9router.autostart.plist`
- **Database:** `~/.9router/db/data.sqlite`
- **Shell:** zsh (`~/.zshrc`)
- **Rosetta 2:** Not installed / Not used

### Intended Gateway Topology

```text
OmniRoute
*:20128

9Router policy guard
127.0.0.1:20138
        ↓
9Router backend
127.0.0.1:20139
```

- Port `20128` is dedicated to OmniRoute.
- Port `20138` hosts the 9Router policy guard proxy.
- Port `20139` hosts the actual 9Router backend server.
- Clients (OpenClaude, Kimi, etc.) connect to `127.0.0.1:20138`, which forwards to `127.0.0.1:20139`. Clients must not bypass the guard.

---

## 3. Symptoms

Querying models through the policy guard failed with `HTTP 502`:

```bash
curl -i http://127.0.0.1:20138/v1/models
```

```http
HTTP/1.1 502 Bad Gateway
content-type: application/json; charset=utf-8

{"error":{"code":"upstream_unavailable"}}
```

Port inspection revealed the backend listener was missing:

```bash
lsof -nP -iTCP:20128,20138,20139 -sTCP:LISTEN
```

```text
*:20128             OmniRoute listening
127.0.0.1:20138     policy proxy listening
127.0.0.1:20139     NOT LISTENING
```

LaunchAgent inspection showed the service was dead:

```bash
launchctl print "gui/$(id -u)/com.9router.autostart"
```

```text
state = not running
last exit code = 0
```

The LaunchAgent configuration was executing:

```text
/Users/wfspr/.hermes/node/bin/node
/Users/wfspr/.local/lib/node_modules/9router/cli.js
--tray
--skip-update
```

The error log (`/tmp/9router.error.log`) repeatedly recorded:

```text
[9router] tray failed to start: spawn Unknown system error -86
Error: spawn Unknown system error -86
    at ChildProcess.spawn (node:internal/child_process:421:11)
    at Object.spawn (node:child_process:761:9)
    at .../systray2/index.js:105:27
```

---

## 4. Root Cause

Architecture inspection verified that the host and Node runtime were `arm64`, whereas the bundled `systray2` binary was `x86_64`:

```bash
uname -m
# arm64

file /Users/wfspr/.hermes/node/bin/node
# /Users/wfspr/.hermes/node/bin/node: Mach-O 64-bit executable arm64

file ~/.9router/runtime/node_modules/systray2/traybin/tray_darwin_release
# .../tray_darwin_release: Mach-O 64-bit executable x86_64
```

Because the host did not have Rosetta installed, spawning an `x86_64` Mach-O executable failed with `ENOEXEC / error -86` (bad CPU type in executable).

When `systray2` failed to spawn, the 9Router CLI wrapper aborted its process lifecycle rather than keeping the HTTP server alive. As a result:

1. The backend server on `127.0.0.1:20139` exited immediately.
2. The policy guard on `127.0.0.1:20138` lost its upstream target and returned `upstream_unavailable`.
3. Database contents, provider API credentials, and network proxies were completely healthy.

---

## 5. Important Troubleshooting Discovery

Simply removing `--tray` from `ProgramArguments` in `com.9router.autostart.plist` was insufficient: when invoked non-interactively under `launchd`, the 9Router CLI auto-detects background execution and attempts to daemonize or spawn the tray binary.

The robust solution was to bypass the CLI and tray layer entirely and run 9Router's standalone server entrypoint directly:

```text
~/.local/lib/node_modules/9router/app/custom-server.js
```

---

## 6. Headless Server Smoke Test

The 9Router package contains two server entrypoints:

```text
~/.local/lib/node_modules/9router/app/custom-server.js
~/.local/lib/node_modules/9router/app/server.js
```

`custom-server.js` is the production custom server for 9Router.

A manual headless test was executed:

```bash
PORT=20139 \
HOSTNAME=127.0.0.1 \
NODE_PATH="$HOME/.9router/runtime/node_modules:$HOME/.local/lib/node_modules/9router/node_modules" \
/Users/wfspr/.hermes/node/bin/node \
~/.local/lib/node_modules/9router/app/custom-server.js
```

Verification during smoke testing:

1. **Listener check:** Port `127.0.0.1:20139` was actively listening.
2. **Direct backend check:**
   ```bash
   curl -s http://127.0.0.1:20139/v1/models | grep -q "data" && echo "PASS: :20139 HTTP 200"
   ```
3. **Policy guard check:**
   ```bash
   curl -s http://127.0.0.1:20138/v1/models | grep -q "data" && echo "PASS: :20138 HTTP 200"
   ```

Both checks returned `HTTP 200`, confirming that the application code, SQLite database, and routing layer were fully functional in headless mode.

---

## 7. Persistent Final Fix

### Step 1: Back Up the Existing LaunchAgent

```bash
cp ~/Library/LaunchAgents/com.9router.autostart.plist \
   ~/Library/LaunchAgents/com.9router.autostart.plist.pre-headless-20260826-025501.bak
```

*(Historical note: Original plist SHA-256 was `07c29dae6fa4df2ca89af76dbcab1aeb6259bab3f8ab4c94fa048966b07f9378`).*

### Step 2: Update `com.9router.autostart.plist`

Replace `ProgramArguments`, `WorkingDirectory`, and `EnvironmentVariables` in `~/Library/LaunchAgents/com.9router.autostart.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.9router.autostart</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/wfspr/.hermes/node/bin/node</string>
        <string>/Users/wfspr/.local/lib/node_modules/9router/app/custom-server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/wfspr/.local/lib/node_modules/9router/app</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PORT</key>
        <string>20139</string>
        <key>HOSTNAME</key>
        <string>127.0.0.1</string>
        <key>NODE_PATH</key>
        <string>/Users/wfspr/.9router/runtime/node_modules:/Users/wfspr/.local/lib/node_modules/9router/node_modules</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/9router.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/9router.error.log</string>
</dict>
</plist>
```

### Step 3: Lint and Reload the Service

```bash
plutil -lint ~/Library/LaunchAgents/com.9router.autostart.plist

launchctl bootout "gui/$(id -u)/com.9router.autostart" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.9router.autostart.plist
```

---

## 8. Verified Final 9Router State

Post-repair verification confirmed all three services listening:

```text
OmniRoute       *:20128
Policy guard    127.0.0.1:20138
9Router backend 127.0.0.1:20139
```

LaunchAgent status check:

```bash
launchctl print "gui/$(id -u)/com.9router.autostart"
```

```text
state = running
program = /Users/wfspr/.hermes/node/bin/node
pid = 83864
last exit code = (never exited)
job state = running
```

*(Note: PID `83864` is recorded from historical execution; new runs will produce different PIDs).*

Both API endpoints returned HTTP 200 with valid model payloads:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:20139/v1/models
# 200

curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:20138/v1/models
# 200
```

Tradeoff: 9Router runs reliably in the background without an Apple Silicon menu bar tray icon. The web dashboard, SQLite database, and OpenAI-compatible API remain fully accessible.

---

## 9. OpenClaude Compatibility Verification

OpenClaude integration was verified against the guarded endpoint (`127.0.0.1:20138`).

The dedicated model configured for OpenClaude is `ag/gemini-3.7-flash-high` (`hermes-main` is reserved for Hermes Agent).

### Step 1: Direct Guarded Chat Completion Check

```bash
curl -s http://127.0.0.1:20138/v1/chat/completions \
  -H "Authorization: Bearer $NINEROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ag/gemini-3.7-flash-high",
    "messages": [{"role": "user", "content": "Respond with OPENCLAUDE_MODEL_OK"}]
  }'
```

Output:

```text
OPENCLAUDE_MODEL_OK
```

Upstream routed model was identified as `gemini-3.7-flash-tiered`.

### Step 2: OpenClaude CLI Launch Verification

```bash
CLAUDE_CODE_USE_OPENAI=1 \
OPENAI_BASE_URL="http://127.0.0.1:20138/v1" \
OPENAI_API_FORMAT="chat_completions" \
OPENAI_API_KEY="$NINEROUTER_KEY" \
OPENAI_MODEL="ag/gemini-3.7-flash-high" \
openclaude -p "Respond with OPENCLAUDE_9ROUTER_OK"
```

Output:

```text
OPENCLAUDE_9ROUTER_OK
```

---

## 10. Scoped Shell Wrapper (`openclaude`)

To make `openclaude` run with 9Router by default without polluting the global environment (which would interfere with Codex, Kimi, or other OpenAI-compatible CLIs), a managed function was added to `~/.zshrc`.

*(Historical note: Backup created at `~/.zshrc.before-openclaude-9router.20260826-030506.bak`).*

Add the following block to `~/.zshrc`:

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

Reload shell configuration:

```bash
source ~/.zshrc
```

---

## 11. What Did Not Work

- **Restarting the `--tray` LaunchAgent:** The underlying `systray2` binary remained `x86_64` and failed repeatedly with error `-86`.
- **Assuming `20138` was the 9Router backend:** Port `20138` is the policy guard; pointing 9Router directly to `20138` causes port collision.
- **Installing Rosetta 2:** Unnecessary overhead for an optional tray menu.
- **Reinstalling providers or deleting `data.sqlite`:** The SQLite database and provider configurations were completely intact.
- **Treating OpenClaude's CLI startup banner as proof of working inference:** OpenClaude renders its UI before testing inference; an actual prompt run is required to verify the route.
- **Using `hermes-main` for OpenClaude:** `hermes-main` is reserved for Hermes Agent.
- **Using `free-models` or placeholder model IDs:** Routes must target valid upstream models configured in 9Router.
- **Globally exporting `OPENAI_BASE_URL` in `~/.zshrc`:** Breaks other CLI tools expecting standard OpenAI or custom endpoints.

---

## 12. If This Happens Again

### Quick Diagnostic Flowchart

1. **Check port listeners:**
   ```bash
   lsof -nP -iTCP:20128,20138,20139 -sTCP:LISTEN
   ```
   - `20128`: OmniRoute
   - `20138`: Policy guard
   - `20139`: 9Router backend

2. **If `20138` returns `upstream_unavailable`:**
   Check whether `20139` is listening before modifying provider configs.

3. **Check LaunchAgent status and logs:**
   ```bash
   launchctl print "gui/$(id -u)/com.9router.autostart"
   tail -n 50 /tmp/9router.error.log
   ```

4. **If error log shows `Unknown system error -86`:**
   Verify binaries architecture:
   ```bash
   uname -m
   file /Users/wfspr/.hermes/node/bin/node
   file ~/.9router/runtime/node_modules/systray2/traybin/tray_darwin_release
   ```

5. **Verify LaunchAgent points to `custom-server.js`:**
   Ensure `ProgramArguments` in `~/Library/LaunchAgents/com.9router.autostart.plist` runs `custom-server.js` with `PORT=20139`.

6. **Test OpenClaude:**
   ```bash
   openclaude -p "ping"
   ```
