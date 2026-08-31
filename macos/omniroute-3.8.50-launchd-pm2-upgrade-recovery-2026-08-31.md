# OmniRoute v3.8.50 Upgrade & LaunchAgent/PM2 Conflict Recovery — 2026-08-31

**Date:** 2026-08-31
**Status:** Fixed / Closed (PASS / CLOSED)
**Platform:** macOS (Apple Silicon, arm64)

---

## Summary

OmniRoute gateway was upgraded from **v3.8.49** to **v3.8.50** and recovered from a supervisory conflict caused by competing `launchd` and `PM2` daemon instances. The correct and authoritative supervisor on this machine is the macOS LaunchAgent (`ai.omniroute.gateway`), not PM2. The NVM-managed installation referenced by the LaunchAgent was explicitly upgraded. PM2 was fully purged of stale OmniRoute dump records to prevent resurrection hazards. Post-upgrade validation confirmed authentication enforcement, `coding-chain` free-first routing policy integrity, live zero-cost free generation, and correct fallback ordering — all verified against the live SQLite source of truth.

No credential material appears anywhere in this document.

---

## Environment

- **Operating System:** macOS (Apple Silicon, arm64)
- **Shell:** zsh
- **Primary Gateway:** OmniRoute on port `20128`
- **Authoritative Supervisor:** macOS LaunchAgent `ai.omniroute.gateway`
- **LaunchAgent Plist:** `~/Library/LaunchAgents/ai.omniroute.gateway.plist`
- **Working Directory:** `~/.omniroute`
- **Node Runtime:** `~/.nvm/versions/node/v24.18.1/bin/node`
- **OmniRoute Entry Point:** `~/.nvm/versions/node/v24.18.1/lib/node_modules/omniroute/bin/omniroute.mjs`
- **Active Database:** `~/.omniroute/storage.sqlite`

### LaunchAgent Configuration

The LaunchAgent (`ai.omniroute.gateway`) is configured with:

- `RunAtLoad` = `true`
- `KeepAlive` with `SuccessfulExit` = `false`
- `ProcessType` = `Background`
- Program arguments: `serve`, `--no-open`, `--no-tray`
- `WorkingDirectory` = `~/.omniroute`
- Explicitly invokes `~/.nvm/versions/node/v24.18.1/bin/node` with `~/.nvm/versions/node/v24.18.1/lib/node_modules/omniroute/bin/omniroute.mjs`

The `--no-open` flag prevents OmniRoute from opening a browser dashboard on each restart. The `--no-tray` flag suppresses the system tray icon.

---

## Symptoms

1. **Version Mismatch:** Interactive shell resolved OmniRoute from `~/.local/bin/omniroute`, while the LaunchAgent invoked the NVM global installation at `~/.nvm/versions/node/v24.18.1/lib/node_modules/omniroute`. Installing `omniroute@latest` without forcing the prefix updated only the `~/.local` copy, leaving the background service running v3.8.49.

2. **PM2 / LaunchAgent Conflict:** A temporary PM2 recovery attempt (`pm2 start omniroute --name "omniroute" -- serve`) conflicted with `launchd`. Both supervisors competed to bind port `20128`, producing:
   - `EADDRINUSE` errors
   - Repeated process restarts
   - Repeated browser tabs opening (because `omniroute serve` opens the dashboard on every restart unless `--no-open` is supplied)

3. **Log Confusion:** Persistent `/tmp/omniroute.error.log` entries accumulated historical bind errors that obscured whether `EADDRINUSE` was a current or stale condition.

---

## Root Cause

Two independent issues combined:

1. **Dual Installation Paths:** OmniRoute was installed in both `~/.local/bin` (interactive shell) and NVM's global module path (LaunchAgent). Upgrading via the interactive shell only updated the `~/.local` copy; the LaunchAgent continued running the NVM copy at v3.8.49.

2. **Competing Supervisors:** `launchd` (via the LaunchAgent) and PM2 simultaneously attempted to own and restart OmniRoute on port `20128`. The browser tab storm was a direct consequence — PM2 did not pass `--no-open`, so each PM2 restart attempt opened a dashboard tab.

