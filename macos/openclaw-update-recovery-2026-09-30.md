# OpenClaw Update Recovery — 2026.9.6 Rollout, Stale Triage Process, and Shell PATH Cleanup

**Date:** 2026-09-30

**Status:** Fixed / Verified; provider-model, secrets, and dead-letter cleanup remain follow-up

**Platform:** macOS (Apple Silicon / arm64)

**Scope:** Restoring a healthy OpenClaw Gateway after a routine 2026.9.6 update surfaced errors on the CLI, the web dashboard, the Desktop app, and Telegram — without deleting queues, SQLite state, archives, or configuration.

---

## 1. Summary

A routine OpenClaw update produced errors on four surfaces at once: the CLI, the web dashboard, the Desktop app, and Telegram. The update itself eventually succeeded and the Gateway returned to a healthy, loopback-bound state on `127.0.0.1:18789`.

What remained after the update was not a broken install. It was residue and mismatch:

1. **Shell PATH / Node runtime mismatch.** `~/.local/bin` was prepended by several startup files, so `~/.local/bin/node` shadowed the intended runtime. OpenClaw rejected that interpreter and silently retried with a different Node, which makes triage confusing because the runtime actually executing the command is not the one the operator selected.
2. **A stale `openclaw triage` process.** An old triage process was still alive, still reasoning against old 2026.9.4 recovery context, and still holding a `claude --safe-mode` child. It was terminated.
3. **Telegram noise.** Telegram was configured and, once the Gateway settled, delivered outbound messages successfully. The problem was error spam during the unstable window plus a dead-letter queue warning, not a broken integration.
4. **Provider/model probe timeouts.** Logs from the window showed provider probes timing out and a schema/tool payload rejection from a model/provider call. These are provider-configuration debt, not update failures.
5. **Non-blocking warnings.** Plaintext secret-bearing config warning, missing `policy.jsonc`, historical transcript/SQLite archive warning, dead-letter delivery warning, Gateway service PATH warning, model/provider catalog mismatch, plugin compatibility info, and an extra `openclaw` agent directory with 0 sessions.

The operator's goal was a working OpenClaw, not a deep repair loop. The recovery principle applied here was **stabilize first, clean up later**: reinstall the Gateway service, verify health, remove the stale process, fix PATH ordering, and defer every optional cleanup to a separate controlled task.

### Evidence and scope

- The incident chronology, the Desktop app symptoms, and the provider-probe timeout list are **operator-reported**. The Gateway log for 2026-09-29 to 2026-09-30 was rotated and is no longer on disk, so those log lines could not be re-read.
- This documentation session independently verified, on the live machine: CLI and Gateway versions, the LaunchAgent state and command line, the loopback bind and listening socket, connectivity probe result, update-run status and version transition, update availability, service-definition drift and warnings, health output (channels, heartbeat, delivery queue, session store), the dead-letter warning, the agent inventory, the security audit summary, the shell startup-file edits and their backup directory, current runtime resolution in a login shell, and the absence of any `openclaw triage` process.
- No credential value, Telegram bot token, Gateway auth token, bearer token, or SecretRef resolved value was read, printed, or committed. No OpenClaw configuration file was pasted into this runbook. Log lines are summarized, never pasted in bulk.

### Version note

At the end of the incident window the verified version was **2026.9.6**. A later update run finished on **2026-10-01** and moved the install from 2026.9.6 to **2026.9.7** (`c074824`). Live facts recorded below were captured during the 2026-10-03 documentation session and therefore show 2026.9.7. Both facts are correct for their moment; they are not in conflict.

---

## 2. Environment

| Component | Relevant detail |
| --- | --- |
| Host | `silverMBN-2.local`, macOS 27.0.1 (arm64), Apple Silicon |
| Install method | npm-global (`installKind: package`, `packageManager: npm`) |
| Install root | `~/.nvm/versions/node/v24.18.1/lib/node_modules/openclaw` |
| OpenClaw at incident close | 2026.9.6 |
| OpenClaw at documentation session | 2026.9.7 (`c074824`) |
| CLI binary | `~/.nvm/versions/node/v24.18.1/bin/openclaw` |
| Shim | `~/.local/bin/openclaw` |
| Install/CLI runtime | Node.js v24.18.1 (nvm) |
| Gateway runtime | `/opt/homebrew/bin/node` (Homebrew Node 26.8.1) |
| Gateway service | LaunchAgent `~/Library/LaunchAgents/ai.openclaw.gateway.plist`, loaded and running |
| Gateway command | `/opt/homebrew/bin/node --max-old-space-size=4096 .../openclaw/dist/index.js gateway --port 18789` |
| Gateway bind | loopback (`127.0.0.1`), port `18789` |
| Dashboard | `http://127.0.0.1:18789/` |
| Configuration | `~/.openclaw/openclaw.json` |
| Update channel | stable (config) |
| Messaging | Telegram integration configured, 1/1 accounts |
| Heartbeat interval | 4h (agent `main`) |
| Shell | zsh with `~/.zprofile`, `~/.zshrc`, `~/.zshenv`, `~/.profile` |

