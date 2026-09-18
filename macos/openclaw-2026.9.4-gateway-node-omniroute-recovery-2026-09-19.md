# OpenClaw 2026.9.4 Gateway, Node Runtime, and OmniRoute Credential Recovery on macOS

**Date:** 2026-09-19

**Status:** Fixed

**Platform:** macOS (Apple Silicon), zsh

## 1. Summary

OpenClaw Desktop updated itself to 2026.9.4 while the installed CLI and the running Gateway were still 2026.9.1. Because 2026.9.4 authored the configuration, the older 2026.9.1 binaries could no longer read it and refused to start on safety grounds. The managed Gateway was additionally running under the Hermes-provided Node.js v22.23.2, which is below the runtime floor the newer CLI accepts.

Recovery required installing OpenClaw 2026.9.4 with Node.js v24.18.1, reinstalling the Gateway LaunchAgent against the supported 2026.9.4 CLI, upgrading the official bundled plugins from 2026.9.1 to 2026.9.4, and correcting `gateway.mode` from `remote` back to `local`. The Gateway then became healthy and reachable on loopback.

A second, independent failure remained: an OmniRoute authentication profile existed, but setup still failed because credential routing and SecretRef handling pointed at the wrong secret surface. OmniRoute was mapped to `OMNIROUTE_API_KEY`, and plaintext shadow credentials were removed using OpenClaw's supported secrets migration rather than manual editing. Live Gateway inference then succeeded using `omniroute/auto/best-fast`, and the secrets audit finished with 0 plaintext credentials and 0 unresolved references.

Both the shim at `~/.local/bin/openclaw` and the NVM-installed CLI now report 2026.9.4.

### Evidence and scope

- The operator supplied the incident chronology and the final runtime/audit outcomes recorded below. The upgrade, the LaunchAgent reinstall, the plugin upgrade, the credential migration, the inference canary, and the audit counters were **not** re-executed during this documentation session.
- This session independently verified, on the live machine: both CLI versions and the shim target, the Hermes and Homebrew Node versions, `gateway.mode`/`gateway.bind`/`gateway.port`, Gateway reachability on loopback, the LaunchAgent contents, the official plugin-skill symlink targets, and relevant filesystem modification times. It did not read credential values, dotenv contents, service environment files, or Keychain entries.
- The filesystem timestamps in the timeline are documentation-session observations of on-disk modification times. They corroborate the reported ordering but are not a terminal transcript of the incident.
- Exact historical command invocations, plugin counts, and audit inputs before the fix were not preserved. Procedures below are reusable guidance. Nothing here is a fabricated transcript.

### Investigation timeline

Reconstructed from the reported chronology plus observed on-disk modification times (all times 2026-09-19, local):

| Time | Observation | Interpretation |
| --- | --- | --- |
| — | Desktop app on 2026.9.4; CLI and Gateway still 2026.9.1 | Version skew introduced |
| — | 2026.9.4 rewrote `openclaw.json` | Older binaries then rejected the config |
| 01:41 | `~/.openclaw/openclaw.json.pre-update` written | Pre-upgrade configuration snapshot taken |
| 01:53 | `~/.nvm/versions/node/v24.18.1/lib/node_modules/openclaw` replaced | 2026.9.4 installed under Node v24.18.1 |
| 02:16 | `~/Library/LaunchAgents/ai.openclaw.gateway.plist` rewritten | Gateway LaunchAgent reinstalled against the supported CLI |
| 02:17 | `~/.openclaw/plugin-skills/*` symlinks repointed into the 2026.9.4 `dist/extensions` tree | Official bundled plugins refreshed to 2026.9.4 |
| 03:51 | `~/.openclaw/openclaw.json` rewritten | `gateway.mode` corrected `remote` → `local` |
| 03:53 | `~/.openclaw/service-env/ai.openclaw.gateway-env-wrapper.sh` and `.env` rewritten | Gateway service environment regenerated |
| 03:54 | `~/.local/bin/openclaw` symlink repointed | Shim aligned to the Node 24.18.1 install |
| — | Gateway reachable on `127.0.0.1:18789` | Local mode confirmed healthy |
| — | OmniRoute mapped to `OMNIROUTE_API_KEY`; plaintext shadow credentials migrated away | Credential routing corrected |
| — | Inference succeeded on `omniroute/auto/best-fast` | End-to-end provider path proven |
| — | Audit: 0 plaintext, 0 unresolved | Security cleanup confirmed |
| 05:51–05:56 | Rolling `openclaw.json.bak.1`–`.bak.4`, `.bak`, `.last-good` written | Post-recovery configuration churn |

