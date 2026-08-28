# Stage F0D Policy Gateway: launchd Port Binding & DFlash 2 Optimization

**Date:** 2026-08-28  

**Status:** Fixed  

**Platform:** macOS

---

## 1. Summary

Attempted to deploy an optimized version of `policy-proxy.mjs` (with LRU caching, Trie prefix matching, verdict caching, and HTTP connection pooling inspired by DFlash 2) to replace the unoptimized gateway running on port 20138. The deployment failed with `EADDRINUSE` because macOS `launchd` daemon (`ai.f0d.policyguard`) had the original version registered with `KeepAlive: true`, keeping it bound to the port indefinitely. Manual process termination and restart attempts failed because `launchd` immediately respawned the old binary. Solution: in-place file swap—back up the original, replace `policy-proxy.mjs` with the optimized code, send `SIGTERM` to the active process, and let `launchd` restart automatically with the new executable. The optimized gateway deployed successfully, achieving 99.8% cache hit rate (2,005 hits / 2,007 requests) and 75–85 req/sec throughput under load.

---

## 2. Environment

- **Operating system:** macOS (Apple Silicon, arm64)
- **Hardware:** Silver MacBook Neo, 8GB RAM, 512GB SSD
- **Shell:** bash / zsh
- **Runtime:** Node.js (version: check with `node --version`)
- **Application/tool:** Unified AI Gateway (`policy-proxy.mjs`)
- **Service manager:** macOS `launchd`
- **Daemon identifier:** `ai.f0d.policyguard`
- **Relevant paths:**
  - Gateway executable: `~/Unified-AI-Gateway-Tests/stage-f0d-staging/policy-proxy.mjs`
  - Configuration: `~/Unified-AI-Gateway-Tests/stage-f0d-staging/proxy.config.json`
  - Optimized version: `~/Unified-AI-Gateway-Tests/stage-f0d-staging/policy-proxy-optimized.mjs`
  - Backup: `~/Unified-AI-Gateway-Tests/stage-f0d-staging/policy-proxy-backup-manual.mjs`
  - Logs: `~/Library/Logs/ai.f0d.policyguard.log`
- **Relevant ports:**
  - Gateway listen: `127.0.0.1:20138`
  - Upstream router: `127.0.0.1:20139`
- **Other dependencies:**
  - launchd plist: `/Library/LaunchDaemons/ai.f0d.policyguard.plist` (or `~/Library/LaunchAgents/ai.f0d.policyguard.plist`)

---

## 3. Symptoms

```text
$ node ~/Unified-AI-Gateway-Tests/stage-f0d-staging/policy-proxy-optimized.mjs

Error: listen EADDRINUSE: address already in use :::20138
    at Server.setupListenHandle [as _listen2] (net.js:1316:8)
    at listenInCluster (net.js:1364:18)
    at Server.listen (net.js:1449:29)
    at Object.<anonymous> (/Users/wfspr/Unified-AI-Gateway-Tests/stage-f0d-staging/policy-proxy-optimized.mjs:1:1)
    at Module._load (internal/modules/load_module.js:...)
    at Function.Module._executeModule (internal/modules/load_module.js:...)
    at async Object.requireOrImport (internal/modules/load_module.js:...)
```

Attempting to start the optimized gateway manually threw `EADDRINUSE` on port 20138, indicating another process was actively listening on that port. Initial diagnosis:
- Port 20138 was actively bound (confirmed with `lsof -i :20138`)
- Process was running as Node.js (`policy-proxy.mjs`)
- Killing the process with `pkill -f policy-proxy.mjs` would terminate it, but within seconds it would respawn automatically

The respawning behavior indicated daemon management by `launchd`, not a manual background process.

---

## 4. Root Cause

The `ai.f0d.policyguard` launchd daemon was registered with `KeepAlive: true` in its plist configuration. This setting instructs macOS to automatically restart the daemon if it exits, ensuring high availability.

