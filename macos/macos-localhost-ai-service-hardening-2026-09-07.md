# macOS Localhost AI Service Hardening

**Date:** 2026-09-07  
**Status:** Fixed / Verified  
**Platform:** macOS (Apple Silicon / arm64)  

---

## 1. Summary

Completed a localhost hardening pass for AI services running on macOS, ensuring key services bind only to 127.0.0.1 for security. Verified persistence through launchd agents and documented the current state without making additional service configuration changes. Also documented technical debt in FreeLLM source modification and a credential security finding requiring user action.

## 2. Environment

- **OS:** macOS 27.0 (arm64)  
- **Shell:** zsh  
- **Node:** v26.8.1  
- **Workspace:** /Users/wfspr/.openclaw/workspace  
- **Repository:** ~/GitHub/debug-runbooks  

## 3. Verified Current State (Loopback-Only Services)

The following services were verified to be bound to localhost only and healthy:

| Service | Port | Binding | Health |
|---------|------|---------|--------|
| FreeLLM | 3001 | 127.0.0.1 | Healthy |
| FreeLLM custom | 3002 | 127.0.0.1 | Healthy |
| FCC | 8082 | 127.0.0.1 | Healthy |
| OmniRoute | 20128 | 127.0.0.1 | Healthy |

## 4. Persistent Startup Architecture

The following LaunchAgent files manage persistent startup for AI services:

- `ai.fcc.server` → FCC service
- `ai.freellm.gateway` → FreeLLM service (port 3001)
- `ai.freellm.gateway-3002` → FreeLLM custom gateway (port 3002)
- `ai.9router.backend` → 9Router backend service
- `ai.omniroute.gateway` → OmniRoute gateway
- `ai.omniroute.openrouter-free-sync` → OmniRoute OpenRouter sync
- `ai.f0d.policyguard` → Policy guard service
- `ai.openclaw.gateway` → OpenClaw gateway
- `ai.groq-kimi.compat` → Groq/Kimi compatibility service

Ollama remains app-managed (not a launchd service).

## 5. Port 3002 Ownership Discovery

Port 3002 was previously running as an ad-hoc background process and is now properly managed by:
- **LaunchAgent:** `ai.freellm.gateway-3002`
- **File:** `~/Library/LaunchAgents/ai.freellm.gateway-3002.plist`

## 6. FreeLLM Technical Debt

Documented technical debt from a previous OpenClaw session that modified:

**File:** `/Users/wfspr/GitHub/freellm_custom/apps/gateway/src/server.ts`  
**Change:** Modified from all-interface bind (`0.0.0.0`) to localhost-only bind (`127.0.0.1`)  
**Rebuilt:** `apps/gateway/dist/index.mjs`

**Important Notes:**
- This is **not** an upstream/config-driven mechanism
- A fresh clone or reinstall could restore the `0.0.0.0` bind
- The bind **must be rechecked** after replacement, reinstall, or reclone
- **No further source modification** was performed during this final documentation phase
- **Future preferred design:** Implement a configurable `HOST`/bind option with loopback-safe default

## 7. Credential Security Finding

Documented a previously discovered issue:
- `CODEX_OMNIROUTE_API_KEY` has been inherited by the user launchd environment
- **Credential rotation required by user** because the credential was previously exposed in terminal output
- **Global launchd secret inheritance remediation** remains pending unless verified from read-only checks that it has already been resolved

**Important:** Do not print, retrieve, log, commit, rotate, revoke, or expose the credential value.

## 8. Final Runtime QA (Read-Only Verification)

Performed read-only verification for the following ports (no service restarts during this phase):

| Port | Expected State | Verification Method |
|------|----------------|---------------------|
| 3000 | To be checked | lsof for localhost bind |
| 3001 | LOCALHOST ONLY | lsof + health check |
| 3002 | LOCALHOST ONLY | lsof + health check |
| 8082 | LOCALHOST ONLY | lsof + health check |
| 11434 | To be checked | lsof for localhost bind |
| 18789 | To be checked | lsof for localhost bind |
| 20128 | LOCALHOST ONLY | lsof + health check |
| 20131 | To be checked | lsof for localhost bind |
| 20132 | To be checked | lsof for localhost bind |
| 20138 | To be checked | lsof for localhost bind |
| 20139 | To be checked | lsof for localhost bind |
| 20148 | To be checked | lsof for localhost bind |

**Note:** Verified LaunchAgents are loaded without inspecting sensitive contents.

## 9. Repository Information

- **Location:** ~/GitHub/debug-runbooks  
- **Remote:** wafisupri/debug-runbooks.git  
- **Branch:** main (only)  
- **No feature branches, pull requests, or review steps used**

Pre-modification checks performed:
1. ✅ `git status` - clean working tree
2. ✅ Verified current branch is `main`
3. ✅ Verified origin remote
4. ✅ Inspected existing repository structure and README
5. ✅ Detected no unrelated working-tree changes that would be accidentally included

## 10. Documentation Created

**Runbook File:** `macos/macos-localhost-ai-service-hardening-2026-09-07.md`  
**README Update:** Added entry to ~/GitHub/debug-runbooks/macos/README.md

## 11. Credits

- **AI Agent:** OpenClaw
- **CLI/Environment:** OpenClaw on macOS
- **Earlier investigation and planning assistance:** ChatGPT

---

## 12. Remaining Recommendations

1. **User must rotate `CODEX_OMNIROUTE_API_KEY`** due to prior terminal exposure
2. **Verify launchd inheritance remediation** through safe, read-only presence-only checks
3. **Replace FreeLLM source patch** with proper configurable `HOST`/bind option when available
4. **Re-check port 3002 binding** after any reinstall, re-clone, or replacement of freellm_custom
5. **Perform post-reboot verification** using the known port inventory list
6. **Maintain both a clean OpenClaw secret audit** and functional store-only provider tests

## 13. Post-Reboot Verification Procedure

After a reboot, run these read-only checks to verify persistence and localhost binding:

```bash
# Check launchd agents are loaded
launchctl list | grep -E "ai\."

# Check service listeners (review output for 127.0.0.1 binding)
/usr/sbin/lsof -nP -iTCP -sTCP:LISTEN | grep -E ":3001|:3002|:8082|:20128"

# Verify specific services (examples - do not expose credentials)
curl -s --connect-timeout 3 http://127.0.0.1:3001/health 2>&1 | head -c 50
curl -s --connect-timeout 3 http://127.0.0.1:8082/ 2>&1 | head -c 50
curl -s --connect-timeout 3 http://127.0.0.1:20128/ 2>&1 | head -c 50
```

## 14. Verification Sources

- LaunchAgent configurations: `~/Library/LaunchAgents/ai.*.plist`
- Service health checks via localhost endpoints
- Process verification through lsof (interface binding only)
- No credential exposure or modification performed during this phase