Do not confuse the OpenClaw Gateway with other local gateways on this host (Hermes, FCC, 9Router, OmniRoute). They are separate services with separate LaunchAgents and separate ports.

---

## 3. Symptoms

1. Errors appeared simultaneously on the CLI, the web dashboard, the Desktop app, and Telegram.
2. An old "Ask OpenClaw" thread kept presenting stale update/repair guidance, so the operator was repeatedly pushed back into a repair path that no longer matched the installed version.
3. The Desktop app showed a model/provider **schema or tool payload rejection**, which reads like an application bug but is a provider/model contract problem.
4. Telegram delivered error messages to the operator during the unstable window.
5. `openclaw health` reported dead-lettered delivery entries.
6. The earlier update path showed global install/update-repair symptoms, including a suggestion to run repair tooling.
7. Invoking the CLI from a shell whose `node` resolved to the shadowed `~/.local/bin/node` produced an automatic runtime substitution instead of a clean failure:

```text
openclaw: Retrying with "/opt/homebrew/Cellar/node/26.8.1/bin/node" (managed Gateway service; current Node failed runtime admission).
```

That line is the single most useful diagnostic in this incident. It means the interpreter executing the command is not the one `PATH` named.

---

## 4. Root Cause

### 4.1 Shell PATH / Node runtime mismatch

`~/.local/bin` was prepended to `PATH` from multiple startup files. Because `~/.local/bin/node` exists, it won every resolution race and became the `node` that OpenClaw launched with. OpenClaw rejected that runtime and retried with the nvm Node v24.18.1 build, so the CLI appeared to work while quietly running on a substituted interpreter.

The repair was ordering, not deletion: disable the repeated prepends, then re-add `~/.local/bin` **later** in `PATH` so its tools stay reachable but its Node can never shadow the intended runtime.

### 4.2 Stale triage process

An `openclaw triage` process from the 2026.9.4 recovery window was still alive and still reasoning against old recovery context. Its process chain included `openclaw triage` → `openclaw` → `openclaw-triage` → `claude --safe-mode`. A stale process holding old context keeps re-issuing guidance that no longer applies, which is why the operator saw repair suggestions that did not match the installed version. The process was terminated; a follow-up check confirmed no triage process remained.

### 4.3 Telegram noise versus the scheduled heartbeat

Telegram was configured throughout and later delivered outbound messages successfully. Two separate things were misfiled as one problem:

- the scheduled **4-hour heartbeat**, which is expected behaviour, and
- **error spam** during the unstable window, which is not.

`openclaw health` also reported dead-lettered delivery entries. Later log lines show successful Telegram outbound sends. The correct conclusion is that the channel works and the queue warning is old residue — not that Telegram state needs manual deletion.

### 4.4 Provider and model probe timeouts

Logs from the window showed multiple provider probes timing out across a broad provider set (OpenAI, OmniRoute, OpenCode/OpenCode Go, NVIDIA, OpenRouter, Vercel AI Gateway, Hugging Face, Groq, Google, Ollama), plus a schema/tool payload rejection from provider/model usage. A probe timeout is a provider-configuration or credential-surface problem. It is not an installer failure, and chasing it during recovery is what turns a ten-minute recovery into a repair loop.

### 4.5 Non-blocking warnings

Each of these survived the recovery and none of them blocks a healthy Gateway:

- plaintext secret-bearing configuration warning
- missing `policy.jsonc`
- historical transcript / SQLite archive warning
- dead-letter delivery queue warning
- Gateway service PATH warning (PATH includes a version manager directory)
- model/provider catalog mismatch
- plugin compatibility info, for example `composio` reported as hook-only
- extra agent directory `openclaw` with 0 sessions

Treat this list as a backlog, not as an outage.

---

## 5. What Did Not Work

