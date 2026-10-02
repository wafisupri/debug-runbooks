# macOS 9Router v0.5.95 LaunchAgent Recovery — Policy Guard Port Hijack on 20138

**Date:** 2026-10-03  
**Status:** Fixed / Verified  
**Platform:** macOS (Apple Silicon / arm64)  
**Components:** 9Router v0.5.95, launchd, policy guard (`ai.f0d.policyguard`), Node.js v24.18.1 (nvm)

---

## 1. Summary

9Router was updated to `v0.5.95`, but the dashboard kept showing the old `v0.5.91` and the service could not start cleanly. The server log looped on:

```text
Error: listen EADDRINUSE: address already in use 127.0.0.1:20138
```

The CLI reported `Choose Interface (v0.5.95)` while the browser still served the old version, which pointed at two different processes claiming the same port.

Port `20138` was not owned by the new 9Router process. It was owned by a `launchd`-respawned policy-guard proxy from the old `ai.f0d.policyguard` LaunchAgent. Because `launchd` managed it, killing the PID only produced a new PID within seconds, so the new 9Router process could never bind the port and the dashboard kept talking to the old proxy.

The fix was to unload and disable the stale `ai.f0d.policyguard` job, free the port, and install a clean dedicated LaunchAgent for 9Router itself (`ai.9router.local`). The final state is a single local-only owner of `127.0.0.1:20138`, auto-started by `launchd`, with the dashboard reachable and redirecting unauthenticated traffic to `/login`.

---

## 2. Environment

Verified during recovery:

```text
macOS:           27.0.1 (build 26A434), Apple Silicon arm64
Shell:           /bin/zsh
Node:            v24.18.1 (nvm) — arm64
9Router CLI:     v0.5.95
9Router path:    /Users/wfspr/.nvm/versions/node/v24.18.1/bin/9router
Port:            20138
Host:            127.0.0.1 (local-only)
Service manager: launchd user agent (gui/501)
PM2:             empty / not managing 9Router
```

New LaunchAgent:

```text
~/Library/LaunchAgents/ai.9router.local.plist
Label: ai.9router.local
```

Logs:

```text
~/Library/Logs/9router-local/out.log
~/Library/Logs/9router-local/error.log
```

Related jobs observed while diagnosing:

```text
ai.9router.backend        running  (:20139 backend)
com.9router.autostart     loaded, not running (vendor autostart; documented unsuitable on this host in the 2026-09-05 runbook)
ai.f0d.policyguard        disabled (the port hijacker)
```

---

## 3. Symptoms

1. Dashboard still showed old `v0.5.91` after the update.
2. CLI showed `Choose Interface (v0.5.95)`, so the installed binary was current.
3. Port `20138` was already in use.
4. The server log kept looping on `EADDRINUSE` for `127.0.0.1:20138`.
5. Killing the listener PID did not solve the issue.
6. New PIDs kept appearing almost immediately.
7. PM2 was empty and not relevant.
8. The actual respawner was macOS `launchd`.
9. The old policy-guard LaunchAgent was holding the same port.
10. A repeated tray warning appeared in the CLI and error log:

    ```text
    [9router] tray failed to start: spawn Unknown system error -86
    Error: spawn Unknown system error -86
    ```

11. The tray warning was noisy, but the actual blocker was `EADDRINUSE`. The tray message is a known, separately documented warning on this host (see the related 2026-09-05 runbook) and is not what prevented startup.

---

## 4. Root Cause

The old `ai.f0d.policyguard` LaunchAgent was still loaded and listening on:

```text
127.0.0.1:20138
```

Its command line was a leftover policy-guard proxy:

```text
/Users/wfspr/.hermes/node/bin/node /Users/wfspr/.config/ai-launcher/policy-guard/policy-proxy.mjs /Users/wfspr/.config/ai-launcher/policy-guard/proxy.config.json
```

Its parent process was:

```text
/sbin/launchd
```

Because `launchd` owned the job, terminating the PID triggered an immediate respawn — that is why the PID kept changing and the port never freed. The new 9Router v0.5.95 process therefore failed to bind `20138` and exited in a loop, while the dashboard still answered from the old proxy/guard process, which served the older version.

The underlying cause is a duplicate service owner for a single port: the legacy policy guard and the new 9Router both targeted `127.0.0.1:20138`.

---

## 5. What Did Not Work