## 2. Environment

| Component | Relevant detail |
| --- | --- |
| Machine | MacBook Neo, Silver MBN; macOS on Apple Silicon |
| Shell | zsh; login-shell startup file `~/.zprofile` |
| OpenClaw CLI (NVM) | 2026.9.4 (`3a9d69d`) at `~/.nvm/versions/node/v24.18.1/bin/openclaw` |
| OpenClaw CLI (shim) | `~/.local/bin/openclaw` → symlink into the NVM v24.18.1 install |
| Install runtime | Node.js v24.18.1 (NVM) |
| Gateway runtime | `/opt/homebrew/bin/node` (Homebrew Node v26.8.1) |
| Previous Gateway runtime | Hermes Node `~/.hermes/node/bin/node` v22.23.2 (too old) |
| Authored configuration | `~/.openclaw/openclaw.json` |
| Gateway service | macOS LaunchAgent `~/Library/LaunchAgents/ai.openclaw.gateway.plist` |
| Gateway service environment | `~/.openclaw/service-env/ai.openclaw.gateway-env-wrapper.sh`, `ai.openclaw.gateway.env` |
| Gateway bind | loopback, `127.0.0.1:18789` (IPv4 and IPv6) |
| Gateway heap | `--max-old-space-size=4096` |
| Local routes | OmniRoute `127.0.0.1:20128`; 9Router policy guard `127.0.0.1:20138` |
| Secret tooling | OpenClaw secrets CLI, Node.js, SQLite CLI |

Do not confuse the Hermes runtime at `~/.hermes/node` with OpenClaw's own Gateway. Hermes also runs its own gateway service under `~/.hermes`; it is a separate process from `ai.openclaw.gateway`.

## 3. Symptoms

1. OpenClaw Desktop reported 2026.9.4 while `openclaw --version` on the CLI and the running Gateway reported 2026.9.1.
2. The older 2026.9.1 binaries refused to operate on configuration that 2026.9.4 had written, surfacing as safety blocks rather than a clean parse error.
3. The managed Gateway started under the Hermes-provided Node.js v22.23.2 and failed runtime admission because that version is below the accepted floor.
4. Invoking the CLI from a shell whose `node` was too old produced an automatic runtime substitution rather than a clean failure:

```text
openclaw: Retrying with "/opt/homebrew/Cellar/node/26.8.1/bin/node" (managed Gateway service; current Node failed runtime admission).
```

5. `gateway.mode` had been written as `remote` while the Gateway was expected to serve locally, so the local Gateway was not used as intended.
6. An OmniRoute authentication profile existed, yet setup still failed: the credential was present but routing pointed at the wrong secret surface.
7. Plaintext shadow credentials remained on configuration surfaces after the profile existed, so the provider could resolve an unintended credential.
8. Version reporting disagreed between the shim at `~/.local/bin/openclaw` and the NVM-installed CLI until the shim was repointed.

## 4. Root Cause

### 4.1 Version skew between Desktop, CLI, and Gateway

The Desktop application and the CLI/Gateway were upgraded independently. Desktop moved to 2026.9.4 and wrote configuration in the newer schema and semantics, while the installed CLI and the running Gateway remained on 2026.9.1. Newer-authored configuration combined with older binaries produces refusal-to-start safety blocks, not a degraded-but-working state. Treat the Desktop app, the CLI, and the Gateway as one versioned unit.

### 4.2 Node.js runtime floor

