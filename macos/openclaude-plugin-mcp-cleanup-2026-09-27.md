# OpenClaude Plugin/MCP Cleanup

**Date:** 2026-09-27  
**Status:** Fixed  
**Platform:** macOS

---

## 1. Summary

OpenClaw reached a problematic state with an excessive plugin ecosystem (310+ installed/enabled plugins) causing a massive MCP startup surface and numerous diagnostic errors. The system accumulated unused integrations, created confusion between installed vs enabled plugin states, and suffered from stale orphaned processes, making reliable verification impossible.

The cleanup systematically separated native from portable plugin configurations, restored proper enabled/disabled states, authenticated only necessary MCP integrations, eliminated plaintext shadow credentials, and terminated stale OpenClaw processes. The result was a manageable 44-plugin active runtime with clean diagnostics and verified authentication across 22 functional MCP servers.

---

## 2. Environment

- **Operating System:** macOS (Apple Silicon, zsh)
- **Application:** OpenClaw v0.31.0 (gateway-based environment)
- **Native Components:** Native Claude and Codex authenticated separately
- **OpenClaw Configuration:** `~/.openclaude/settings.json` (enabled plugins), `~/.openclaude/plugins/installed_plugins.json` (installed records)
- **Process Management:** Standard macOS process management
- **Ports:** Default OpenClaw gateway ports (not specific)
- **Key Files:** `~/.openclaude/`, `~/.serena/`, `~/.hermes/`

---

## 3. Symptoms

1. **Excessive Plugin Load:** 310+ installed/enabled plugin records created massive MCP startup surface
2. **Diagnostic Confusion:** ~176 MCP servers listed but many were unused or misconfigured
3. **Authentication Noise:** Numerous "Needs auth", "re-authenticate", "re-connect" warnings for non-functional integrations
4. **Stale Processes:** Orphaned OpenClaw process trees retained after configuration changes
5. **State Ambiguity:** Installed plugins vs enabled runtime state distinction was unclear
6. **Plugin Duplication:** Project-scope and user-scope plugin records created redundancy
7. **Verification Barriers:** Stale child processes prevented trustworthy cold-start verification

---

## 4. Root Cause

1. **Plugin State Confusion:** Installed plugins (manifest records) were conflated with enabled runtime plugins
2. **Accumulation Without Governance:** Integrations were installed but never reviewed for actual utility
3. **Process Lifecycle Management:** Stale child processes survived configuration cleanup
4. **Authentication Overreach:** Mass authentication attempted for integrations not actively needed
5. **State Separation Lack:** No clear boundary between what was installed vs what was enabled/used

---

## 5. What Did Not Work

- Mass disabling of all plugins with `--scope project` (OpenClaw reports: "Cannot use --scope with --all")
- Global authentication for all 310+ plugins without actual need
- Creating dummy configuration values to silence diagnostics
- Patching third-party plugin manifests for zero-error Doctor results
- Broad `pkill` patterns that terminated unrelated processes
- Relying solely on `openclaude doctor` error count for runtime health

---

## 6. Final Fix

1. **Backup Creation:** Created timestamped backups of `settings.json` and `installed_plugins.json`
2. **State Separation:** Distinguished between installed plugins (file records) vs enabled runtime plugins
3. **Targeted Cleanup:** Individually disabled unwanted project-scope and user-scope plugins
4. **Authentication Discipline:** Only authenticated MCP integrations that were actually needed
5. **Credential Hygiene:** Removed plaintext shadow credentials through proper migration
6. **Process Reset:** Terminated stale OpenClaw process trees before verification
7. **Cold-Start Verification:** Used `/reload-plugins` and `/mcp` commands for runtime validation

---

## 7. Commands

### Diagnostics & State Inspection
```bash
# Check plugin enabled count and list
openclaude plugins list --enabled
openclaude plugins list --installed

# Verify settings structure
PYTHON -c "import json; print(json.load(open('~/.openclaude/settings.json')).get('enabledPlugins', []))"

# Check installed plugins metadata
PYTHON -c "import json; print(len(json.load(open('~/.openclaude/plugins/installed_plugins.json')).get('plugins', [])))"

# Inspect running processes
ps aux | grep -E '(openclaude|claude)' | grep -v grep
```