| Attempt or assumption | Why it failed / lesson |
| --- | --- |
| Stacking several recovery paths at once (`update repair`, `doctor --fix`, secrets reconfiguration) | Each mutation invalidates the evidence of the previous one; the operator loses the ability to attribute a change to an outcome |
| Following stale triage guidance from the old thread | The process was reasoning against 2026.9.4 context while the install had moved on |
| Trusting the `node` that `PATH` resolves | OpenClaw silently substitutes an accepted runtime, so the effective interpreter differs from the invoked one |
| Deleting `~/.local/bin` to fix the shadowing | Removes unrelated tooling; ordering fixes the problem without collateral damage |
| Treating Telegram error spam as a broken Telegram integration | The channel was configured; later outbound sends succeeded. The noise was a symptom of an unsettled Gateway |
| Treating the 4-hour heartbeat as an incident signal | It is scheduled behaviour and should be excluded from symptom lists |
| Reading provider probe timeouts as an update failure | They are provider/model debt and belong in a separate task |
| Chasing dead-letter entries by deleting queue files | Queue and SQLite files are state, not garbage; deleting them destroys evidence and can strand in-flight deliveries |
| Editing `openclaw.json` by hand during recovery | Risks desynchronizing authored config from generated service state |

---

## 6. Final Fix

### 6.1 Reinstall and reconcile the Gateway service

Reinstall the LaunchAgent with `openclaw gateway install --force` so the service definition is regenerated against the installed CLI, then verify with `openclaw gateway status`. This re-establishes the contract between the service and the binary it launches.

### 6.2 Remove the stale triage process

Enumerate OpenClaw processes, confirm the triage chain is genuinely stale rather than a live operator action, terminate those PIDs, then re-check that no triage process remains.

### 6.3 Fix PATH ordering rather than deleting tooling

Back up the shell startup files to a timestamped directory, disable every repeated `~/.local/bin` prepend, then append `~/.local/bin` once at the end of `PATH` guarded by a presence check. This keeps the tools reachable and makes their Node permanently unable to shadow the intended runtime.

### 6.4 Verify, then stop

Confirm versions agree, the Gateway is listening on loopback, the connectivity probe passes, update availability is false, and the last update run succeeded. Then stop. Every remaining item is deferred.

### 6.5 Why this works

The failures were coordination failures, not code failures. The service was pointing at the wrong generation of the install, a dead process was still emitting advice, and the shell was selecting the wrong interpreter. Reinstalling the service fixes the first, terminating the process fixes the second, and reordering `PATH` fixes the third. None of it requires touching credentials, queues, or history.

---

## 7. Commands

These are diagnostic and recovery recipes, not a script to run wholesale. Run them one at a time and verify each result before moving on.

### 7.1 Version and service triage

```bash
openclaw --version
openclaw gateway status
openclaw health
openclaw update status --json
openclaw status --all
```

### 7.2 Reinstall the Gateway service

```bash
openclaw gateway install --force
openclaw gateway status
```

### 7.3 Stale process identification and termination

```bash
# Identify first; never kill on a pattern alone.
pgrep -fl 'triage'
pgrep -fl 'openclaw'

# After confirming the PIDs are stale, terminate them explicitly by PID.
kill <pid>
pgrep -fl 'triage'   # expect no output
```

### 7.4 PATH ordering cleanup

```bash
# 1. Back up before editing anything.
mkdir -p ~/.config-backups/openclaw-cleanup-$(date +%Y%m%d-%H%M%S)
cp ~/.zshrc ~/.zprofile ~/.zshenv ~/.profile "$_"

# 2. Find every prepend that lets ~/.local/bin win the resolution race.
grep -n 'local/bin' ~/.zprofile ~/.zshrc ~/.zshenv ~/.profile

# 3. Comment out prepends; keep the directory reachable at the END of PATH.
cat >> ~/.zshrc <<'ZSH'

# OPENCLAW_CLEANUP: keep ~/.local/bin available, but do not let its Node shadow NVM/Homebrew Node.
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) export PATH="$PATH:$HOME/.local/bin" ;;
esac
ZSH
```

### 7.5 Runtime resolution verification

```bash
which -a node
node -v
which -a npm
npm -v
which -a openclaw
openclaw --version
```

Expected: `node`, `npm`, and `openclaw` all resolve under `~/.nvm/versions/node/v24.18.1/bin`, and `openclaw --version` prints the version **without** a runtime-fallback line.

### 7.6 Summarized log inspection

Filter and truncate; never dump a full log.

```bash
grep -iE 'telegram|outbound|dead|queue|heartbeat|lane task error|liveness' \
  ~/Library/Logs/openclaw/gateway.log | tail -n 80
```