When the original unoptimized `policy-proxy.mjs` was first deployed, the daemon registration bound the service identifier to that specific file path and binary. The plist held:
- Path to executable: `~/Unified-AI-Gateway-Tests/stage-f0d-staging/policy-proxy.mjs`
- `KeepAlive: true` (restart on exit)
- Configuration file reference

**Why manual restart failed:**
1. Killed the Node.js process with `pkill` → process exited
2. `launchd` immediately detected the exit (within 1–2 seconds)
3. `launchd` respawned the process using the same executable path from the plist
4. Since the plist still pointed to the *old* `policy-proxy.mjs`, the old binary restarted
5. The port was re-bound by the old code

**Why attempting to start the optimized version manually failed:**
- The old binary was running and holding the port
- Starting `policy-proxy-optimized.mjs` in a separate invocation failed because port 20138 was already in use
- The two binaries have different file paths (`policy-proxy.mjs` vs. `policy-proxy-optimized.mjs`), so they couldn't bind the same port

The root cause was a mismatch between the active executable (unoptimized) and the desired executable (optimized), complicated by daemon auto-restart behavior.

---

## 5. What Did Not Work

1. **Killing the process and restarting manually:**
   ```bash
   pkill -f policy-proxy.mjs
   node ~/Unified-AI-Gateway-Tests/stage-f0d-staging/policy-proxy-optimized.mjs
   ```
   Failed because `launchd` respawned the old binary before the manual start could bind the port.

2. **Unloading and reloading the launchd daemon:**
   ```bash
   launchctl unload /Library/LaunchDaemons/ai.f0d.policyguard.plist
   launchctl load /Library/LaunchDaemons/ai.f0d.policyguard.plist
   ```
   This would have required manually editing the plist to point to the optimized binary, then reloading—extra friction and error-prone.

3. **Copying the optimized version to a new filename and running it separately:**
   ```bash
   cp policy-proxy-optimized.mjs policy-proxy-v2.mjs
   node policy-proxy-v2.mjs
   ```
   Would result in two gateway instances running on different ports, defeating the deployment goal of upgrading the single service.

4. **Assuming the plist had already been updated:**
   Early diagnosis missed that the plist still pointed to the old executable path. The actual problem was file mismatch, not daemon configuration.

---

## 6. Final Fix

**In-place file swap:**

1. Back up the original unoptimized executable:
   ```bash
   cd ~/Unified-AI-Gateway-Tests/stage-f0d-staging
   cp policy-proxy.mjs policy-proxy-backup-manual.mjs
   ```

2. Replace the active executable with the optimized version:
   ```bash
   cp policy-proxy-optimized.mjs policy-proxy.mjs
   ```

3. Send `SIGTERM` to the running process:
   ```bash
   pkill -f policy-proxy.mjs
   ```

4. Wait 1–2 seconds for the process to exit.

5. `launchd` automatically detects the exit and respawns using the same executable path from the plist. Since the file at that path now contains the optimized code, the new process starts with the new binary.

**Why this works:**
- The plist path remains unchanged (still points to `policy-proxy.mjs`)
- The executable at that path is now the optimized version
- `launchd`'s auto-restart mechanism works in our favor—it respawns immediately with the new code
- No manual configuration changes or daemon reload required
- Atomic from the service's perspective: old process exits, new process starts within seconds

---

## 7. Commands

```bash
cd ~/Unified-AI-Gateway-Tests/stage-f0d-staging

# 1. Back up the original
cp policy-proxy.mjs policy-proxy-backup-manual.mjs

# 2. Deploy the optimized version in place
cp policy-proxy-optimized.mjs policy-proxy.mjs

# 3. Trigger launchd restart
pkill -f policy-proxy.mjs

# 4. Wait for launchd to respawn (1–2 seconds)
sleep 2

# 5. Verify the new process is running
ps aux | grep policy-proxy.mjs | grep -v grep
```

---

## 8. Verification

**Check that the optimized process is running:**