The Gateway service was executing under the Hermes-provided Node.js v22.23.2. OpenClaw 2026.9.4 does not accept that runtime, so admission failed. Installing the newer OpenClaw release under Node.js v24.18.1 satisfied the floor for the install path, and the LaunchAgent was then pointed at an accepted runtime. A too-old Node.js is not a cosmetic warning: the CLI actively substitutes a different interpreter, which means the runtime actually executing the code may not be the one the operator expects.

### 4.3 `gateway.mode` written as `remote`

`gateway.mode` was left at `remote` while the intended topology is a local Gateway bound to loopback. In `remote` mode the local service is not the one clients address, so a healthy local process can still appear unreachable. Restoring `local` realigned the mode with the loopback bind on `127.0.0.1:18789`.

### 4.4 OmniRoute credential routing and SecretRef handling

This was the most persistent failure and is distinct from the version and runtime problems. The provider's authentication profile existed, so surface-level checks looked satisfied, but the configured credential reference did not point at the surface the runtime actually resolves. Two layers were conflated:

- the **existence** of an auth profile or store entry, and
- the **resolution** of the reference the provider configuration actually uses.

A SecretRef is a reference, not a value. It carries a `source`, a secret-provider alias in `provider`, and a backing identifier in `id`. The alias is not the model provider name. Having a profile, or a store entry with a familiar name, does not make the provider resolve it. Additionally, plaintext shadow credentials left on configuration surfaces can take precedence over the intended reference, so the provider can appear configured while resolving something else entirely. Mapping OmniRoute to the `OMNIROUTE_API_KEY` reference and removing the shadow plaintext through the supported migration closed both gaps.

## 5. What Did Not Work

| Attempt or assumption | Why it failed / lesson |
| --- | --- |
| Leaving the CLI and Gateway on 2026.9.1 after Desktop reached 2026.9.4 | Newer-authored configuration is rejected by older binaries; the skew must be closed, not tolerated |
| Expecting a clear parse error from the older binary | The failure presents as a safety block, which misleads diagnosis toward corruption rather than version skew |
| Keeping the Gateway on Hermes Node.js v22.23.2 | Below the accepted runtime floor; admission fails |
| Trusting the `node` on `PATH` as the interpreter actually used | The CLI silently substitutes an accepted runtime, so the effective runtime can differ from the invoked one |
| Editing `openclaw.json` by hand to correct credential handling | Risks reintroducing plaintext and desynchronizing authored config from generated state |
| Treating the presence of an OmniRoute auth profile as proof of working authentication | Profile existence and credential resolution are different layers |
| Assuming a store entry or profile name implies a matching environment variable | A store entry does not create an environment variable of the same name |
| Repeating the same credential mapping without checking the referenced surface | Did not address the observed resolution failure |
| Leaving plaintext shadow credentials in place because a profile existed | Shadow plaintext can take precedence over the intended reference |
| Restarting the Gateway repeatedly as a credential fix | A restart does not change which secret surface the provider references |
| Changing only one of the two CLI entry points | The shim and the NVM CLI report and behave independently until both are aligned |

## 6. Final Fix

### 6.1 Install the matching release under a supported Node.js

Install OpenClaw 2026.9.4 using Node.js v24.18.1 so the install path satisfies the runtime floor. Confirm the install location and the version it reports before touching the Gateway. Do not mix a source checkout with a separately installed CLI or LaunchAgent.

### 6.2 Reinstall the Gateway LaunchAgent against the supported CLI

Reinstall the LaunchAgent so it runs the 2026.9.4 CLI under an accepted Node.js runtime. The resulting service definition should reference an accepted interpreter, the 2026.9.4 entry point, the `gateway` subcommand, and the loopback port. Keep the service environment in `~/.openclaw/service-env/` rather than embedding credentials in the plist.

### 6.3 Upgrade the official bundled plugins

Upgrade the official plugins from 2026.9.1 to 2026.9.4 so the bundled extensions match the core release. The plugin-skill symlinks under `~/.openclaw/plugin-skills/` should resolve into the 2026.9.4 install tree, not a stale 2026.9.1 tree. Leaving plugins one release behind reintroduces exactly the skew that caused this incident.