The authoritative supervisor on this Mac is `launchd`, not PM2.

---

## What Did Not Work

- Treating PM2 as the OmniRoute supervisor on this Mac.
- Starting `omniroute serve` under PM2 while `launchd` already owned the service.
- Installing the latest OmniRoute without accounting for npm's configured global prefix — the upgrade went to `~/.local` instead of the NVM prefix used by the LaunchAgent.
- Assuming the NVM npm executable automatically installs into its own NVM prefix without an explicit `--prefix` flag.
- Relying on accumulated `/tmp/omniroute.error.log` without clearing it before determining whether `EADDRINUSE` was current.
- Using `PPID` as a shell variable in zsh (readonly special variable).
- Attempting `npm approve-scripts --allow-scripts-pending` — this npm installation did not support that command (`Unknown command: "approve-scripts"`).
- Recursively grepping all `~/.omniroute` data for live combo definitions, which mostly surfaced historical call logs and backups instead of the active SQLite source of truth.

---

## Final Fix & Upgrade Procedure

### 1. Explicit NVM Global Upgrade

Targeted the exact NVM installation utilized by the LaunchAgent:

```bash
~/.nvm/versions/node/v24.18.1/bin/npm install -g \
  --prefix ~/.nvm/versions/node/v24.18.1 \
  omniroute@3.8.50
```

Peer/deprecation warnings from npm were non-fatal. The `allow-scripts` warnings and the failed `npm approve-scripts --allow-scripts-pending` command did not block installation or startup.

### 2. LaunchAgent Restart

Reloaded the authoritative LaunchAgent via `launchctl`:

```bash
launchctl kickstart -k gui/$(id -u)/ai.omniroute.gateway
```

Fresh logs confirmed:
- OmniRoute v3.8.50 running
- Approximately 22-second startup time
- One listener on `*:20128`
- No fresh `EADDRINUSE` after clean-log restart

### 3. PM2 Hazard Elimination

Removed the temporary PM2 process:

```bash
pm2 delete omniroute
```

After deletion, `pm2 status` was empty. However, `~/.pm2/dump.pm2` still contained a stale entry:
- `name`: `omniroute`
- `script`: `~/.local/bin/omniroute`
- `args`: `serve`

This meant `pm2 resurrect` or any PM2 recovery sequence could recreate the duplicate OmniRoute process. The dump was cleared:

```bash
pm2 save --force
```

Verification:
- `saved_processes`: 0
- `names`: `[]`
- `pm2 status`: empty
- LaunchAgent remained active
- Exactly one listener on port `20128`

This removed the PM2 resurrection hazard.

---

## Verification & Diagnostic Evidence

### Process & Port Inspection

- LaunchAgent-owned Node parent process running v3.8.50.
- OmniRoute server running as child process.
- Port listener owned by the child process.
- Exactly one listener on `*:20128`.

### Authentication Check

Unauthenticated request:

```bash
curl -i http://127.0.0.1:20128/v1/models
```

Returned:

```http
HTTP/1.1 401 Unauthorized
Authentication required
```

**Authentication discrepancy (documented factually):** Startup stderr displayed a warning mentioning `listening on 0.0.0.0 with NO API-key requirement`. However, the observed HTTP behavior correctly enforced authentication (HTTP 401). This document records both observations without claiming the warning was definitively correct or incorrect beyond the observed behavior.

### Free-First Routing (`coding-chain`)

Authenticated smoke test through model `coding-chain`:

- **Expected response:** `CODING_CHAIN_3850_OK`
- **Actual successful model:** `poolside/laguna-s-2.1:free`
- **Status:** `200`
- **Provider:** `openrouter`
- **comboName:** `coding-chain`
- **comboStepId:** `openrouter-free-step-2-poolside-laguna-s-2-1-free`
- **comboExecutionKey:** `coding-chain-ref-2-openrouter-free > openrouter-free-step-2-poolside-laguna-s-2-1-free`
- **Observed cost:** `0`

### Live SQLite Routing Source of Truth

Active routing configuration is stored in `~/.omniroute/storage.sqlite`. The `combos` table schema:

| Column | Purpose |
|---|---|
| `id` | Primary key |
| `name` | Combo identifier |
| `data` | JSON routing configuration |
| `sort_order` | Display ordering |
| `created_at` | Creation timestamp |
| `updated_at` | Last modification timestamp |
| `system_message` | System prompt override |
| `tool_filter_regex` | Tool filtering pattern |
| `context_cache_protection` | Cache protection flag |

#### `coding-chain` Configuration

Strategy: `priority`
Description: `FREE-FIRST -> PAID-FALLBACK orchestrator`

Priority order:

1. `auto/coding:free`
2. combo-ref `openrouter-free`
3. combo-ref `openrouter-paid`

#### `openrouter-free` Configuration

Strategy: `priority`
Live model list:

- `inclusionai/ling-3.0-flash-fin:free`
- `poolside/laguna-s-2.1:free`
- `cohere/north-mini-code:free`
- `minimax/minimax-m3:free`
- `minimax/minimax-m2.7:free`
- `nvidia/nemotron-3-super-120b-a12b:free`

#### `openrouter-paid` Configuration (Final Fallback)

Live model list:

1. `openrouter/qwen/qwen3-coder-flash`
2. `openrouter/deepseek/deepseek-v4-flash`
3. `openrouter/anthropic/claude-sonnet-5`

**The post-upgrade free-first routing policy survived intact.** Free routes are tried first, paid routes remain last. The `openrouter-paid` combo is only reached when both `auto/coding:free` and `openrouter-free` fail.

---

## Final Known-Good State

```ini
OMNIROUTE_VERSION=3.8.50
SUPERVISOR=launchd
LAUNCHAGENT=ai.omniroute.gateway
PM2_OMNIROUTE=ABSENT
PM2_DUMP_OMNIROUTE=ABSENT
PORT_20128_SINGLE_LISTENER=PASS
API_AUTHENTICATION=PASS
CODING_CHAIN=PASS
FREE_FIRST_POLICY=PASS
OPENROUTER_FREE=PASS
OPENROUTER_PAID_LAST=PASS
LIVE_FREE_GENERATION=PASS
OBSERVED_TEST_COST=0
BROWSER_TAB_STORM=FIXED
FINAL_STATUS=CLOSED
```

---

## If This Happens Again

1. Identify port owner: `lsof -i :20128`
2. Check LaunchAgent: `launchctl list | grep omniroute`
3. Check PM2: `pm2 status` and inspect `~/.pm2/dump.pm2`
4. Compare both OmniRoute installations/versions: `~/.local/bin/omniroute --version` vs `~/.nvm/versions/node/v24.18.1/lib/node_modules/omniroute/bin/omniroute.mjs --version`
5. Explicitly update the installation referenced by the LaunchAgent:
   ```bash
   ~/.nvm/versions/node/v24.18.1/bin/npm install -g \
     --prefix ~/.nvm/versions/node/v24.18.1 \
     omniroute@<version>
   ```
6. Restart using launchctl only: `launchctl kickstart -k gui/$(id -u)/ai.omniroute.gateway`
7. Verify one listener: `lsof -i :20128`
8. Verify authentication: `curl -i http://127.0.0.1:20128/v1/models` (expect HTTP 401)
9. Verify `coding-chain`: authenticated smoke test through `coding-chain`
10. Query `storage.sqlite` read-only for actual combo order:
    ```bash
    sqlite3 ~/.omniroute/storage.sqlite "SELECT name, data FROM combos WHERE name IN ('coding-chain','openrouter-free','openrouter-paid');"
    ```
11. Inspect PM2 saved dump for stale resurrection entries: `cat ~/.pm2/dump.pm2 | python3 -m json.tool`
12. Clear stale PM2 dump if PM2 should be empty: `pm2 save --force`

---

## Credits / Provenance

- **Human Operator:** Wafi Supri — system owner/operator, executed commands, supplied outputs, accepted final state
- **ChatGPT (GPT-5.6 Sol):** Diagnosis, recovery sequencing, LaunchAgent/PM2 conflict analysis, NVM prefix diagnosis, routing/security validation plan, documentation preparation
- **OpenClaude CLI (model: silverMBN):** Documentation implementation, repository inspection, secret scan, README update, git verification, commit/push