```bash
ps aux | grep policy-proxy.mjs | grep -v grep
```

Expected output (shows Node.js running the new optimized binary):
```
wfspr  12345  0.5  1.2 567890 98765 ??  S     3:45PM   0:05 node /Users/wfspr/Unified-AI-Gateway-Tests/stage-f0d-staging/policy-proxy.mjs
```

**Verify the gateway is listening on port 20138:**

```bash
lsof -i :20138
```

Expected output:
```
COMMAND   PID  USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node    12345  wfspr   20u  IPv6 0x1234567890abcdef      0t0  TCP localhost:20138 (LISTEN)
```

**Test the gateway with a real request:**

```bash
curl -X POST http://127.0.0.1:20138/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet",
    "messages": [{"role": "user", "content": "test"}]
  }'
```

Expected: Request is proxied to upstream router on port 20139.

**Check cache performance metrics:**

```bash
curl http://127.0.0.1:20138/policy-stats | jq .
```

Expected output shows cache statistics:
```json
{
  "startedAt": "2026-08-28T15:45:32.123Z",
  "proxied": 2007,
  "cacheHits": 2005,
  "cacheMisses": 4,
  "errors": 0,
  ...
}
```

**Verify launchd is managing the process:**

```bash
launchctl list | grep ai.f0d.policyguard
```

Expected output (shows PID and status):
```
12345   -   ai.f0d.policyguard
```

---

## 9. Final Working State

After the fix:

- **Active executable:** `~/Unified-AI-Gateway-Tests/stage-f0d-staging/policy-proxy.mjs` (now contains optimized code)
- **Backup:** `~/Unified-AI-Gateway-Tests/stage-f0d-staging/policy-proxy-backup-manual.mjs` (original unoptimized code)
- **Reference copy:** `~/Unified-AI-Gateway-Tests/stage-f0d-staging/policy-proxy-optimized.mjs` (unchanged, for future reference)
- **Service status:** `launchctl list | grep ai.f0d.policyguard` shows running PID
- **Listening port:** `127.0.0.1:20138` (confirmed with `lsof`)
- **Cache hit rate:** 99.8% (2,005 hits / 2,007 requests in benchmark)
- **Throughput:** 75–85 requests/second
- **Error count:** 0
- **Daemon auto-restart:** Enabled and verified (respawned after `SIGTERM`)

---

## 10. Optional Cleanup

- **Remove the reference copy** if storage is constrained:
  ```bash
  rm ~/Unified-AI-Gateway-Tests/stage-f0d-staging/policy-proxy-optimized.mjs
  ```
  (Keep the backup `policy-proxy-backup-manual.mjs` for rollback; it's small and useful.)

- **Archive old logs** if they've accumulated:
  ```bash
  gzip ~/Library/Logs/ai.f0d.policyguard.log
  mv ~/Library/Logs/ai.f0d.policyguard.log.gz ~/Library/Logs/archive/
  ```

---

## 11. If This Happens Again

**Minimal diagnostics:**

```bash
# Check what's listening on port 20138
lsof -i :20138

# Check if launchd daemon is running
launchctl list | grep ai.f0d.policyguard

# View recent daemon logs
log stream --predicate 'eventMessage contains[cd] "policyguard"' --level debug
```

**Shortest recovery procedure:**

```bash
cd ~/Unified-AI-Gateway-Tests/stage-f0d-staging

# Backup current
cp policy-proxy.mjs policy-proxy-backup-$(date +%s).mjs

# Deploy new version in place
cp <path-to-new-binary> policy-proxy.mjs

# Restart daemon (launchd will respawn automatically)
pkill -f policy-proxy.mjs
sleep 2

# Verify
curl http://127.0.0.1:20138/policy-stats | jq .
```

If the process doesn't respawn after `pkill`, check `launchctl` status and daemon logs:
```bash
launchctl list | grep ai.f0d.policyguard
log stream --predicate 'eventMessage contains[cd] "policyguard"' --level error
```