- **Assuming PM2 was the culprit.** `pm2 list` was empty; PM2 was not managing 9Router at all.
- **Killing the listener PID.** The process was `launchd`-managed, so a new PID appeared immediately and the port stayed occupied.
- **Restarting 9Router repeatedly.** Every restart re-hit `EADDRINUSE` while the guard still held `20138`.
- **Trusting the CLI version banner.** The CLI can report the new version while the *served* dashboard comes from a different process that owns the port. Process and port ownership must be checked directly.
- **Treating the tray warning as the failure.** `spawn Unknown system error -86` is noisy but does not stop the gateway; the binding error is the real blocker.

---

## 6. Final Fix

The repair has three parts.

### 6.1 Remove the stale policy-guard owner

First locate the offending plist (diagnosis only — do not act on the first match blindly):

```zsh
grep -Ril "policy-proxy.mjs\|policy-guard\|20138" \
  ~/Library/LaunchAgents \
  /Library/LaunchAgents \
  /Library/LaunchDaemons 2>/dev/null
```

This identified the active label `ai.f0d.policyguard`. Unload, disable, and terminate that exact job, then confirm the port is free:

```zsh
PLIST="$HOME/Library/LaunchAgents/ai.f0d.policyguard.plist"
LABEL="ai.f0d.policyguard"

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl disable "gui/$(id -u)/$LABEL" 2>/dev/null || true

pkill -TERM -f "policy-proxy.mjs|policy-guard"
sleep 2

lsof -nP -iTCP:20138 -sTCP:LISTEN
```

> If the search finds more than one candidate, inspect each with `plutil -p` and unload only the one whose `Label`/program actually owns `20138` — never `head -n 1` a glob of plists.

Expected (success): no output from `lsof`, meaning `20138` is free.

The relevant found files were:

```text
/Users/wfspr/Library/LaunchAgents/ai.f0d.policyguard.plist
/Users/wfspr/Library/LaunchAgents/ai.f0d.policyguard.plist.pre-v0.5.bak
/Users/wfspr/Library/LaunchAgents/9router-backups/com.9router.autostart-disabled-v0.5.75-20260913-025738.plist
```

and the active label was:

```text
ai.f0d.policyguard
```

### 6.2 Confirm the new build starts

Manual smoke test on a free port:

```zsh
9router --port 20138 --host 127.0.0.1 --no-browser
```

This confirmed:

```text
Choose Interface (v0.5.95)
Server: http://127.0.0.1:20138
```

and the dashboard then showed `9Router Proxy v0.5.95`.

### 6.3 Install the clean LaunchAgent

Create `~/Library/LaunchAgents/ai.9router.local.plist` with explicit Node path, working directory, and `PATH`, so `launchd` does not depend on an interactive shell:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.9router.local</string>

  <key>ProgramArguments</key>
  <array>
    <string>/Users/wfspr/.nvm/versions/node/v24.18.1/bin/node</string>
    <string>/Users/wfspr/.nvm/versions/node/v24.18.1/bin/9router</string>
    <string>--port</string>
    <string>20138</string>
    <string>--host</string>
    <string>127.0.0.1</string>
    <string>--no-browser</string>
    <string>--skip-update</string>
    <string>--tray</string>
  </array>

  <key>WorkingDirectory</key>
  <string>/Users/wfspr</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>/Users/wfspr</string>
    <key>PATH</key>
    <string>/Users/wfspr/.nvm/versions/node/v24.18.1/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>/Users/wfspr/Library/Logs/9router-local/out.log</string>

  <key>StandardErrorPath</key>
  <string>/Users/wfspr/Library/Logs/9router-local/error.log</string>
</dict>
</plist>
```

Validate and load:

```zsh
plutil -lint "$HOME/Library/LaunchAgents/ai.9router.local.plist"   # expect: OK

PLIST="$HOME/Library/LaunchAgents/ai.9router.local.plist"
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/ai.9router.local"
launchctl kickstart -k "gui/$(id -u)/ai.9router.local"
```

Why this fixes it: there is now exactly one owner of `127.0.0.1:20138` (the 9Router job itself), and `KeepAlive` + `RunAtLoad` give the same auto-start behaviour the old policy guard provided without hijacking the port.

---

## 7. Commands

Diagnosis:

```zsh
pm2 list
lsof -nP -iTCP:20138 -sTCP:LISTEN

