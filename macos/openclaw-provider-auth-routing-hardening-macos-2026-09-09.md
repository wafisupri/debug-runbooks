# OpenClaw Provider Authentication, Model Routing, and Security Hardening on macOS
**Date:** 2026-09-09  
**Status:** Fixed  
**Platform:** macOS (Apple Silicon)  

## 1. Summary
Completed the OpenClaw 2026.9.1 provider authentication, model-routing, SecretRef, gateway, browser, and agent-policy hardening session. Provider authentication failures were corrected, temporary plaintext profiles were removed where documented, route-facing model catalogs were repaired, and final routes were proven with explicit agent canaries.

The Gateway remains intentionally loopback-only on `127.0.0.1:18789`. Doctor continues to warn about loopback-only exposure, but that warning was accepted. The Gateway was not changed to LAN exposure.

## 2. Environment
- **Operating system:** macOS (Apple Silicon, aarch64)
- **Hardware:** MacBook Neo (Silver MBN)
- **Shell:** zsh with Powerlevel10k
- **Runtime:** Node.js v24.18.1 through nvm
- **Application:** OpenClaw 2026.9.1 (`ad6fe23`)
- **OpenClaw configuration:** `~/.openclaw/openclaw.json`
- **State database:** `~/.openclaw/state/openclaw.sqlite`
- **Main-agent authentication database:** `~/.openclaw/agents/main/agent/openclaw-agent.sqlite`
- **Gateway:** `127.0.0.1:18789`
- **Gateway LaunchAgent:** `~/Library/LaunchAgents/ai.openclaw.gateway.plist`
- **Gateway Node heap:** `--max-old-space-size=4096`
- **OmniRoute:** `127.0.0.1:20128`
- **9Router:** `127.0.0.1:20138`

## 3. Architecture and Ports
The routing stack intentionally uses separate loopback ports:

- **OpenClaw Gateway:** `127.0.0.1:18789`
- **OmniRoute:** `127.0.0.1:20128`
- **9Router policy guard:** `127.0.0.1:20138`

The 20128 and 20138 ports are not duplicate or conflicting ports. They must remain separate.

## 4. Final Routing Policy
- **Primary:** `omniroute/auto/best-fast`
- **Automatic fallback 1:** `omniroute/free-stack`
- **Automatic fallback 2:** `openrouter/free`
- **9Router:** `9router/hermes-main`
- **Groq manual only:** `groq/openai/gpt-oss-120b`

Groq was deliberately removed from automatic fallback routing after its on-demand tier rejected the full OpenClaw request for token-per-minute exhaustion.

## 5. Allowed Models
The final allowlist contained:

- `openrouter/free`
- `openrouter/openai/gpt-oss-20b:free`
- `google/gemini-3.5-flash`
- `omniroute/free-stack`
- `omniroute/auto/best-fast`
- `openai/gpt-5.6-sol`
- `9router/hermes-main`
- `groq/openai/gpt-oss-120b`
- `bai/glm-5.3-flash`
- `bai/qwen3.8-flash`
- `bai/hy3`
- `bai/mimo-v2.5`
- `bai/deepseek-v4-flash`
- `bai/deepseek-v4-flash-vision-exp`

## 6. OpenRouter
### 6.1 Symptoms
- The OAuth callback initially used localhost port `3000`.
- Port `3000` collided with the Hermes WhatsApp bridge.
- The browser displayed a callback failure such as `Cannot GET`.
- The OAuth profile was initially associated with the wrong provider identifier.
- Temporary/manual authentication remained during troubleshooting.

### 6.2 Root Cause
The OAuth flow combined a port collision with a provider-identifier mismatch. Manual completion of the final redirect could recover a request, but it did not produce a clean permanent provider configuration.

### 6.3 Fix
- Completed the OAuth flow manually when necessary.
- Hardened the provider API key configuration as a store-backed SecretRef.
- Removed the temporary plaintext/manual auth profile after verification.

### 6.4 Result
- `openrouter/free` canary succeeded.
- Free-router aliases were observed to resolve internally to concrete free models.
- Temporary plaintext/manual authentication was removed.

## 7. OmniRoute
### 7.1 Symptoms
- Stale profiles existed.
- `omniroute/auto/best-fast` was initially blocked by `modelPolicy`.
- Root credential resolution failed despite a credential being present in the store.