### 6.4 Restore `gateway.mode` to `local`

Correct `gateway.mode` from `remote` to `local` so the mode matches the loopback bind. Verify the mode and bind together; a correct mode with a wrong bind, or the reverse, still leaves the local Gateway unused.

### 6.5 Correct OmniRoute credential routing

Map OmniRoute to the `OMNIROUTE_API_KEY` reference so the provider configuration points at the surface the runtime resolves. Use the secrets CLI to select and preview the change rather than editing configuration by hand. Preserve endpoints, model catalogs, allowlists, and routing policy; do not migrate unrelated provider, channel, or Gateway references just because the OmniRoute reference was wrong.

### 6.6 Security cleanup of plaintext shadow credentials

Remove plaintext shadow credentials using OpenClaw's supported secrets migration. This is the important distinction: the supported migration rewrites the authored source and lets OpenClaw generate the appropriate credential marker, whereas hand-editing either leaves plaintext behind or produces a reference that cannot resolve. Fix the authored credential source as well as any stale generated state, or regeneration can reintroduce the plaintext. Then run the secrets audit and confirm 0 plaintext and 0 unresolved.

## 7. Commands

These are diagnostic and recovery recipes, not a script to run wholesale. Use a private terminal with shell tracing disabled, no session recording, and restrictive file permissions. Commands that mutate live configuration require a maintenance window. Never pass credentials as command-line arguments, and never print configuration files or credential stores.

### 7.1 Version and runtime triage

```bash
# Both CLI entry points, because they can disagree.
command -v openclaw
~/.local/bin/openclaw --version
"$HOME/.nvm/versions/node/v24.18.1/bin/openclaw" --version

# Resolve the shim target without following it blindly.
ls -l ~/.local/bin/openclaw

# Candidate runtimes; compare against the accepted floor.
node --version
/opt/homebrew/bin/node --version
"$HOME/.hermes/node/bin/node" --version
```

### 7.2 Install the matching release

```bash
# Use the supported Node.js for the install path.
export PATH="$HOME/.nvm/versions/node/v24.18.1/bin:$PATH"
node --version
npm install --global openclaw@2026.9.4
openclaw --version
```

### 7.3 Gateway service definition

Inspect the installed LaunchAgent rather than reconstructing it by hand. The supported installer is the right tool; the check below confirms what it produced.

```bash
plutil -p ~/Library/LaunchAgents/ai.openclaw.gateway.plist
```

Expected shape, with the interpreter and entry point matching the supported install:

```text
ProgramArguments = ["/bin/sh",
                    "<service-env wrapper>",
                    "<service-env file>",
                    "/opt/homebrew/bin/node",
                    "--max-old-space-size=4096",
                    "<openclaw 2026.9.4 dist entry point>",
                    "gateway",
                    "--port", "18789"]
```

### 7.4 Plugin alignment

```bash
ls -l ~/.openclaw/plugin-skills/
```

Each symlink should resolve into the 2026.9.4 install tree.

### 7.5 Gateway mode and bind

```bash
openclaw config get gateway.mode
openclaw config get gateway.bind
openclaw config get gateway.port
```

To correct the mode when it is wrong:

```bash
openclaw config set gateway.mode local
```

### 7.6 OmniRoute credential mapping and migration

Use the secrets CLI to select the actual credential targets and preview the migration. Never paste a credential value into a command line or into shell history.

```bash
openclaw secrets configure
openclaw secrets audit
```

For a store-backed value, use the no-echo prompt rather than an argument:

```bash
openclaw secrets store set OMNIROUTE_API_KEY --kind secret
```

### 7.7 Redaction-safe presence checks

These report only labels and booleans. Presence is not provider authentication, and a store-backed reference need not have a same-named environment variable.

