# Hermes Agent v0.20 You.com MCP OAuth & Portable/Plugin Resolution

**Date:** 2026-09-26  
**Status:** Fixed  
**Platform:** macOS  

---

## 1. Summary

Following an update to **Hermes Agent v0.20.0+23045.g2854525**, You.com Model Context Protocol (MCP) integrations failed with persistent `401 Unauthorized` errors. The issue stemmed from a conflict between portable/plugin MCP definitions exposed in the Hermes runtime and the native `mcp_servers` configuration required by the Hermes CLI to execute OAuth authentication flows. Additionally, live status reporting via `/reload-mcp` produced misleading reconnection messages despite continuous authentication failures, and one server (`you-research`) remained disabled due to an independent `enabled: false` configuration flag.

The issue was resolved by establishing explicit native definitions in `~/.hermes/config.yaml` for `you`, `you-research`, and `you-finance`, authorizing each server via `hermes mcp login`, and enabling all entries. All 4 MCP servers registered successfully, bringing **27 total tools** into service with verified HTTP `200 OK` / `202 Accepted` status codes.

---

## 2. Environment

- **Operating System:** macOS (Apple Silicon / Intel, zsh)
- **Application:** Hermes Agent CLI (`hermes`)
- **Hermes Version:** `Hermes Agent v0.20.0+23045.g2854525 (2026.9.24)`
- **Active Configuration Path:** `/Users/wfspr/.hermes/config.yaml`
- **Configuration Root:** `mcp_servers:`
- **Log Location:** `~/.hermes/logs/` and `~/.hermes/logs/agent.log`
- **MCP Endpoints Involved:**
  - You.com Base: `https://api.you.com/mcp` (`you`)
  - You.com Research: `https://api.you.com/mcp/research` (`you-research`)
  - You.com Finance: `https://api.you.com/mcp/finance` (`you-finance`)
  - KlingAI (reference co-existing server): `https://kling.ai/mcp` (`klingai`)

---

## 3. Symptoms

1. **Startup Connection Warnings & Toolset Errors:**
   Hermes startup logged warnings regarding missing toolsets:
   ```text
   Unknown toolsets: you, you-finance, you-research
   ```
   The interactive Terminal UI (TUI) displayed ongoing connection status:
   ```text
   you (http) — connecting
   you-research (http) — connecting
   you-finance (http) — connecting
   ```

2. **Backend Authentication Failures (HTTP 401):**
   Agent backend logs recorded repeated HTTP 401 failures:
   ```text
   HTTP 401 Unauthorized — api.you.com
   OAuth authentication required for MCP server 'you'
   ```

3. **CLI Server Resolution Errors:**
   Attempting CLI authentication or diagnostics failed because native config entries were missing:
   ```bash
   hermes mcp login you
   # Output: Server 'you' not found in config

   hermes mcp test you
   # Output: Server 'you' not found in config
   ```

4. **Misleading `/reload-mcp` Status:**
   Executing `/reload-mcp` inside Hermes reported that the You.com servers had successfully "Reconnected", despite the backend logs continuing to show HTTP 401 authorization failures.

5. **Disabled Server State Disconnect:**
   For `you-research`, running `hermes mcp configure you-research` indicated no tool selection changes were needed (showing `1/1 enabled`), yet the server remained inactive because its top-level entry was set to `enabled: false`.

---

## 4. Root Cause

### Root Cause 1: Portable vs Native MCP Configuration Isolation
You.com MCP servers were made available to the Hermes Agent runtime via a portable/plugin integration. However, Hermes CLI authentication management (`hermes mcp login` and `hermes mcp test`) operates exclusively on native `mcp_servers:` blocks inside `~/.hermes/config.yaml`. Without explicit native entries in `config.yaml`, the CLI could neither initiate the OAuth PKCE flow nor store token credentials for the You.com endpoints.

### Observed Status Inconsistency: `/reload-mcp`
The `/reload-mcp` command reported the You.com servers as "Reconnected" even though subsequent backend requests still failed OAuth with `401 Unauthorized`. The incident established the contradiction between the TUI status and backend HTTP results, but did **not** establish the internal implementation reason for that discrepancy.

### Root Cause 2: Decoupled `enabled:` Flag in `hermes mcp configure`
The `hermes mcp configure` command toggled individual tool selection masks under an MCP server, but did not alter the top-level `enabled: false` boolean in `config.yaml`. `you-research` remained disabled globally despite all of its sub-tools being enabled.