### 7.2 Root Cause
The root credential failure was an environment-versus-store mismatch. The store contained the credential, while the provider configuration referenced the wrong secret surface.

### 7.3 Fix
- Added `omniroute/auto/best-fast` to allowed models.
- Changed the provider API key configuration to a store-backed SecretRef.
- Removed the temporary/manual plaintext profile after verification.
- Preserved OmniRoute at `127.0.0.1:20128`.

### 7.4 Result
`omniroute/auto/best-fast` canary succeeded.

## 8. OpenAI
### 8.1 Symptoms
- The existing `openai:default` profile contained an OpenRouter-formatted credential.
- OpenAI authentication failed.
- Image and API requests produced 401 authentication failures.

### 8.2 Root Cause
The OpenAI profile had been contaminated by a credential from another provider format.

### 8.3 Fix
- Removed the contaminated `openai:default` profile.
- Configured the OpenAI provider API key as a store-backed SecretRef.
- Allowed `openai/gpt-5.6-sol`.
- Removed the temporary/manual profile after verification.

### 8.4 Result
`openai/gpt-5.6-sol` succeeded. A second canary after profile removal also succeeded, proving runtime operation through the provider-config SecretRef without the temporary profile.

## 9. Google
### 9.1 Symptoms
- The Google provider was valid but unset.
- Runtime authentication depended on an unsuitable provider configuration surface.

### 9.2 Root Cause
The Google provider API key was not configured as the store-backed SecretRef used by the provider configuration.

### 9.3 Fix
- Moved the Google provider API key to a store-backed SecretRef.
- Allowed `google/gemini-3.5-flash`.
- Removed the temporary/manual auth profile after verification.

### 9.4 Result
`google/gemini-3.5-flash` canary succeeded. Runtime continued through the provider-config SecretRef.

## 10. 9Router
### 10.1 Initial Model Mismatch
Initial stale OpenClaw model entries were:

- `auto/best-fast`
- `auto/best-reasoning`
- `auto/best-coding`

The actual 9Router `/v1/models` endpoint exposed route-facing models including:

- `hermes-main`
- `silverMBN`

Both `hermes-main` and `silverMBN` are combo models.

### 10.2 Failed Initial Canary
The initial canary used `9router/auto/best-fast`. It failed because that model ID did not exist at the actual provider route.

### 10.3 Fix
- Updated the authored provider catalog to register `hermes-main` and `silverMBN`.
- Updated `modelPolicy` to allow `9router/hermes-main`.

### 10.4 Verified Routing Metadata
The successful canary reported:

- Requested provider: `9router`
- Requested model: `hermes-main`
- Effective provider: `9router`
- Effective model: `hermes-main`
- `winnerProvider=9router`
- `winnerModel=hermes-main`
- `fallbackUsed=false`

9Router internally selected the response model as part of its combo-model behavior. That internal rerouting is expected and is not an OpenClaw fallback.

### 10.5 Stale Authentication Profile
A stale `9router:default` auth profile later caused Doctor to report `missing_credential`, even though provider-config SecretRef runtime requests worked.

The stale profile was removed. Final verification returned:

```bash
openclaw models auth list --provider 9router --json
```

```json
{"profiles": []}
```

This proves the 9Router namespace was empty after cleanup. It does not prove that every provider-specific auth namespace in the machine was globally empty.

## 11. Groq
### 11.1 Provider and Model Repair
The old fallback `groq/llama-3.3-70b-versatile` was obsolete/stale and was replaced.

The replacement provider model was:

`groq/openai/gpt-oss-120b`

It used the OpenAI-compatible Groq endpoint and a provider SecretRef backed by the store-managed Groq credential. The model was added to `modelPolicy`.

### 11.2 Provider, Authentication, and Routing Verification
The canary reached Groq correctly:

- `winnerProvider=groq`
- `winnerModel=openai/gpt-oss-120b`
- `fallbackUsed=false`

This proves provider authentication and routing worked. It does not mean the complete inference call succeeded.

### 11.3 Inference Failure
The complete call failed with HTTP 413 because the Groq service tier was on-demand and allowed 8,000 TPM. The OpenClaw main-agent request was approximately 22,000 tokens.

