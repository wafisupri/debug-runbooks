# PM2 Windows Dual-Router Setup (OmniRoute + 9Router Port Mapping & Daemonization)
---

### Summary
---

Configured **9Router** (port `20138`) and **OmniRoute** (port `20128`) to run concurrently as detached background services on Windows using PM2. Resolved startup exit loops caused by interactive CLI wrappers, terminal allocation popups, and missing upstream authentication configurations (`UPSTREAM_AUTH_ERROR`) when launching standalone Next.js builds. Configured persistent auto-start on Windows boot via `pm2-windows-startup`.

### Environment
---

* **Operating System:** Windows 11
* **Shell:** PowerShell 7 / Windows PowerShell
* **Runtime:** Node.js v24.19.0
* **Process Manager:** PM2 (with `pm2-windows-startup`)
* **Framework / App Structure:** Next.js standalone servers bundled within global npm packages
* **Paths:**
  * Global npm modules: `%APPDATA%\npm\node_modules\`
  * 9Router App Directory: `%APPDATA%\npm\node_modules\9router\app`
  * OmniRoute Directory: `%APPDATA%\npm\node_modules\omniroute`
  * OmniRoute Config: `~/.omniroute/.env`
  * PM2 Ecosystem File: `~\ecosystem.config.cjs`

### Symptoms
---

* Executing `pm2 start 9router` or `pm2 start 9router.cmd` triggered infinite restart loops (`↺ 800`), errored states, and `SyntaxError: Invalid or unexpected token (@ECHO off)` due to Node executing batch wrappers directly.
* Attempting `pm2 start ... -- -p 20138` or `--args` caused argument collisions and immediate process exit (`Exiting...`) due to TTY detachment in PM2 fork mode.
* OmniRoute spawned an unattached console window titled `Select omniroute (v16.2.12)` that froze execution under Windows QuickEdit mode.
* Direct execution of OmniRoute's `dist/server.js` stripped upstream provider credentials, returning `UPSTREAM_AUTH_ERROR` for OpenAI and NVIDIA in the Web UI test suite.

### Root Cause
---

1. **Interactive CLI Wrappers in Daemon Mode:** Both `9router/cli.js` and `omniroute/bin/omniroute.mjs` embed terminal UIs, system tray managers, and readline listeners. When launched detached under PM2, standard input (`stdin`) closes immediately, triggering exit handlers.
2. **Missing Environment Ingestion in Standalone Server:** Direct invocation of OmniRoute's production server (`dist/server.js`) bypasses the CLI pre-flight step that loads `~/.omniroute/.env`, resulting in missing API keys.
3. **PowerShell CLI Argument Splitting:** Passing complex CLI flags to PM2 through PowerShell causes misparsed parameters (e.g., creating processes named `-l`).

### What Did Not Work
---

* **Starting global `.cmd` files in PM2:** Attempted `pm2 start 9router.cmd`, which resulted in batch file execution errors inside Node.
* **Passing flags directly on CLI:** Attempted `pm2 start 9router -- -p 20138` and `pm2 start ... --args "-p 20138 -n -l"`, which caused argument parser failures.
* **Using `pm2 restart all` after updating config:** Failed to apply changed paths because PM2 restarts the in-memory process configuration rather than re-reading modified files on disk.

### Final Fix
---

1. **Target Compiled Standalone Servers:** Point PM2 directly to `9router/app/custom-server.js` and `omniroute/dist/server.js`, bypassing interactive wrapper CLIs.
2. **Inject OmniRoute `.env` via Node Flag:** Supply `--env-file` in `node_args` so `dist/server.js` loads credentials from `~/.omniroute/.env`.
3. **Suppress Console Allocations:** Set `windowsHide: true` in the PM2 ecosystem declaration to prevent Windows console popup windows and QuickEdit freezing.
4. **Persist State:** Use `pm2-windows-startup` and `pm2 save` to register background execution in the Windows registry across reboots.

### Commands
---

```powershell
# 1. Unified PM2 Ecosystem Config
@'
const path = require('path');
const os = require('os');
const nineRouterDir = path.join(process.env.APPDATA, 'npm/node_modules/9router/app');
const omniRouteDir = path.join(process.env.APPDATA, 'npm/node_modules/omniroute');
const omniRouteEnv = path.join(os.homedir(), '.omniroute', '.env');

module.exports = {
  apps: [
    {
      name: '9router',
      cwd: nineRouterDir,
      script: 'custom-server.js',
      node_args: '--dns-result-order=ipv4first --max-old-space-size=6144',
      windowsHide: true,
      env: {
        PORT: 20138,
        HOST: '0.0.0.0',
        NODE_ENV: 'production'
      }
    },
    {
      name: 'omniroute',
      cwd: omniRouteDir,
      script: 'dist/server.js',
      node_args: '--max-old-space-size=8192 --env-file=' + omniRouteEnv,
      windowsHide: true,
      env: {
        PORT: 20128,
        HOST: '0.0.0.0',
        NODE_ENV: 'production'
      }
    }
  ]
};
'@ | Set-Content -Path "$HOME\ecosystem.config.cjs"

# 2. Reset and start PM2 processes
pm2 delete all
pm2 start "$HOME\ecosystem.config.cjs"

# 3. Register auto-startup on Windows boot
npm install -g pm2-windows-startup
pm2-startup install
pm2 save
```

### Verification
---

```powershell
# Check running PM2 processes and port bindings
pm2 list
Get-NetTCPConnection -LocalPort 20128, 20138 -State Listen -ErrorAction SilentlyContinue | Format-Table LocalAddress, LocalPort, State, OwningProcess -AutoSize

# Test HTTP responses
Invoke-RestMethod -Uri "http://127.0.0.1:20128" -Method Get -TimeoutSec 5
Invoke-RestMethod -Uri "http://127.0.0.1:20138" -Method Get -TimeoutSec 5
```

### Final Working State
---

* **OmniRoute:** Running headless on [http://127.0.0.1:20128](http://127.0.0.1:20128) with credentials loaded from `~/.omniroute/.env`.
* **9Router:** Running headless on [http://127.0.0.1:20138](http://127.0.0.1:20138) via `app/custom-server.js`.
* **PM2 Registry:** `~/.pm2/dump.pm2` synchronized with active instances, launched automatically via Windows startup task.

### Optional Cleanup
---

```powershell
pm2 flush
```

### If This Happens Again
---

1. Stop existing conflicting listeners:

```powershell
pm2 delete all
```

2. Verify that `ecosystem.config.cjs` points to `9router/app/custom-server.js` and `omniroute/dist/server.js` (with `--env-file`).
3. Re-launch and re-save PM2:

```powershell
pm2 start "$HOME\ecosystem.config.cjs"
pm2 save
```
