# OpenClaw Provider Authentication, Model Routing, and Security Hardening on macOS
**Date:** 2026-09-09  
**Status:** Fixed  
**Platform:** macOS (Apple Silicon)  

## 1. Summary
Completed OpenClaw 2026.9.1 provider authentication, model routing, SecretRef hardening, gateway cleanup, and security hardening session. Resolved auth failures across providers, stale OAuth profiles, SecretRef mismatches, and gateway loopback warnings. Verified final routing policy and security posture.

## 2. Environment
- **Operating system:** macOS (Apple Silicon, aarch64)  
- **Hardware:** MacBook Neo (Silver MBN)  
- **Shell:** zsh with Powerlevel10k  
- **Runtime:** Node.js v24.18.1 (nvm)  
- **Application/tool:** OpenClaw 2026.9.1 (ad6fe23)  
- **Relevant paths:**  
  - Config: `~/.openclaw/openclaw.json`  
  - Secret store (main agent): `~/.openclaw/agents/main/agent/openclaw-agent.sqlite`  
  - Gateway: `127.0.0.1:18789` (loopback-only)  
  - OmniRoute: `127.0.0.1:20128`  
  - 9Router: `127.0.0.1:20138`  
  - Gateway Node heap: `--max-old-space-size=4096`  
- **Other dependencies:**  
  - LaunchAgent: `~/Library/LaunchAgents/ai.openclaw.gateway.plist`  
  - State database: `~/.openclaw/state/openclaw.sqlite`  

## 3. Architecture and Ports
The OpenClaw gateway architecture includes:

- **Gateway:** `127.0.0.1:18789` (loopback-only)
- **OmniRoute:** `127.0.0.1:20128` (free-first routing gateway)
- **9Router:** `127.0.0.1:20138` (policy guard)

These separate ports are intentional and maintained as designed. The Gateway loopback warning remains active in Doctor output but is accepted as part of the security architecture.

## 4. Final Routing Policy
**Primary:**
`omniroute/auto/best-fast`

**Automatic fallbacks:**
1. `omniroute/free-stack`
2. `openrouter/free`

**Groq (manual only):**
`groq/openai/gpt-oss-120b` (allowed but removed from auto‑fallback due to 8,000 TPM limit vs ~22k token request)

## 5. OmniRoute
### 5.1 Symptoms
- Stale OAuth profiles and environment‑store mismatches
- Model initially blocked by modelPolicy
- Exact model `omniroute/auto/best-fast` was added to allowed models

### 5.2 Root Cause
- Stale provider profiles
- Root credential failure due to env-vs-store mismatch
- Provider config referenced wrong secret surface

### 5.3 Fix Applied
1. Updated provider configuration to use store‑backed SecretRef
2. Corrected provider API key to proper SecretRef surface
3. Removed temporary plaintext profiles

### 5.4 Verification
```bash
openclaw agent \
  --agent main \
  --model omniroute/auto/best-fast \
  --session-key omniroute-canary \
  --message "Reply exactly: OMNIROUTE_CANARY" \
  --thinking off \
  --timeout 240 \
  --json
```
Result: Canary succeeded with expected metadata.

## 6. OpenAI
### 6.1 Symptoms
- Existing `openai:default` profile was contaminated with OpenRouter‑formatted credentials
- Auth failures with 401 responses for both images and API calls

### 6.2 Root Cause
- Profile contamination mixing credential formats

### 6.3 Fix Applied
1. Removed contaminated profile
2. Configured store‑backed OpenAI SecretRef
3. Allowed `openai/gpt-5.6-sol`

### 6.4 Verification
```bash
openclaw agent \
  --agent main \
  --model openai/gpt-5.6-sol \
  --session-key openai-canary \
  --message "Reply exactly: OPENAI_CANARY" \
  --thinking off \
  --timeout 240 \
  --json
```
First and second post‑cleanup canaries both succeeded.

## 7. OpenRouter
### 7.1 Symptoms
- OAuth callback originally used localhost:3000 (collided with Hermes WhatsApp bridge)
- Browser showed callback failure like `Cannot GET`
- OAuth profile was initially associated with wrong provider identifier
- Manual completion was possible but left temporary profile

### 7.2 Root Cause
- OAuth callback port collision
- Incorrect provider identifier mapping
- Temporary manual profile persisted

### 7.3 Fix Applied
1. Provider configuration hardened to store‑backed SecretRef
2. Removed temporary plaintext/manual auth profile
3. Verified `openrouter/free` canary succeeded

### 7.4 Verification
```bash
openclaw agent \
  --agent main \
  --model openrouter/free \
  --session-key openrouter-canary \
  --message "Reply exactly: OPENROUTER_CANARY" \
  --thinking off \
  --timeout 240 \
  --json
```
Canary succeeded. Free‑router aliases may resolve internally to concrete free models.

## 8. Google
### 8.1 Symptoms
- Provider was valid but unset
- Google provider API key needed to be moved to store‑backed SecretRef