### Plugin State Management
```bash
# Backup configuration before changes
cp ~/.openclaude/settings.json ~/.openclaude/settings.json.bak-$(date +%Y%m%d-%H%M%S)
cp ~/.openclaude/plugins/installed_plugins.json ~/.openclaude/plugins/installed_plugins.json.bak-$(date +%Y%m%d-%H%M%S)

# Disable unwanted user-scope plugins individually
openclaude plugins disable plugin-name-1 --scope user
openclaude plugins disable plugin-name-2 --scope user

# Disable unwanted project-scope plugins individually  
openclaude plugins disable plugin-name-3 --scope project
openclaude plugins disable plugin-name-4 --scope project
```

### Authentication Discipline
```bash
# Authenticate only needed MCP integrations
openclaude mcp authenticate browser-use
openclaude mcp authenticate chrome-devtools
openclaude mcp authenticate canva
# ... only authenticate actual needs
```

### Process Management
```bash
# Find and terminate stale OpenClaude processes gracefully
ps aux | grep openclaude | grep -v grep | awk '{print $2}' | xargs kill -TERM

# Force kill if TERM doesn't work (use cautiously)
ps aux | grep openclaude | grep -v grep | awk '{print $2}' | xargs kill -KILL

# Verify process cleanup
ps aux | grep -E '(openclaude|claude)' | grep -v grep
```

### Verification Commands
```bash
# Reload plugins for cold-start verification
openclaude /reload-plugins

# Check MCP server status
openclaude /mcp

# Verify plugin runtime state
openclaude plugins status --enabled --count

# Authenticate only functional MCPs
openclaude mcp authenticate browser-use chrome-devtools canva cloudflare codepath context7 dropbox gitkraken hostinger lovable lumen netlify playwright railway render resend serena wix zapier

# Validate final plugin count
openclaude plugins count --enabled
```

---

## 8. Verification

### Plugin State Verification
```bash
# Confirm enabled plugin count matches expected
ENABLED_COUNT=$(openclaude plugins count --enabled)
EXPECTED_COUNT=44
if [ "$ENABLED_COUNT" -eq "$EXPECTED_COUNT" ]; then
  echo "✓ Plugin count verification passed: $ENABLED_COUNT enabled plugins"
else
  echo "✗ Plugin count verification failed: expected $EXPECTED_COUNT, got $ENABLED_COUNT"
fi
```

### MCP Server Verification
```bash
# Check MCP server connectivity and status
openclaude /mcp | grep -E "connected|error|warning"
```

### Runtime Health Check
```bash
# Reload plugins and verify they load cleanly
openclaude /reload-plugins
openclaude /mcp | grep -c "server"

# Verify each needed MCP is connected
for server in browser-use chrome-devtools canva cloudflare codepath context7 dropbox gitkraken hostinger lovable lumen netlify playwright railway render resend serena wix zapier; do
  if openclaude mcp status "$server" | grep -q "connected"; then
    echo "✓ $server: connected"
  else
    echo "✗ $server: disconnected"
  fi
done
```

### Process Cleanup Verification
```bash
# Confirm no stale OpenClade processes remain
if ps aux | grep -E '(openclaude|claude)' | grep -v grep | grep -v "grep.*process" | head -5; then
  echo "⚠ Warning: potential stale processes still running"
else
  echo "✓ No stale processes detected"
fi
```

---

## 9. Final Working State