```bash
set +x
if [[ -n ${OMNIROUTE_API_KEY:-} ]]; then
  printf '%s\n' 'OmniRoute shell binding: present'
else
  printf '%s\n' 'OmniRoute shell binding: missing/empty'
fi

node -e 'console.log("OmniRoute child env: " + (process.env.OMNIROUTE_API_KEY ? "present" : "missing/empty"))'

# Capture launchctl output, then test it is nonempty; do not print the capture.
if _launch_value="$(launchctl getenv OMNIROUTE_API_KEY 2>/dev/null)" && [[ -n "$_launch_value" ]]; then
  printf '%s\n' 'OmniRoute launchd binding: present'
else
  printf '%s\n' 'OmniRoute launchd binding: missing/empty'
fi
unset _launch_value
```

## 8. Verification

### 8.1 Version agreement

```bash
~/.local/bin/openclaw --version
"$HOME/.nvm/versions/node/v24.18.1/bin/openclaw" --version
```

Expected result:

```text
OpenClaw 2026.9.4 (<build>)
OpenClaw 2026.9.4 (<build>)
```

### 8.2 Gateway health on loopback

```bash
openclaw gateway status
curl -s -o /dev/null -w 'http_code=%{http_code}\n' --max-time 5 http://127.0.0.1:18789/
lsof -nP -iTCP:18789 -sTCP:LISTEN
```

Expected result: an HTTP 200 on loopback and a listening `node` process bound to `127.0.0.1:18789`.

### 8.3 Live inference through the Gateway

Prove the provider path end to end rather than inferring it from configuration. Use a unique session key so a stale session cannot mask the result.

```bash
openclaw agent \
  --agent main \
  --session-key <unique-canary-session> \
  --model omniroute/auto/best-fast \
  --message "Reply exactly: <CANARY>" \
  --thinking off \
  --timeout 240 \
  --json
```

Inspect the returned provider, model, credential source, requested versus effective model, and fallback state. A combo alias such as `auto/best-fast` may resolve internally to a concrete model; compare requested and effective models before classifying the result as a fallback.

### 8.4 Secrets audit

```bash
openclaw secrets audit --check
```

For a pass/fail result that does not print findings:

```bash
if openclaw secrets audit --check >/dev/null 2>&1; then
  printf '%s\n' 'Secret audit: passed'
else
  printf '%s\n' 'Secret audit: failed or command unavailable; investigate privately'
fi
```

Expected final counters:

```text
plaintext=0
unresolved=0
```

Interpret these separately from Gateway connectivity and from actual inference. A clean audit is necessary, not a runtime authentication guarantee.

### Final verification checklist

- [ ] `~/.local/bin/openclaw --version` reports 2026.9.4
- [ ] The NVM CLI reports 2026.9.4
- [ ] The shim resolves into the Node v24.18.1 install tree
- [ ] The Gateway runs under an accepted Node.js runtime, not Hermes v22.23.2
- [ ] `gateway.mode` is `local`
- [ ] `gateway.bind` is loopback and the port is `18789`
- [ ] `openclaw gateway status` reports healthy
- [ ] `http://127.0.0.1:18789/` returns HTTP 200
- [ ] Official plugin skills resolve into the 2026.9.4 install tree
- [ ] OmniRoute resolves through the `OMNIROUTE_API_KEY` reference
- [ ] A live inference canary succeeds on `omniroute/auto/best-fast`
- [ ] Secrets audit reports 0 plaintext and 0 unresolved
- [ ] No credential value, key fragment, email address, or channel token was printed or committed

## 9. Final Working State

| Item | Known-good value |
| --- | --- |
| OpenClaw CLI (shim) | 2026.9.4 |
| OpenClaw CLI (NVM) | 2026.9.4 |
| Install runtime | Node.js v24.18.1 |
| Gateway runtime | Accepted Node.js, no longer Hermes v22.23.2 |
| `gateway.mode` | `local` |
| `gateway.bind` | loopback |
| Gateway port | `18789` |
| Gateway health | Reachable on `127.0.0.1:18789` |
| Official plugins | 2026.9.4 |
| OmniRoute credential | Mapped to the `OMNIROUTE_API_KEY` reference |
| Plaintext shadow credentials | Removed via supported migration |
| Inference route | `omniroute/auto/best-fast` verified |
| Audit counters | plaintext 0, unresolved 0 |