Fresh session keys including `groq-canary` and `groq-canary-2` did not solve the failure. OpenClaw's base bootstrap, system context, and tool context were already too large before user input was added.

### 11.4 Context Window Versus TPM
The model supports a 131k context window, but the account/service tier permits only 8,000 tokens per minute. A large context window does not override the account-level TPM limit.

The failure was TPM exhaustion, not model context-window exhaustion.

### 11.5 Final Policy
- Groq authentication is working.
- Groq remains manually selectable as `groq/openai/gpt-oss-120b`.
- Groq was removed from automatic fallback routing.

## 12. B.AI
### 12.1 Configured Free Models
The provider exposed these configured free models:

- `[B.AI] GLM 5.3 Flash :free`
- `[B.AI] Qwen 3.8 Flash :free`
- `[B.AI] HY3 :free`
- `[B.AI] MiMo V2.5 :free`
- `[B.AI] DeepSeek V4 Flash :free`
- `[B.AI] DeepSeek V4 Flash Vision :free`

### 12.2 SecretRef State
The provider configuration already used the intended store SecretRef. Reapplying the store reference returned:

`No change`

`openclaw models list --provider bai` displayed `Local Auth: no`. That table output was a status-display quirk, not proof that runtime authentication was absent.

### 12.3 Runtime Verification
A real canary using `bai/qwen3.8-flash` succeeded with:

- `provider=bai`
- `model=qwen3.8-flash`
- `credentialSource.kind=direct`
- `credentialSource.evidence=provider-config`
- `rerouted=false`
- `winnerProvider=bai`
- `winnerModel=qwen3.8-flash`
- `fallbackUsed=false`

Runtime canary evidence superseded the misleading `Local Auth: no` table output.

## 13. Sticky Session Routing
Explicit model testing must always include `--model`.

Existing sessions can retain stale runtime/provider routing. Doctor detected stale OpenAI session-routing state in:

- `agent:main:groq-canary`
- `agent:main:groq-canary-2`
- `agent:main:main`

Doctor cleared those stale session-routing states.

Use `/model default`, `/new`, `/reset`, or a unique `--session-key` to isolate model tests.

## 14. Gateway Snapshot Quirks
Do not trust only `openclaw models status`.

Observed limitations:

- The Gateway snapshot can be incomplete.
- OpenClaw may report that it resolved secret paths locally after receiving an incomplete Gateway snapshot.
- A locally resolved path is not sufficient proof that the provider request used the intended credential.

Prefer explicit model canaries. Trust execution metadata including:

- `provider`
- `model`
- `credentialSource`
- Requested and effective model
- `executionTrace`
- `winnerProvider`
- `winnerModel`
- `fallbackUsed`

## 15. Gateway
### 15.1 Final State
- macOS LaunchAgent loaded.
- Gateway runtime was running.
- Address: `127.0.0.1:18789`
- Exposure: loopback-only
- Connectivity probe: OK
- CLI version: OpenClaw 2026.9.1
- Gateway version: OpenClaw 2026.9.1
- Gateway Node heap: `--max-old-space-size=4096`

### 15.2 Intentional Warning
Doctor continues to warn that the Gateway is loopback-only. This is intentional and accepted. The warning should not be "fixed" by exposing the Gateway to a LAN unless remote exposure is explicitly required.

## 16. Browser Hardening
Browser Relay authentication and system-profile import were separate security-hardening findings discovered by Doctor. They were not shown to cause the provider credential failures.

Final settings:

```text
browser.extensionRelay.allowLegacyAuth=false
browser.allowSystemProfileImport=false
```

A Gateway restart was required to apply both settings.

Final verification returned:

```text
false
false
```

## 17. Telegram Message Tool
Doctor initially warned that `main` was routed from Telegram but lacked the message tool.

Initially, no authored `agents.entries.main.tools` policy existed. The safe additive configuration used:

```text
agents.entries.main.tools.alsoAllow=["message"]
```

After the Gateway restarted, the Telegram message-tool warning disappeared from Doctor.

`alsoAllow` was preferred over replacing the entire agent tool policy because it added only the missing `message` capability without discarding other tool decisions or policy content.

## 18. Duplicate `hermes-agent-v2` Skill
Doctor reported:

- Winner: `~/.openclaw/workspace/skills/hermes-agent-v2/SKILL.md`
- Loser: `~/.openclaw/skills/hermes-agent-v2/SKILL.md`