For documentation purposes, pipe any command whose output may include credentials through a redaction filter:

```bash
openclaw status --all 2>&1 | sed -E 's/(token|key|secret|password|authorization|bearer)([=: ][^ ]+)/\1=REDACTED/Ig'
```

### 7.7 Commands to avoid during recovery

```bash
openclaw update
openclaw update repair
openclaw doctor --fix
openclaw secrets configure
openclaw update cleanup --yes
openclaw triage
```

Why each is avoided during the unstable window:

- **`openclaw update`** — starts a second update while the state of the first is unknown.
- **`openclaw update repair`** — a repair path that assumes the install is broken; running it on a healthy install creates new drift.
- **`openclaw doctor --fix`** — mutates configuration while you are still trying to observe it.
- **`openclaw secrets configure`** — credential migration is a separate controlled project, never part of an outage.
- **`openclaw update cleanup --yes`** — retires rollback snapshots and archives. Use `--dry-run` first, and only after history has been verified.
- **`openclaw triage`** — starts another long-lived process that can itself become the next stale triage process.

---

## 8. Verification

### 8.1 Version agreement and update state

```bash
openclaw --version
openclaw update status --json
openclaw status --all
```

Results captured during the 2026-10-03 documentation session:

```text
CLI version:      2026.9.7 (~/.nvm/versions/node/v24.18.1/bin/openclaw)
Gateway version:  2026.9.7
Update:           npm · up to date
availability:     false (hasGitUpdate false, hasRegistryUpdate false)
lastRun:          phase finished, status succeeded
lastRun target:   2026.9.7 (from 2026.9.6)
serviceDefinition: drift [] · warnings []
```

### 8.2 Gateway health and listening socket

```bash
openclaw gateway status
openclaw health
lsof -nP -iTCP:18789 -sTCP:LISTEN
curl -s -o /dev/null -w 'http_code=%{http_code}\n' --max-time 5 http://127.0.0.1:18789/
```

Expected and observed:

```text
Service:             LaunchAgent (loaded)
Runtime:             running (state active)
Gateway:             bind=loopback (127.0.0.1), port=18789
Dashboard:           http://127.0.0.1:18789/
Connectivity probe:  ok
Listening:           127.0.0.1:18789
```

### 8.3 Runtime resolution after PATH cleanup

Verified in a login shell during this session:

```text
node     -> ~/.nvm/versions/node/v24.18.1/bin/node      (v24.18.1)
npm      -> ~/.nvm/versions/node/v24.18.1/bin/npm       (11.16.0)
openclaw -> ~/.nvm/versions/node/v24.18.1/bin/openclaw  (OpenClaw 2026.9.7)
```

`openclaw --version` printed the version with no runtime-fallback line in that shell.

The startup-file edits were confirmed on disk. The prepends are commented out in `~/.zprofile`, `~/.zshrc` (several sites), and `~/.profile`, each carrying the marker:

```text
# OPENCLAW_CLEANUP disabled to stop ~/.local/bin/node shadowing NVM/Homebrew Node: export PATH="$HOME/.local/bin:$PATH"
```

A guarded append at the end of `~/.zshrc` keeps `~/.local/bin` on `PATH` without letting it win. Backups of all four startup files exist under `~/.config-backups/openclaw-cleanup-20260930-001857/`.

### 8.4 Stale process check

```bash
pgrep -fl 'triage'
```

Result: no triage process running.

### 8.5 Channel state

```bash
openclaw health
openclaw status --all
```

Observed: Telegram configured and reporting OK with 1/1 accounts; heartbeat interval 4h; heartbeat started; recent log lines show successful Telegram outbound sends. The delivery queue still reports dead-lettered entries (`outbound-prepared-v1: 26`, oldest 14 days), which predates this recovery.

### Final verification checklist

- [ ] `openclaw --version` reports a single version with no runtime-fallback line
- [ ] CLI version and Gateway version agree
- [ ] LaunchAgent is loaded and running
- [ ] Gateway binds loopback on `127.0.0.1:18789`
- [ ] Connectivity probe returns `ok`
- [ ] Update availability is `false`
- [ ] Last update run reports `succeeded`
- [ ] Service definition drift and warnings are empty
- [ ] `node`, `npm`, and `openclaw` resolve to the same nvm prefix
- [ ] No `openclaw triage` process is running
- [ ] Telegram reports configured and OK
- [ ] No credential value, token, or SecretRef value was printed or committed