PID=$(lsof -tiTCP:20138 -sTCP:LISTEN)
ps -ww -o pid,ppid,pgid,stat,lstart,command -p "$PID"

PPID_OF_PID=$(ps -o ppid= -p "$PID" | tr -d ' ')
ps -ww -o pid,ppid,pgid,stat,lstart,command -p "$PPID_OF_PID"

grep -Ril "policy-proxy.mjs\|policy-guard\|20138" \
  ~/Library/LaunchAgents \
  /Library/LaunchAgents \
  /Library/LaunchDaemons 2>/dev/null
```

Repair:

```zsh
PLIST="$HOME/Library/LaunchAgents/ai.f0d.policyguard.plist"
LABEL="ai.f0d.policyguard"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl disable "gui/$(id -u)/$LABEL" 2>/dev/null || true
pkill -TERM -f "policy-proxy.mjs|policy-guard"
sleep 2
lsof -nP -iTCP:20138 -sTCP:LISTEN   # expect no output
```

Load the clean agent (after writing the plist in §6.3):

```zsh
plutil -lint "$HOME/Library/LaunchAgents/ai.9router.local.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/ai.9router.local.plist"
launchctl enable "gui/$(id -u)/ai.9router.local"
launchctl kickstart -k "gui/$(id -u)/ai.9router.local"
```

---

## 8. Verification

LaunchAgent state:

```zsh
launchctl print "gui/$(id -u)/ai.9router.local" | grep -E "state|pid|last exit|program"
```

Observed good result:

```text
state = running
program = /Users/wfspr/.nvm/versions/node/v24.18.1/bin/node
pid = 71181
properties = keepalive | runatload | inferred program
```

Port listener:

```zsh
lsof -nP -iTCP:20138 -sTCP:LISTEN
```

Observed good result:

```text
node 71195 wfspr 12u IPv4 TCP 127.0.0.1:20138 (LISTEN)
```

HTTP check:

```zsh
curl -I http://127.0.0.1:20138/dashboard
```

Observed good result:

```text
HTTP/1.1 307 Temporary Redirect
location: /login
```

A `307` to `/login` is the expected success signal: the dashboard is alive and redirecting unauthenticated access to the login page.

Process tree:

```text
71195 71181 next-server (v16.3.4)
71181 1     /Users/wfspr/.nvm/versions/node/v24.18.1/bin/node /Users/wfspr/.nvm/versions/node/v24.18.1/bin/9router --port 20138 --host 127.0.0.1 --no-browser --skip-update --tray
```

The parent PID `1` (`launchd`) confirms the job is launchd-owned, not a stray terminal process.

Policy-guard must be gone:

```zsh
launchctl print-disabled "gui/$(id -u)" | grep -i "policyguard\|9router"
```

Observed good result:

```text
"ai.9router.local"      => enabled
"com.9router.autostart" => enabled
"ai.9router.backend"    => enabled
"ai.f0d.policyguard"    => disabled
```

Version check:

```zsh
/Users/wfspr/.nvm/versions/node/v24.18.1/bin/9router --version
```

Observed good result:

```text
0.5.95
```

---

## 9. Final Working State

```text
9Router v0.5.95                    = running
Auto-start via launchd             = yes
Terminal tab                       = safe to close
Port                               = 20138
Host                               = 127.0.0.1 (local-only)
PM2                                = not used
old policy-guard                   = disabled
Dashboard                          = reachable
/dashboard                         = 307 redirect to /login
Owner job                          = ai.9router.local
Related backend                    = ai.9router.backend running on :20139
```

---

## 10. Optional Cleanup

Safe to remove later without affecting the working fix:

- `~/Library/LaunchAgents/ai.f0d.policyguard.plist.pre-v0.5.bak` (backup copy).
- The vendor autostart backup under `~/Library/LaunchAgents/9router-backups/` if the vendor path is permanently abandoned.
- Old log rotation for `~/Library/Logs/9router-local/` if the files grow.
- The disabled-but-present `com.9router.autostart` job if it is never wanted again.

Keep `ai.f0d.policyguard.plist` on disk until you are certain the policy guard is no longer needed, so the change stays reversible.

---

## 11. If This Happens Again

Shortest diagnostic sequence:

```zsh
# 1. Who owns the port?
lsof -nP -iTCP:20138 -sTCP:LISTEN

# 2. Is it launchd-managed?
PID=$(lsof -tiTCP:20138 -sTCP:LISTEN)
ps -ww -o pid,ppid,command -p "$PID"