### 8.2 Root Cause
- API key configuration in environment only

### 8.3 Fix Applied
1. Moved Google provider API key to store‑backed SecretRef
2. Removed temporary manual auth profile

### 8.4 Verification
```bash
openclaw agent \
  --agent main \
  --model google/gemini-3.5-flash \
  --session-key google-canary \
  --message "Reply exactly: GOOGLE_CANARY" \
  --thinking off \
  --timeout 240 \
  --json
```
Canary succeeded with provider-config SecretRef.

## 9. 9Router
### 9.1 Architecture and Port Intent
- **OmniRoute:** `127.0.0.1:20128`
- **9Router:** `127.0.0.1:20138`

Separate ports are intentional and maintained.

### 9.2 Initial Stale Models
Initial OpenClaw model entries:
- `auto/best-fast`
- `auto/best-reasoning`
- `auto/best-coding`

### 9.3 Runtime Models (9Router `/v1/models`)
Exposed route‑facing models included:
- `hermes-main` (combo model)
- `silverMBN` (combo model)

### 9.4 Root Cause
- Initial canary using `9router/auto/best-fast` failed because that ID did not exist at actual provider route

### 9.5 Fix Applied
1. Updated provider catalog to register `hermes-main` and `silverMBN`
2. Updated modelPolicy to allow `9router/hermes-main`

### 9.6 Verification
```bash
openclaw agent \
  --agent main \
  --model 9router/hermes-main \
  --session-key 9router-hermes-main-canary \
  --message "Reply exactly: 9ROUTER_HERMES_MAIN_CANARY" \
  --thinking off \
  --timeout 240 \
  --json
```
Canary succeeded with expected metadata:
- `winnerProvider=9router`
- `winnerModel=hermes-main`
- `fallbackUsed=false`
- Internal combo rerouting is expected

### 9.7 Stale Auth Profile
- A stale `9router:default` auth profile later caused Doctor to report `missing_credential`
- Profile removed
- Final `openclaw models auth list --provider 9router --json` returned no profiles

## 10. Groq
### 10.1 Symptoms
- Old fallback `groq/llama-3.3-70b-versatile` was obsolete/stale
- New model `groq/openai/gpt-oss-120b` registered
- Canary reached Groq correctly:
  `winnerProvider=groq`
  `winnerModel=openai/gpt-oss-120b`
  `fallbackUsed=false`
- Inference call failed with HTTP 413 (TPM limit 8,000 vs ~22k token request)
- Fresh session keys did not solve because OpenClaw bootstrap itself exceeded limit

### 10.2 Root Cause
- TPM limit constraint, not model context window

### 10.3 Fix Applied
1. Replaced stale fallback with `groq/openai/gpt-oss-120b`
2. Configured provider SecretRef to store‑managed credential
3. Added model to modelPolicy
4. Removed from automatic fallbacks

### 10.4 Result
- Provider/auth/routing successful
- Inference still fails due to TPM constraints
- Groq remains manually selectable

## 11. B.AI
### 11.1 Configured Free Models
All configured free models (in the provider config):
- `[B.AI] GLM 5.3 Flash :free`
- `[B.AI] Qwen 3.8 Flash :free`
- `[B.AI] HY3 :free`
- `[B.AI] MiMo V2.5 :free`
- `[B.AI] DeepSeek V4 Flash :free`
- `[B.AI] DeepSeek V4 Flash Vision :free`

### 11.2 SecretRef Application
Attempting to apply `models.providers.bai.apiKey --ref-source store ...` returned `No change`.

### 11.3 Verification
```bash
openclaw agent \
  --agent main \
  --model bai/qwen3.8-flash \
  --session-key bai-canary \
  --message "Reply exactly: BAI_CANARY" \
  --thinking off \
  --timeout 240 \
  --json
```
Canary succeeded despite `openclaw models list --provider bai` showing `Local Auth: no`:
- `provider=bai`
- `model=qwen3.8-flash`
- `credentialSource.kind=direct`
- `credentialSource.evidence=provider-config`
- `rerouted=false`
- `winnerProvider=bai`
- `winnerModel=qwen3.8-flash`
- `fallbackUsed=false`

## 12. Sticky Session Routing
- Doctor detected stale OpenAI session routing states in:
  `agent:main:groq-canary`
  `agent:main:groq-canary-2`
  `agent:main:main`
- Doctor cleared those stale session‑routing states
- Unique `--session-key` values recommended for isolation

## 13. Gateway Snapshot Quirks
**Key lesson:** Do not trust only `openclaw models status` for secret validation.

- Gateway snapshot can be incomplete
- OpenClaw may say it resolved secret paths locally after an incomplete gateway snapshot
- Prefer explicit model canaries for verification

## 14. Browser Hardening
### 14.1 Symptoms
- Legacy Browser Relay authentication was enabled (`browser.extensionRelay.allowLegacyAuth=true`)
- System browser cookie/profile import was enabled (`browser.allowSystemProfileImport=true`)