`diff -u` returned no differences. The files were identical.

The redundant managed copy was removed:

`~/.openclaw/skills/hermes-agent-v2`

The surviving skill remained:

`~/.openclaw/workspace/skills/hermes-agent-v2/SKILL.md`

The next Doctor run no longer reported the collision.

## 19. Backups
Backups were created before final cleanup.

Example backup:

`~/2026-09-09T17-00-54.472+08-00-openclaw-backup.tar.gz`

OpenClaw intentionally skipped volatile runtime/session files and regenerable dependencies. The backup archive was kept outside the Git repository.

Do not commit backup archives into this repository.

## 20. Final Validation
### 20.1 Routing
- Primary: `omniroute/auto/best-fast`
- Automatic fallbacks: `omniroute/free-stack`, `openrouter/free`
- 9Router: `9router/hermes-main`
- Groq manual: `groq/openai/gpt-oss-120b`
- B.AI canary: `bai/qwen3.8-flash`

### 20.2 Secret Audit
The final secret audit returned:

```text
plaintext=0
unresolved=0
shadowed=0
storeResidue=0
legacy=0
```

### 20.3 Gateway
- Running
- Connectivity probe OK
- Loopback address `127.0.0.1:18789`
- Loopback-only warning intentional

### 20.4 Browser
- Legacy relay authentication disabled
- System-profile import disabled

### 20.5 Telegram
- Additive `message` tool permission configured
- Doctor warning cleared

### 20.6 Skill Collision
- Duplicate managed copy removed
- Collision cleared

### 20.7 Backup
- Created successfully
- Kept outside the Git repository

## 21. Intentional Doctor Warnings Left Alone
The following findings were informational or non-blocking:

- Loopback-only Gateway
- Host Desktop disabled
- Personal Codex CLI assets are not automatically loaded by native Codex-mode agents
- GitHub project access is public-only unless a Gateway GitHub token is supplied
- Local Whisper device auto-selection
- OmniRoute local-model-catalog warning
- OpenRouter local-model-catalog warning

Runtime canaries already proved the relevant model routes.

## 22. Security Lessons
- Do not trust only `openclaw models status`.
- Do not trust an incomplete Gateway snapshot as final credential evidence.
- Prefer explicit model canaries and execution metadata.
- Never print complete OpenClaw configuration files.
- Never print raw authentication SQLite databases.
- Do not use broad environment dumps containing API keys.
- Store-backed SecretRefs were preferred over temporary plaintext/manual profiles.
- Temporary plaintext/manual profiles were removed when no longer needed.
- Keep separate provider and Gateway ports as designed.
- Keep Groq manual because its TPM limit is independent of model context size.

## 23. Safe Verification Commands
### 23.1 Explicit Model Canary
Use a unique session key for every provider test:

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

Inspect the returned provider, model, credential source, requested/effective model, execution trace, winner fields, and fallback state.

### 23.2 Browser Settings
```bash
openclaw config get browser.extensionRelay.allowLegacyAuth --json
openclaw config get browser.allowSystemProfileImport --json
```

Expected result after restart:

```text
false
false
```

### 23.3 9Router Auth Namespace
```bash
openclaw models auth list --provider 9router --json
```

Expected final result:

```json
{"profiles": []}
```

## 24. Rollback and Recovery
1. Restore the OpenClaw configuration backup if provider configuration changes must be reversed.
2. Compare the restored configuration with the known-good SecretRef structure without printing secret values.
3. Restart the Gateway after configuration changes.
4. Run one explicit canary for one provider and inspect execution metadata.
5. If routing is stale, use `/new`, `/reset`, or a unique `--session-key`.
6. If a combo model reroutes internally, compare requested and effective models before classifying it as an OpenClaw fallback.
7. If Groq returns HTTP 413, reduce bootstrap/system/tool context or use another provider; changing the session key alone will not restore the 8,000 TPM allowance.
8. If a duplicate skill collision returns, compare `SKILL.md` files with `diff -u` before deleting a managed copy.

## 25. Credits
- **User/operator:** Wafi
- **AI troubleshooting/reasoning:** ChatGPT — GPT-5.6 Sol
- **Execution/documentation CLI:** OpenClaude