These counters apply to the audit's scope, not to every file, environment variable, Keychain entry, backup, or historical database page on the machine. A mapped reference does not imply the backing store is encrypted at rest.

## 10. Optional Cleanup

- Retire superseded configuration backups in `~/.openclaw/` once the rollback window closes. The rolling `openclaw.json.bak.*`, `.last-good`, and `openclaw.json.pre-update` files are useful during recovery and unnecessary afterwards.
- Remove unused secret-store entries only after confirming no channel, Gateway, agent, or tool still references them.
- Keep `~/.openclaw/service-env/` at restrictive permissions; it carries the Gateway service environment.
- Do not commit backups, dotenv files, credential stores, service environment files, or raw diagnostics to this repository.
- Note that deleting a file does not securely erase APFS snapshots or SSD blocks.

## 11. If This Happens Again

### Shortest diagnostic sequence

```bash
set +x
command -v openclaw
~/.local/bin/openclaw --version
"$HOME/.nvm/versions/node/v24.18.1/bin/openclaw" --version
node --version
openclaw config get gateway.mode
openclaw config get gateway.bind
openclaw gateway status
openclaw secrets audit --check
```

### Shortest recovery procedure

1. Establish the version of the Desktop app, both CLI entry points, and the running Gateway. Close any skew before changing anything else.
2. Confirm the Gateway is running under an accepted Node.js runtime; replace a too-old runtime rather than restarting around it.
3. Install the matching OpenClaw release under a supported Node.js and reinstall the LaunchAgent against it.
4. Align the official plugins to the same release.
5. Verify `gateway.mode` and `gateway.bind` agree with the intended topology.
6. If the provider profile exists but setup still fails, stop treating profile existence as authentication. Check which secret surface the provider configuration actually references.
7. Map the provider to the correct reference, then remove plaintext shadow credentials through the supported secrets migration rather than by hand.
8. Prove the path with a live canary on the real route, then confirm the audit counters. Report version agreement, Gateway health, provider resolution, and audit results as separate claims.

### Lessons learned and prevention

- **Upgrade Desktop, CLI, and Gateway together.** They are one versioned unit; a partial upgrade produces safety blocks that look like corruption.
- **Never let a service run on a runtime you did not verify.** Confirm the interpreter actually executing the Gateway, not just the one on `PATH`.
- **Treat automatic runtime substitution as a symptom.** A CLI that silently picks a different Node.js is telling you the intended runtime was rejected.
- **Verify mode and bind together.** `remote` mode with a healthy local process still presents as unreachable.
- **Profile existence is not authentication.** Check the referenced secret surface, not the presence of a profile or store entry.
- **Use the supported secrets migration.** Hand-editing configuration leaves plaintext behind or creates references that cannot resolve.
- **Prefer redaction-safe checks.** Report labels and booleans; never print credential values, key fragments, configuration files, or credential stores.
- **Align every entry point.** A shim and a package-manager CLI can report different versions until both are repointed.

### Credits

- **Operator and incident account:** Wafi
- **AI troubleshooting and reasoning:** ChatGPT, ChatGPT Work
- **Documentation and repository work:** WorkBuddy AI
- **Execution and diagnostic CLI:** OpenClaw CLI
- **Supporting tooling:** zsh, `launchctl`, `plutil`, `lsof`, `curl`, Node.js, npm, SQLite CLI

Related runbooks:

- [OpenClaw 2026.9.1 SecretRef migration and Gateway recovery](openclaw-secretref-migration-macos-2026-09-10.md)
- [OpenClaw provider authentication, model routing, and security hardening](openclaw-provider-auth-routing-hardening-macos-2026-09-09.md)
- [macOS localhost AI-service hardening and security cleanup](localhost-ai-service-hardening-security-cleanup-macos-2026-09-10.md)