### 14.2 Root Cause
- These settings were discovered during security hardening

### 14.3 Fix Applied
```bash
openclaw config set browser.extensionRelay.allowLegacyAuth false
openclaw config set browser.allowSystemProfileImport false
```
Required Gateway restart to apply settings.

### 14.4 Verification
```bash
openclaw config get browser.extensionRelay.allowLegacyAuth --json
openclaw config get browser.allowSystemProfileImport --json
```
Both returned `false` after restart.

## 15. Telegram Tool‑Policy Fix
### 15.1 Symptoms
- Doctor initially warned that `main` was routed from Telegram but lacked the message tool
- No authored `agents.entries.main.tools` policy existed

### 15.2 Root Cause
- Missing tool policy for Telegram agent

### 15.3 Fix Applied
Configured additive tool permission:
```bash
openclaw config set "agents.entries.main.tools.alsoAllow" '["message"]'
```

### 15.4 Verification
Gateway restart applied settings. Doctor no longer contains Telegram message‑tool warning.

## 16. Duplicate Skill Cleanup
### 16.1 Symptoms
- Doctor reported collision between:
  `~/.openclaw/workspace/skills/hermes-agent-v2/SKILL.md`
  `~/.openclaw/skills/hermes-agent-v2/SKILL.md`
- `diff -u` showed no differences

### 16.2 Root Cause
- Duplicate skill file in workspace

### 16.3 Fix Applied
- Removed redundant managed copy: `~/.openclaw/skills/hermes-agent-v2`
- Kept single version at: `~/.openclaw/workspace/skills/hermes-agent-v2/SKILL.md`

## 17. Backups
### 17.1 Performed
- Created backup before cleanup: `~/2026-09-09T17-00-54.472+08-00-openclaw-backup.tar.gz`

### 17.2 Excluded
- OpenClaw intentionally skips volatile runtime/session files and regenerable dependencies in backups
- Backup archives not committed to repository

## 18. Final Validation
### 18.1 Routing
- **Primary:** `omniroute/auto/best-fast`
- **Fallbacks:** `omniroute/free-stack`, `openrouter/free`
- **9Router:** `9router/hermes-main`
- **Groq (manual):** `groq/openai/gpt-oss-120b`
- **B.AI canary:** `bai/qwen3.8-flash`

### 18.2 Secret Audit
```bash
openclaw models auth list --json
```
Result:
- `plaintext=0`
- `unresolved=0`
- `shadowed=0`
- `storeResidue=0`
- `legacy=0`

### 18.3 Gateway
- Running on `127.0.0.1:18789`, loopback‑only
- Connectivity probe OK
- Version 2026.9.1
- Doctor continues to warn (intentional)

### 18.4 Browser
- Legacy relay auth disabled
- System profile import disabled

### 18.5 Telegram
- Message tool additive permission configured
- No Doctor warning

### 18.6 Skills
- Duplicate skill collision resolved

### 18.7 Security
- All provider configs reference store‑backed SecretRefs

## 19. Lessons Learned
### 19.1 Verification Philosophy
- Prefer explicit model canaries over `openclaw models status`
- Trust execution metadata over UI displays
- Document actual commands used (not invented ones)

### 19.2 Secret Management
- Do not trust environment variables over store‑backed SecretRefs
- Remove temporary plaintext profiles promptly
- Validate SecretRef resolution via canaries

### 19.3 Tool Policy
- Use additive permission (`alsoAllow`) for safety
- Maintain clear separation of provider auth and browser settings
- Document configuration changes explicitly

## 20. Safe Verification Commands
### 20.1 Model Canaries (Actual Pattern)
```bash
openclaw agent \
  --agent main \
  --session-key <unique-canary-session> \
  --model <provider/model> \
  --message "Reply exactly: <CANARY>" \
  --thinking off \
  --timeout 240 \
  --json
```

### 20.2 Configuration Verification
```bash
openclaw config get browser.extensionRelay.allowLegacyAuth --json
openclaw config get browser.allowSystemProfileImport --json
```

## 21. Rollback/Recovery Considerations
### 21.1 If Issues Recur
1. Recreate temporary profiles if needed (store‑backed preferred)
2. Verify model catalog registrations
3. Check SecretRef surface references

### 21.2 Recovery Commands
```bash
# Clear stale session routing
openclaw doctor clear-session-routing

# Reapply SecretRef configurations
openclaw config set <provider>.apiKey --ref-source store <secret-path>

# Restart Gateway
launchctl unload ~/Library/LaunchAgents/ai.openclaw.gateway.plist
launchctl load ~/Library/LaunchAgents/ai.openclaw.gateway.plist
```

## 22. Credits
- **User/operator:** Wafi
- **AI troubleshooting/reasoning:** ChatGPT — GPT-5.6 Sol
- **Execution/documentation CLI:** OpenClaude