---

## Security and Secret Handling

Rules applied while producing this runbook, and the rules to apply on any future recovery:

- Never print or commit API keys, Telegram bot tokens, OpenClaw auth tokens, bearer tokens, or SecretRef resolved values.
- Never paste raw OpenClaw configuration into a runbook. Summarize the field and its state instead.
- Never commit raw logs. Filter and summarize; treat any log that mentions credentials as sensitive.
- Redact secret-shaped values before any output leaves the terminal.
- Do not run `openclaw secrets configure` during an outage. Credential migration is a separate controlled project.
- Do not delete queues, SQLite databases, archives, sessions, or Telegram state to "clean up" warnings.
- Future credential migration should move to SecretRefs or store-backed credentials and be verified with a read-only audit after each change.

### Redacted audit summary

`openclaw security audit --deep` was run in redacted mode for documentation only. It completed with the summary:

```text
7 critical · 5 warn · 1 info
```

Finding categories, summarized without values:

- **plugins.extensions_no_allowlist** — extensions exist under `~/.openclaw/extensions` while `plugins.allow` is unset.
- **skills.code_safety** — several locally installed `9router-*` skills under `~/.agents/skills` were flagged for environment-variable access combined with network send, and one for possible secret exfiltration.
- **gateway.trusted_proxies_missing** — bind is loopback and `trustedProxies` is empty. Acceptable while the Control UI stays local-only.
- **mcp.apps.enabled** — the MCP Apps UI bridge is enabled; keep it only for trusted MCP servers.
- **plugins.tools_reachable_permissive_policy** — extension plugin tools reachable under a permissive tool policy for the `main` agent.
- **plugins.installs_unpinned_npm_specs** — plugin index contains unpinned npm specs.
- **gateway.probe_failed (deep)** — the deep probe failed with `missing scope: operator.read`, so deep checks were partial.

No plaintext-credential finding was surfaced by the audit. **No secrets were committed to this repository.** The findings above are pre-existing posture items on this host, not consequences of the update, and they are deliberately out of scope for this runbook.

### Secret scanning performed

- Working-tree and staged-diff scans for `sk-`, `hf_`, `nvapi-`, `gsk_`, `csk-`, `ghp_`, `github_pat_`, `Bearer`, `Authorization:`, `apiKey`, `api_key`, `password`, `token`, and `secret` shapes. Documentation prose that uses the words "token" or "secret" is expected and safe; credential-shaped values would have been a blocker.
- `site` build-time secret scan (`npm run build`) as part of the validation gates.

---

## Known Limitations

- The 2026-09-29 to 2026-09-30 Gateway log was rotated and is unavailable, so incident-window log lines (provider probe timeouts, schema/tool payload rejection) are operator-reported and were not re-verified.
- Live facts in this runbook were captured on 2026-10-03 at version 2026.9.7, one patch release later than the 2026.9.6 state at incident close.
- The migration warning for the `webhooks` plugin remains: its package has not converged, so its data/settings upgrade is unfinished. The tooling suggests `openclaw update repair` followed by `openclaw doctor --fix`; that is deferred deliberately.
- `openclaw security audit --deep` completed its deep pass only partially because the Gateway probe lacked the `operator.read` scope.
- A live, unrelated provider problem is visible in current logs: OpenAI embeddings calls return HTTP 429 with `insufficient_quota`, so memory sync fails. This is a billing/credit issue on the provider account, not an OpenClaw defect.
- The extra `openclaw` agent directory with 0 sessions still exists.

---

## 9. Final Working State

| Item | Known-good value |
| --- | --- |
| OpenClaw version | 2026.9.7 (`c074824`) at documentation time; 2026.9.6 at incident close |
| CLI version | Matches the Gateway version |
| Install | npm-global under `~/.nvm/versions/node/v24.18.1/lib/node_modules/openclaw` |
| Gateway service | LaunchAgent loaded and running |
| Gateway bind | loopback, `127.0.0.1:18789` |
| Dashboard | `http://127.0.0.1:18789/` |
| Connectivity probe | `ok` |
| Update availability | `false` |
| Last update run | `succeeded` (2026.9.6 → 2026.9.7) |
| Service definition drift | empty |
| Service definition warnings | empty |
| Telegram | configured, OK, 1/1 accounts |
| Heartbeat interval | 4h |
| Node CLI runtime | `~/.nvm/versions/node/v24.18.1/bin/node` (v24.18.1) |
| `openclaw` resolution | `~/.nvm/versions/node/v24.18.1/bin/openclaw` |
| Stale triage process | none running |
| Startup-file backups | `~/.config-backups/openclaw-cleanup-20260930-001857/` |
| Repository state | clean on `main`, in sync with `origin/main` |