---

## 5. What Did Not Work

- **Relying on `/reload-mcp` for Verification:** Re-executing `/reload-mcp` gave false positive "Reconnected" status indicators while requests to `api.you.com` continued failing.
- **Executing `hermes mcp login` Before Updating Config:** Attempting to authenticate via CLI before creating native entries in `config.yaml` failed with `Server ... not found in config`.
- **Running `hermes mcp configure` to Enable `you-research`:** Tool-selection configuration did not override `enabled: false` in `config.yaml`.

---

## 6. Final Fix

### Step 1: Backup Active Configuration
Before modifying the configuration, create a timestamped backup:
```bash
cp ~/.hermes/config.yaml ~/.hermes/config.yaml.bak-$(date +%Y%m%d-%H%M%S)
```

### Step 2: Define Native MCP Servers in `~/.hermes/config.yaml`
Add explicit native entries for `you`, `you-research`, and `you-finance` under `mcp_servers:`:

```yaml
mcp_servers:
  klingai:
    url: https://kling.ai/mcp
    auth: oauth

  you:
    url: https://api.you.com/mcp
    auth: oauth
    enabled: true

  you-research:
    url: https://api.you.com/mcp/research
    auth: oauth
    enabled: true

  you-finance:
    url: https://api.you.com/mcp/finance
    auth: oauth
    enabled: true
```

### Step 3: Complete OAuth Authentication for Each Server
Execute the CLI login command for each server:
```bash
hermes mcp login you
hermes mcp login you-research
hermes mcp login you-finance
```
*Note: Follow the browser prompt for each command to grant OAuth authorization.*

### Step 4: Verify Server Connectivity and Tool Discovery
Test each server natively via the CLI:
```bash
hermes mcp test you
hermes mcp test you-research
hermes mcp test you-finance
```

---

## 7. Commands

### Diagnostics & Inspection
```bash
# Verify Hermes Agent version
hermes --version

# View system and component status
hermes status --all

# List configured native MCP servers
hermes mcp list

# Locate active config file path
CFG="$(hermes config path)"
echo "Config path: $CFG"

# Inspect mcp_servers block in configuration
grep -n -A 50 '^mcp_servers:' "$CFG"

# Inspect the complete mcp_servers block without relying on machine-specific line numbers
grep -n -A 80 '^mcp_servers:' "$CFG"
```

### Log Analysis
```bash
# Search for You.com errors across log history
grep -RniE \
  'you-finance|you-research|api\.you\.com|mcp.*you|you.*mcp|connection.*failed|MCP.*error' \
  ~/.hermes/logs 2>/dev/null | tail -100

# Inspect recent backend registration and HTTP status codes
tail -120 ~/.hermes/logs/agent.log | grep -iE \
  'registered.*tool|api\.you\.com|401|you-research|you-finance'
```

### Remediation & Auth
```bash
# Backup configuration
cp ~/.hermes/config.yaml ~/.hermes/config.yaml.bak-$(date +%Y%m%d-%H%M%S)

# Authenticate servers
hermes mcp login you
hermes mcp login you-research
hermes mcp login you-finance

# Validate native server endpoints
hermes mcp test you
hermes mcp test you-research
hermes mcp test you-finance
```

---

## 8. Verification

Verification confirmed full discovery across all 4 native MCP servers:

1. **`you` Endpoint Test:**
   - Status: Connected successfully
   - Discovered Tools (4): `you-search`, `you-contents`, `you-balance`, `you-discover`

2. **`you-research` Endpoint Test:**
   - Status: Connected successfully
   - Discovered Tools (1): `you-research`

3. **`you-finance` Endpoint Test:**
   - Status: Connected successfully
   - Discovered Tools (1): `you-finance`

4. **`klingai` Reference Test:**
   - Status: Connected successfully
   - Discovered Tools (21): Kling AI model and generation tool suite

5. **Backend Tool Registration Confirmation:**
   Log inspection of `~/.hermes/logs/agent.log` verified:
   ```text
   MCP: registered 27 tool(s) from 4 server(s)
   ```
   Network logs confirmed You.com API requests returned successful HTTP responses (`200 OK` / `202 Accepted`) instead of `401 Unauthorized`.

---

## 9. Final Working State

- **Total Active MCP Servers:** 4 (`klingai`, `you`, `you-research`, `you-finance`)
- **Total Registered MCP Tools:** 27
  - KlingAI: 21 tools
  - You: 4 tools
  - You Research: 1 tool
  - You Finance: 1 tool