| Item | Known-good value |
|------|-------------------|
| OpenClaw Version | v0.31.0 |
| Enabled Plugins | 44 (managed subset of 310+ installed) |
| Installed Plugins | 310+ (historical records, not all enabled) |
| MCP Servers Connected | 22 (user MCPs + plugin MCPs) |
| User MCPs | basic-memory, graph-memory, memory-service |
| Plugin MCPs | browser-use, canva, chrome-devtools, cloudflare, codepath, context7, dropbox, gitkraken, hostinger, lovable, lumen, netlify, playwright, railway, render, resend, serena, wix, zapier |
| Plugin Errors | 7 (disabled/not part of active runtime) |
| Stale Processes | Terminated and verified clean |
| Authentication State | Only functional integrations authenticated |

---

## 10. Optional Cleanup

- **Historical Plugin Records:** Plugin installations beyond active needs can be uninstalled if they consume storage or create unnecessary onboarding friction
- **Stale Authentication Tokens:** Revoke OAuth tokens for integrations that are no longer used
- **Orphaned Configuration:** Remove unused entries from settings files after verification
- **Process History:** Old process logs can be archived if disk space is constrained

---

## 11. If This Happens Again

### Shortest Diagnostic Sequence
```bash
# Step 1: Check plugin state separation
ENABLED=$(openclaude plugins count --enabled)
INSTALLED=$(python -c "import json; print(len(json.load(open('~/.openclaude/plugins/installed_plugins.json')).get('plugins', [])))")
echo "Enabled: $ENABLED, Installed: $INSTALLED"

# Step 2: Verify process cleanup
ps aux | grep -E '(openclaude|claude)' | grep -v grep | wc -l

# Step 3: Check MCP runtime health
openclaude /reload-plugins
openclaude /mcp | grep "connected" | wc -l

# Step 4: Final validation
if [ "$ENABLED" -le 50 ] && [ "$(ps aux | grep -E '(openclaude|claude)' | grep -v grep | wc -l)" -eq 0 ]; then
  echo "✓ Runtime appears healthy"
else
  echo "✗ Runtime issues detected"
fi
```

### Shortest Recovery Procedure
```bash
# 1. Backup and clean plugin state
cp ~/.openclaude/settings.json ~/.openclaude/settings.json.bak-clean
cp ~/.openclaude/plugins/installed_plugins.json ~/.openclaude/plugins/installed_plugins.json.bak-clean

# 2. Reset to minimal essential set
openclaude plugins disable-all --scope user --confirm
openclaude plugins disable-all --scope project --confirm

# 3. Authenticate only essential MCPs
openclaude mcp authenticate browser-use chrome-devtools canva cloudflare codepath context7 dropbox gitkraken hostinger lovable lumen netlify playwright railway render resend serena wix zapier

# 4. Terminate any orphaned processes
ps aux | grep -E '(openclaude|claude)' | grep -v grep | awk '{print $2}' | xargs kill -TERM

# 5. Verify recovery
openclaude /reload-plugins
openclaude plugins count --enabled
```

---

## 12. Lessons Learned & Prevention

1. **Separate States:** Always distinguish between installed plugins (manifest records) vs enabled runtime plugins (actual usage)
2. **Targeted Cleanup:** Prefer individual plugin management over mass operations that cause errors
3. **Authentication Discipline:** Only authenticate MCP integrations that are actually needed
4. **Process Lifecycle:** Terminate stale child processes before configuration verification
5. **Runtime Validation:** Use `/reload-plugins` and `/mcp` for runtime health checks, not `doctor` error counts
6. **Backup First:** Always backup configuration before bulk plugin operations
7. **Credential Hygiene:** Use proper secrets migration, never hand-edit or create plaintext shadows
8. **Regular Reviews:** Periodically audit installed plugins and remove unused integrations

---

## 13. Credits

- **Incident Identification & Initial Analysis:** WfSpr
- **Root Cause Investigation:** ChatGPT (Investigation and troubleshooting guidance)
- **Plugin State Management:** OpenClaw CLI (Runtime execution and diagnostic tools)
- **Process Management:** macOS tools (`ps`, `kill`, `launchctl`)
- **Verification & Documentation:** WorkBuddy AI (Runbook authoring, secret auditing, and repository integration)
- **Supporting Tooling:** zsh, OpenClaw v0.31.0, various MCP servers and integrations