# 3. Is the new 9Router agent healthy?
launchctl print "gui/$(id -u)/ai.9router.local" | grep -E "state|pid|last exit"
```

If the port owner is a policy-guard/proxy process whose parent is `launchd`, it is the stale guard again.

Shortest recovery:

```zsh
PLIST="$HOME/Library/LaunchAgents/ai.f0d.policyguard.plist"
LABEL="ai.f0d.policyguard"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl disable "gui/$(id -u)/$LABEL" 2>/dev/null || true
pkill -TERM -f "policy-proxy.mjs|policy-guard"
sleep 2
launchctl kickstart -k "gui/$(id -u)/ai.9router.local"
curl -I http://127.0.0.1:20138/dashboard   # expect 307 -> /login
```

---

## 12. Security / Secret Hygiene

- No API keys, tokens, passwords, auth headers, `.env` values, or Keychain output are recorded in this runbook.
- Only operational local paths required to reproduce the fix are included; the published website redacts `/Users/wfspr` to `/Users/USERNAME` at render time.
- The service stays local-only via `--host 127.0.0.1`. Do not bind it to a LAN address unless explicitly required.
- Do not paste raw logs that could contain `Authorization` headers or provider keys. The `9router-local` logs used here contain startup and tray errors only.

---

## 13. Rollback

Stop the new 9Router LaunchAgent:

```zsh
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/ai.9router.local.plist"
```

Confirm the port is free:

```zsh
lsof -nP -iTCP:20138 -sTCP:LISTEN
```

Optionally disable it so it does not return after login:

```zsh
launchctl disable "gui/$(id -u)/ai.9router.local"
```

Do **not** restore `ai.f0d.policyguard` unless explicitly required. If policy-guard must be restored intentionally, document the reason first and verify its `proxy.config.json` no longer collides with `20138` (use the old `:20139` backend split or a different port).

---

## 14. What Not to Do

1. Do not kill PID `1`. That is `/sbin/launchd`, the macOS service manager.
2. Do not re-enable `ai.f0d.policyguard` unless intentionally restoring legacy policy-guard behaviour.
3. Do not use PM2 for this 9Router setup unless separately tested; it creates a second potential owner for the port.
4. Do not click "Hide to Tray" manually during troubleshooting; it adds another lifecycle path to reason about.
5. Do not expose the service to the LAN; keep `--host 127.0.0.1`.
6. Treat the tray warning `spawn Unknown system error -86` as noisy only if port `20138` is listening **and** `/dashboard` returns `307` or a valid response.
7. If `EADDRINUSE` reappears, always identify the port owner (`lsof`) before killing processes — the owner may be `launchd`-managed and will respawn.

---

## 15. Future Prevention Checklist

- Before starting 9Router, confirm the port is free:

  ```zsh
  lsof -nP -iTCP:20138 -sTCP:LISTEN
  ```

- Check LaunchAgents before assuming PM2:

  ```zsh
  launchctl print "gui/$(id -u)" | grep -i "9router\|policy"
  ```

- Keep exactly one service owner for port `20138`.
- Avoid duplicate PM2 + launchd + tray ownership.
- Keep the service local-only with `--host 127.0.0.1`.
- After every 9Router update, verify functionally (not just by CLI banner):

  ```zsh
  curl -I http://127.0.0.1:20138/dashboard
  ```

- Confirm the dashboard version visually.
- Check logs:

  ```zsh
  tail -80 ~/Library/Logs/9router-local/out.log
  tail -80 ~/Library/Logs/9router-local/error.log
  ```

---

## 16. Related Runbooks

- [9Router v0.5.65 Policy Guard Persistence Hardening — Universal AI Launcher v0.5.2](9router-v0.5.65-policy-guard-persistence-hardening-2026-09-05.md) — original policy-guard topology (`:20138` fronting backend `:20139`), the unsuitable vendor tray autostart path, and the `spawn Unknown system error -86` tray limitation on Apple Silicon.
- [9Router Apple Silicon Headless Recovery & OpenClaude Integration](9router-apple-silicon-headless-openclaude-recovery-2026-08-26.md) — earlier headless/native-Node recovery.
- [macOS Localhost AI Service Hardening](macos-localhost-ai-service-hardening-2026-09-07.md) — loopback binding and persistent LaunchAgent inventory for the local AI services.