---

## 10. Optional Cleanup

Deferred on purpose. Each item is a separate controlled task, never part of an outage response.

- **Provider/model cleanup.** Retire or repair unused provider entries; address probe timeouts and the model/provider catalog mismatch.
- **Secrets migration.** Move plaintext secret-bearing configuration to SecretRefs or store-backed credentials, verifying with a read-only audit after each change.
- **`policy.jsonc` decision.** Determine whether a policy file is needed on this host; if not, record why the warning is accepted.
- **Dead-letter queue.** Investigate only if Telegram error spam returns. Do not delete queue files without a dedicated, tested procedure.
- **Gateway service PATH warning.** Reported because the service PATH includes a version-manager directory. Clean up later, only if it actually causes a problem.
- **Rollback snapshot retirement.** Preview with `openclaw update cleanup --dry-run` once history has been verified. Never run `--yes` during recovery.
- **Superseded startup-file backups.** Retire `~/.config-backups/openclaw-cleanup-20260930-001857/` after the rollback window closes.
- **Extra agent directory.** The `openclaw` agent with 0 sessions can be reviewed once its purpose is confirmed.

---

## 11. If This Happens Again

### Shortest diagnostic sequence

```bash
openclaw --version
which -a node && node -v
openclaw gateway status
openclaw health
openclaw update status --json
pgrep -fl 'triage'
```

### Shortest recovery procedure

1. Establish the versions of CLI, Gateway, and install. Close any skew before changing anything else.
2. Confirm which `node` actually runs. If `openclaw --version` prints a runtime-fallback line, fix `PATH` before doing anything else.
3. Reinstall the Gateway service with `openclaw gateway install --force` and verify with `openclaw gateway status`.
4. Identify and terminate stale triage processes, then confirm none remain.
5. Verify health, update state, and channel readiness.
6. Stop. Log every remaining warning as follow-up work.

### Safe recovery principle: stabilize first, clean up later

Do not stack recovery paths. One change, one verification, then decide. A recovery that mutates configuration, credentials, and queues simultaneously destroys the ability to attribute any outcome to any action, and it converts a bounded incident into an open-ended repair loop.

### Lessons learned

- **A runtime-fallback line is the headline symptom, not a footnote.** When the CLI says it retried with a different Node, the shell is selecting the wrong interpreter and every later observation is suspect.
- **Fix PATH by ordering, not by deletion.** Comment out prepends, append the directory at the end, and leave a marker comment explaining why.
- **A stale process can keep an incident alive after the cause is fixed.** Old triage context produces advice for a version that no longer exists.
- **Separate expected behaviour from noise.** A scheduled 4-hour heartbeat is expected; error spam is not. Conflating them wastes the diagnostic pass.
- **Provider probe timeouts are not installer failures.** Scope them out or they will consume the whole incident.
- **Never clean up state to silence a warning.** Queues, SQLite files, archives, and sessions are evidence; deleting them trades a visible warning for an invisible failure.
- **Keep credentials out of the incident entirely.** No secrets migration, no config hand-editing, no raw logs.
- **Record the version you actually observed.** A later patch release will change the numbers; say which moment each fact belongs to.

### Credits

- **Operator and incident account:** Wafi
- **Documentation, verification, and repository work:** WorkBuddy AI
- **Execution and diagnostic CLI:** OpenClaw CLI
- **Supporting tooling:** zsh, `launchctl`, `lsof`, `pgrep`, `curl`, Node.js, npm

Related runbooks:

- [OpenClaw 2026.9.4 Gateway, Node runtime, and OmniRoute credential recovery](openclaw-2026.9.4-gateway-node-omniroute-recovery-2026-09-19.md)
- [OpenClaw 2026.9.1 SecretRef migration and Gateway recovery](openclaw-secretref-migration-macos-2026-09-10.md)
- [OpenClaw provider authentication, model routing, and security hardening](openclaw-provider-auth-routing-hardening-macos-2026-09-09.md)
- [OpenClaude Plugin/MCP Cleanup](openclaude-plugin-mcp-cleanup-2026-09-27.md)
- [FreeClaudeCode (FCC) messaging gateway integration — Telegram → OpenClaw and WhatsApp → Hermes](fcc-messaging-gateway-integration-2026-10-03.md)