- **OAuth Status:** All 4 servers authorized; cached credentials were accepted on subsequent connection and test requests.
- **Config State:** All 4 native entries present under `mcp_servers:` with `enabled: true`.

---

## 10. Optional Cleanup

No cleanup is required for the working configuration. Keep the timestamped `config.yaml` backup until the repaired MCP configuration has remained stable across normal Hermes restarts. Portable/plugin definitions for the same server names may remain installed; Hermes logs show the native definitions taking precedence.

---

## 11. If This Happens Again

1. **Check logs for HTTP 401s:**
   ```bash
   tail -100 ~/.hermes/logs/agent.log | grep -iE '401|api\.you\.com'
   ```
2. **Verify native entries in the active config:**
   ```bash
   CFG="$(hermes config path)"
   grep -n -A 80 '^mcp_servers:' "$CFG"
   ```
3. **If a required server is missing natively, add it under `mcp_servers:`, authenticate, and test:**
   ```bash
   hermes mcp login <server-name>
   hermes mcp test <server-name>
   ```
4. **Cross-check runtime status against backend registration logs rather than relying only on the TUI:**
   ```bash
   tail -120 ~/.hermes/logs/agent.log | grep -iE \
     'registered.*tool|api\.you\.com|401|you-research|you-finance'
   ```

---

## 12. Expected / Harmless Warnings

After defining native MCP servers, Hermes logged conflict warnings during startup:
```text
Portable MCP server 'you-research' conflicts with native config; skipping
Portable MCP server 'you-finance' conflicts with native config; skipping
```

**Assessment:** These warnings are **expected and harmless**. When both a portable/plugin entry and a native `config.yaml` entry exist for the same MCP server, Hermes prioritizes the native definition so that CLI-managed OAuth tokens are utilized. Do not treat these log entries as errors.

---

## 13. Remaining Anomaly

Following a `/reload-mcp` invocation, the Hermes TUI initially logs:
```text
27 tool(s) available from 4 server(s)
```
but immediately follows with a secondary rendering update:
```text
Agent updated — 0 tool(s) available
```

**Assessment:** Backend log entries confirm that all 27 MCP tools remained registered. The incident did not independently prove whether the `0 tool(s)` TUI message affected the live callable tool registry at that exact moment. Treat this as an unresolved TUI/live-registry status inconsistency rather than a proven execution failure or a proven display-only bug.

---

## 14. Recovery & Rollback

If a configuration edit corrupts `~/.hermes/config.yaml`, restore the snapshot:

```bash
# Locate latest backup file
ls -lt ~/.hermes/config.yaml.bak-* | head -n 1

# Restore configuration
cp ~/.hermes/config.yaml.bak-<TIMESTAMP> ~/.hermes/config.yaml

# Restart Hermes or reload MCPs
# In Hermes chat: /reload-mcp
```

---

## 13. If This Happens Again

1. **Check Log for HTTP 401s:**
   ```bash
   tail -100 ~/.hermes/logs/agent.log | grep -iE '401|api\.you\.com'
   ```
2. **Verify Native Entries in Config:**
   ```bash
   grep -A 20 '^mcp_servers:' ~/.hermes/config.yaml
   ```
3. **If missing natively, add `mcp_servers:` blocks and run login:**
   ```bash
   hermes mcp login <server-name>
   hermes mcp test <server-name>
   ```

---

## 15. Lessons Learned & Prevention

1. **Native Precedence for OAuth:** Portable/plugin MCP definitions must be mirrored natively in `mcp_servers:` in `~/.hermes/config.yaml` if they require interactive OAuth token flows.
2. **Do Not Rely Solely on TUI Reconnect Messages:** Always cross-reference `/reload-mcp` or TUI connection indicators with backend HTTP status logs.
3. **Audit Top-Level `enabled:` Flags:** Ensure `enabled: true` is explicitly present in `mcp_servers:` configuration when troubleshooting inactive tools.

---

## 16. Credits

Troubleshooting, root-cause investigation, and runbook preparation were performed with assistance from:

- **ChatGPT** (Investigation and troubleshooting guidance)
- **Hermes Agent CLI** (Runtime execution and diagnostic tools)
- **Antigravity** (Google DeepMind Agentic AI Assistant — runbook authoring, secret auditing, and repository integration)
