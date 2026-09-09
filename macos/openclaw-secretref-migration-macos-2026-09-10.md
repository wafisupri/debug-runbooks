# OpenClaw 2026.9.1 SecretRef migration and Gateway recovery on macOS

**Date:** 2026-09-10 (documentation date)

**Status:** Resolved in the reported incident; diagnostic technical debt remains

**Platform:** macOS (Apple Silicon), zsh

## 1. Summary

OpenClaw was upgraded/repaired to 2026.9.1 and plaintext credentials were migrated to SecretRefs. Stale credential values in the generated main-agent model file and shared state database were cleaned after backups. The secret audit became clean, but provider-level `store` references could still appear as `effective=missing:missing` at runtime. Moving the seven model providers to env-backed SecretRefs was the practical workaround in this setup.

During troubleshooting, a shell redirection accidentally replaced `~/.openclaw/.env`, losing `OPENCLAW_GATEWAY_TOKEN`. Recovery required rotating the Gateway token without printing it, synchronizing the CLI environment with the new token, and persisting the loader in `~/.zprofile`.

### Evidence and scope

- The operator supplied the completed incident chronology and final provider/audit results recorded below. They were not re-run during this documentation session.
- This session independently verified the installed CLI version, relevant command help, and implementation details in the installed 2026.9.1 public application source. It did not inspect live credentials, Keychain contents, startup files, databases, or private backups; it did not rotate tokens or restart services.
- Exact historical backup filenames, SQL statements, store-entry IDs, warning counts, and the original upgrade command were not supplied. Procedures below are reusable guidance, not a fabricated terminal transcript.
- The [September 9 provider hardening runbook](openclaw-provider-auth-routing-hardening-macos-2026-09-09.md) records successful store-backed canaries in an earlier session. Preserve that evidence: this incident is setup-specific, not proof that all 2026.9.1 store references fail. This runbook records the later reported env-backed state rather than rewriting the earlier result.

## 2. Environment

| Component | Relevant detail |
| --- | --- |
| Machine | MacBook Neo, Silver MBN; macOS on Apple Silicon |
| Shell | zsh; login-shell startup file `~/.zprofile` |
| Application | OpenClaw 2026.9.1 (`ad6fe23`), independently checked when documenting |
| Authored configuration | `~/.openclaw/openclaw.json` |
| Generated model catalog | `~/.openclaw/agents/main/agent/models.json` |
| Shared state database | `~/.openclaw/state/openclaw.sqlite` |
| Gateway dotenv source | `~/.openclaw/.env` |
| Gateway service | macOS LaunchAgent; loopback `127.0.0.1:18789` in the related setup |
| Local routes | OmniRoute `127.0.0.1:20128`; 9Router policy guard `127.0.0.1:20138` |
| Secret tooling | OpenClaw secrets CLI, macOS Keychain Access / `security`, Node.js, SQLite CLI |

Do not confuse the shared state database with `~/.openclaw/agents/main/agent/openclaw-agent.sqlite`. This incident's manual SQLite cleanup concerned the shared database; this runbook does not authorize clearing the agent authentication database.

## 3. Symptoms

1. Upgrade/repair and credential migration exposed plaintext and stale credential-bearing state that needed cleanup.
2. `openclaw secrets audit` could resolve provider-level store refs while `openclaw models status` still displayed `effective=missing:missing`.
3. `openclaw models status --probe` was unusable: with the Gateway running it demanded exclusive ownership; with the Gateway stopped it could not resolve the active Gateway SecretRef snapshot.
4. `secretref-managed` appeared in generated `models.json`, initially resembling a missing or dummy credential.
5. Shell/launchd/dotenv checks misleadingly suggested a variable was available when its value was empty or it was not exported.
6. Replacing `.env` with `>` removed unrelated entries, including the Gateway token.
7. After token rotation, the CLI and Gateway disagreed about authentication until the CLI loaded the new `OPENCLAW_GATEWAY_TOKEN`.
8. `openclaw secrets reload` continued to report warning counts after the audit was clean and providers resolved.

## 4. Root cause

### Secret storage, persistence markers, and runtime resolution are different layers

A SecretRef is a reference, not a credential value. The canonical shape includes `source`, a secret-provider alias in `provider`, and a backing identifier in `id`. The alias is not the model provider name. These examples use the built-in `default` alias; check configured defaults before applying them:

```json
{"source":"store","provider":"default","id":"NINE_ROUTER_API_KEY"}
```

```json
{"source":"env","provider":"default","id":"NINE_ROUTER_API_KEY"}
```

The store default is `secrets.defaults.store`, otherwise `default`. Env refs similarly use the configured env provider/default. A store entry with a given name does not automatically create an operating-system environment variable with that name.

For generated model catalogs, 2026.9.1 deliberately persists:

| Authored source | Generated API-key representation |
| --- | --- |
| Env SecretRef | The environment variable name, not its value |
| Store, file, or exec SecretRef | `secretref-managed` |

Secret-backed headers use `secretref-env:VARIABLE_NAME` for env refs, or `secretref-managed` for managed sources. The audit recognizes these markers. Do not replace a marker with plaintext. Its presence proves neither successful resolution nor failure; it avoids persisting the resolved credential in generated JSON.

In this incident, the audit/resolver path and runtime credential-selection path disagreed for provider-level store refs. The observed boundary was a resolvable ref versus `effective=missing:missing`. The exact internal defect was not independently reproduced or isolated. Env-backed provider refs avoided the failure here; this is a version/setup-specific workaround, not a general rejection of the store design.

### Environment boundaries on macOS

| Surface | What it establishes | What it does not establish |
| --- | --- | --- |
| Current zsh variable | The current shell has a binding, possibly empty | Child processes receive it only if exported; an already-running Gateway is unchanged |
| `launchctl getenv NAME` | Reads a binding from the applicable launchd environment | A successful exit does not prove a nonempty value, and a changed binding does not update an existing process |
| OpenClaw login-shell importing | When enabled, probes a login shell for expected keys and imports eligible absent bindings | It is not an import of every shell variable and does not overwrite an already-present empty binding |
| `~/.openclaw/.env` | An application dotenv input loaded by participating OpenClaw paths | It does not automatically export into the user's parent shell or guarantee every CLI auth path sees the same value |
| OpenClaw store SecretRef | Reads a named team-scoped store entry through the resolver/runtime snapshot | It is not zsh, launchd, a dotenv line, or an automatically exported environment variable |
| macOS Keychain | Stores the credential outside shell source files | A process still needs an authorized loader to obtain and export it |

OpenClaw's 2026.9.1 shell importer uses expected keys derived from provider/channel metadata plus Gateway authentication names. The bundled metadata recognizes `GEMINI_API_KEY` and `GOOGLE_API_KEY`; this source inspection found no bundled declaration for `NINE_ROUTER_API_KEY`, `BAI_API_KEY`, or `OMNIROUTE_API_KEY`. External plugin metadata or the actual service launch environment can affect availability. Merely adding a custom env SecretRef, or an env resolver `allowlist`, does not extend the shell-import expected-key list.

Consequently, `Shell env: on` plus a successful login-shell presence check is necessary evidence for this loader approach but not sufficient proof that a custom variable reached the Gateway. Check provider resolution through the active Gateway. The precise delivery mechanism for every custom variable in the reported final setup was not preserved; do not invent it or assume a bare LaunchAgent reads `.zprofile` itself.

### Four misleading shell checks/actions

- Checking only `launchctl getenv`'s exit status produced a false positive when the returned value was empty. Capture output silently, then test that it is nonempty.
- Finding an `OPENCLAW_GATEWAY_TOKEN=` line proves only that the assignment exists. Empty values, empty quoted strings, and duplicate assignments can still result in no usable value. Parse dotenv and test the resulting binding without displaying it.
- `NINE_ROUTER_API_KEY=value` alone creates a shell variable, not an exported child-process environment binding. `export NINE_ROUTER_API_KEY` exports the existing value; never paste a real value into command history. A one-command environment assignment is a different shell form.
- `>` opens a file for replacement/truncation; it does not update one variable. `>>` appends and preserves existing contents, but can create conflicting duplicate names. Prefer a backed-up, targeted edit over either blind replacement or blind append.

## 5. What did not work

| Attempt or assumption | Why it failed / lesson |
| --- | --- |
| Treat a clean audit as proof of model authentication | Audit resolution and live credential selection differed in this setup |
| Put a real key in place of `secretref-managed` | Would undo the migration; the marker is intentional |
| Run `models status --probe` with the Gateway running | Exclusive-ownership requirement blocked the probe |
| Stop the Gateway to satisfy that probe | The probe then lacked the active Gateway SecretRef snapshot |
| Repeat the same store mapping | Did not address the observed provider runtime failure |
| Set an unexported zsh variable | Child OpenClaw processes did not inherit it |
| Check launchctl success or only an `.env` assignment line | Neither proves a nonempty usable credential |
| Enable shell importing and assume every custom key is imported | Expected-key filtering and existing empty bindings can prevent import |
| Use `>` to add one `.env` entry | Replaced the entire file and lost the Gateway token |
| Rotate only the Gateway side | The CLI continued with a missing/stale token |
| Declare reload warnings harmless because the audit is clean | Their cause remains unexplained; retain them as diagnostic debt |

## 6. Final fix

### Upgrade and repair first

The incident included upgrading/repairing OpenClaw 2026.9.1 before stabilizing credential resolution. Confirm the active executable and package channel; do not mix a source checkout with a separately installed CLI or LaunchAgent. Preserve backups before upgrade/repair, and verify the Gateway uses the intended installation after restart.

The installed CLI supports `openclaw update --tag 2026.9.1`, `openclaw update repair`, and `openclaw doctor --repair`. These are recovery options, not a claim that this exact sequence was used historically. Review the plan and repair findings; do not run a downgrade or broad repair on an already-working installation just to reproduce this incident.

### Initial migration inventory

The initial migration replaced credential literals with references and included these surfaces. Exact original store IDs were not retained. The names in the last column are a reusable mapping convention, not an assertion that each historical store entry had that spelling. Google must use the actual exported name chosen for its ref; `GEMINI_API_KEY` and `GOOGLE_API_KEY` are distinct bindings.

| Service | Initial migration target | Reported migration path | Example backing name |
| --- | --- | --- | --- |
| 9Router | `models.providers.9router.apiKey` | SecretRef/store phase, then env-backed provider workaround | `NINE_ROUTER_API_KEY` |
| OmniRoute | `models.providers.omniroute.apiKey` | Store-backed provider ref, then env-backed | `OMNIROUTE_API_KEY` |
| B.AI | `models.providers.bai.apiKey` | Store-backed provider ref, then env-backed | `BAI_API_KEY` |
| Telegram | `channels.telegram.botToken` or the configured account's token field | Channel token migrated to a SecretRef; not part of the seven-provider env workaround | `TELEGRAM_BOT_TOKEN` |
| OpenAI | `models.providers.openai.apiKey` | Store-backed provider ref, then env-backed | `OPENAI_API_KEY` |
| OpenRouter | `models.providers.openrouter.apiKey` | Store-backed provider ref, then env-backed | `OPENROUTER_API_KEY` |
| Groq | `models.providers.groq.apiKey` | Store-backed provider ref, then env-backed | `GROQ_API_KEY` |
| Google | `models.providers.google.apiKey` | Store-backed provider ref, then env-backed | `GEMINI_API_KEY` |

Use `openclaw secrets configure` to select the actual credential targets and preview/preflight the migration. A store entry can be written with `openclaw secrets store set NAME --kind secret`, which supports a no-echo prompt. Never pass credentials as command-line arguments. Any generated migration plan is private until reviewed; keep it outside this repository.

### Audit interpretation and stale plaintext cleanup

Run `openclaw secrets audit` before and after changes. The initial numeric counts were not preserved; do not manufacture them. Interpret each finding by its path and category:

| Human label | JSON `summary` key | Interpretation |
| --- | --- | --- |
| `plaintext` | `plaintextCount` | Literal credential found on an audited configuration, auth, generated-model, or recognized dotenv surface |
| `unresolved` | `unresolvedRefCount` | Ref cannot resolve or has an invalid result; invalid JSON/generated-reference shapes can also contribute |
| `shadowed` | `shadowedRefCount` | Another matching auth surface may take precedence over the intended provider ref |
| `storeResidue` | `storeResidueCount` | Audited config plaintext equals a team-store value; not a byte-level scan of all SQLite history |
| `legacy` | `legacyResidueCount` | Retired auth/archive or OAuth-related residue requiring interpretation; not necessarily an invalid credential |

One assignment can contribute multiple findings. Audit `status=clean` is not enough when exec refs were skipped: also inspect `resolution.resolvabilityComplete` and `skippedExecRefs`. Do not use `--allow-exec` without reviewing the provider commands it would execute.

Backups were taken before manual file/database cleanup in the reported incident. Stale plaintext values were removed from `~/.openclaw/agents/main/agent/models.json` and `~/.openclaw/state/openclaw.sqlite`. Fix the authored credential source as well as stale generated state, or regeneration can reintroduce it. Preserve legitimate non-secret model catalog data and let OpenClaw generate the appropriate credential marker; do not hand-insert unresolved objects into generated `models.json`.

The exact historical SQL/table names were not preserved. Do not translate this account into blanket `DELETE` statements. Installed source identifies old shared `agent_model_catalogs.raw_json` as retired at schema 10; it is not a current schema-15 catalog API. Shared `config_machine_state` auth entries are active authentication state, not disposable caches. Verify the actual schema and audit-indicated JSON fields privately before a targeted transaction; preserve unrelated rows and record only sanitized row counts/paths. Abort if the expected row count differs.

SQLite logical deletion does not prove erasure from free pages, WAL, backups, or APFS snapshots. After a separately authorized logical cleanup, `openclaw doctor --state-sqlite compact` is the supported offline compaction operation; it is not a replacement for removing live plaintext fields and was not independently confirmed as a historical step here.

### Env-backed workaround and login-shell loading

Move provider-level references for all seven model providers to `source: env`, with IDs matching nonempty exported variables available to the relevant OpenClaw process. Preserve endpoints, model catalogs, allowlists, and routing policy. Do not migrate unrelated Telegram or Gateway refs just because model-provider refs failed.

Enable both settings:

```bash
openclaw config set env.shellEnv.enabled true
openclaw config set env.shellEnv.timeoutMs 15000
```

Store the 9Router credential in macOS Keychain using Keychain Access's secure UI, rather than embedding it in `.zprofile` or shell history. The earlier [Keychain hardening runbook](cli-environment-keychain-hardening-2026-09-01.md) documents the service label `9router-api-key`; use the real service/account mapping for the installation. The following is a reusable `.zprofile` loader for that convention, not a dump of the live file:

```bash
# zsh; add once to ~/.zprofile after backing it up. Keep shell tracing disabled.
if _nine_router_key="$(/usr/bin/security find-generic-password \
  -a "$USER" -s '9router-api-key' -w 2>/dev/null)" && [[ -n "$_nine_router_key" ]]; then
  export NINE_ROUTER_API_KEY="$_nine_router_key"
else
  unset NINE_ROUTER_API_KEY
fi
unset _nine_router_key
```

The retrieved value is captured, never displayed. Do not execute the inner `security ... -w` command on its own. Keychain permission/unlock failures must remain visible through presence checks, not through credential dumps. A successful loader alone does not bypass OpenClaw's expected-key filter; verify the running Gateway actually resolves 9Router. Supply custom variables through an explicitly configured service environment/approved launcher when necessary, without putting literal keys into a LaunchAgent plist.

### Recovering the overwritten dotenv file and Gateway token

The incident's `.env` replacement lost `OPENCLAW_GATEWAY_TOKEN`; recovery rotated it without printing it. Restore unrelated entries from a protected backup using a targeted merge before starting services. Do not blindly restore a pre-rotation token after the new token has been activated.

Rotate the authoritative backing source, not an arbitrary duplicate. For an env-backed Gateway using `.env`, section 7 provides a reusable targeted atomic update. It is deliberately not executed in this documentation session. For a store-backed token, update its actual referenced entry using `openclaw secrets store set NAME --kind secret` and coordinate snapshot activation/client updates instead.

`openclaw doctor --generate-gateway-token` is not a guaranteed rotation command: 2026.9.1 can return without changing a usable existing token and will not simply overwrite an unavailable configured SecretRef. Do not use `gateway auth-token --show`, raw config output, or `--token` with a literal credential during logged recovery.

After rotation, load the new `OPENCLAW_GATEWAY_TOKEN` into the CLI environment and persist the loader in `~/.zprofile`. A shell export does not update an already-running Gateway; restart the Gateway under its correct environment, then reload/verify as appropriate. Check for stale higher-precedence CLI or service bindings without printing them. Preserve loopback binding and authentication; disabling auth is not the fix.

## 7. Commands

These are maintenance recipes, not commands to run wholesale. Use a private terminal with tracing disabled, no session recording, and restrictive file permissions. Commands that can mutate live configuration require a maintenance window. Backups and dotenv files can contain plaintext secrets even when the OpenClaw audit is clean; never place them in this repository.

### Version/repair command selection

```bash
command -v openclaw
openclaw --version
openclaw update --help
openclaw update repair --help
openclaw doctor --help
# Preview only; inspect before selecting an upgrade or repair action.
openclaw update --tag 2026.9.1 --dry-run
```

### Protected backups before any manual edit

Stop the Gateway and all other database writers/CLI sessions first. Stopping the Gateway alone is insufficient if another process still owns the database. Run in one maintenance shell; retain the exact backup directory path privately for rollback.

```bash
set +x
umask 077
backup="$(mktemp -d "$HOME/openclaw-secretref-backup.XXXXXX")"
(
  set -eu
  : "${backup:?Backup directory creation failed}"
  chmod 700 "$backup"
  for file in "$HOME/.openclaw/openclaw.json" \
    "$HOME/.openclaw/agents/main/agent/models.json" \
    "$HOME/.openclaw/state/openclaw.sqlite"; do
    test -f "$file"
  done
  openclaw gateway stop
  cp -p "$HOME/.openclaw/openclaw.json" "$backup/openclaw.json"
  cp -p "$HOME/.openclaw/agents/main/agent/models.json" "$backup/models.json"
  chmod 600 "$backup/openclaw.json" "$backup/models.json"
  if [[ -f "$HOME/.openclaw/.env" ]]; then
    cp -p "$HOME/.openclaw/.env" "$backup/.env"
    chmod 600 "$backup/.env"
  fi
  if [[ -f "$HOME/.zprofile" ]]; then
    cp -p "$HOME/.zprofile" "$backup/.zprofile"
    chmod 600 "$backup/.zprofile"
  fi
  sqlite3 -readonly "$HOME/.openclaw/state/openclaw.sqlite" ".backup '$backup/openclaw.sqlite'"
  chmod 600 "$backup/openclaw.sqlite"
  test "$(sqlite3 -readonly "$backup/openclaw.sqlite" 'PRAGMA integrity_check;')" = 'ok'
  printf '%s\n' 'Backup complete; SQLite integrity: ok'
)
```

Require the block to succeed and print its completion message before continuing; the subshell stops on a failed command. The source database is opened read-only so a missing path cannot silently create an empty database. The SQLite backup API includes committed WAL state; copying only a live `.sqlite` file is not a consistent backup. Record privately if `.env` or `.zprofile` did not originally exist. These SQLite dot-command examples assume the selected backup path contains no single quote; choose another protected directory if it does.

### Targeted env-backed Gateway token rotation

Only use this recipe after confirming `.env` is the authoritative backing source and taking the above backup. Stop all writers. It refuses symlinks, duplicate Gateway-token assignments, and unsupported/multiline dotenv layouts; generates a fresh cryptographic token in memory; preserves other file contents; and atomically replaces the existing file at mode 0600. It does not restore entries already lost in the earlier overwrite; merge those first. Node.js must be available.

```bash
node --input-type=module <<'NODE'
import { randomBytes } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
const file = join(homedir(), '.openclaw', '.env');
const temp = `${file}.rotate-${process.pid}`;
let created = false;
try {
  if (!lstatSync(file).isFile()) throw new Error();
  const text = readFileSync(file, 'utf8');
  // Deliberately accept only complete, single-line dotenv assignments.
  const singleLine = /^[ \t]*(?:export[ \t]+)?[A-Za-z_][A-Za-z0-9_]*[ \t]*=[ \t]*(?:[^'"`\\\r\n]*|"[^"\r\n]*"|'[^'\r\n]*')[ \t]*$/;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!singleLine.test(line)) throw new Error();
  }
  const entry = /^[ \t]*(?:export[ \t]+)?OPENCLAW_GATEWAY_TOKEN[ \t]*=.*$/gm;
  const matches = [...text.matchAll(entry)];
  if (matches.length > 1) throw new Error();
  const token = randomBytes(32).toString('hex');
  const assignment = `OPENCLAW_GATEWAY_TOKEN=${token}`;
  const next = matches.length
    ? text.replace(entry, assignment)
    : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${assignment}\n`;
  if (parseEnv(next).OPENCLAW_GATEWAY_TOKEN !== token) throw new Error();
  writeFileSync(temp, next, { mode: 0o600, flag: 'wx' });
  created = true;
  renameSync(temp, file);
  created = false;
  console.log('Gateway token rotated in dotenv; value not displayed.');
} catch {
  if (created) { try { unlinkSync(temp); } catch {} }
  console.error('Rotation failed; inspect file structure privately, not its secret values.');
  process.exitCode = 1;
}
NODE
```

Precondition: the entire file uses the accepted single-line layout. Quoted multiline values anywhere in the file, backticks, unquoted backslashes, and some inline-comment forms are intentionally rejected rather than rewritten heuristically. Inspect a rejected layout privately; do not weaken validation to force a repair. Do not run this against a store-backed Gateway unless you intentionally migrate its configured ref too.

### CLI loader, persisted once in `~/.zprofile`

This recipe uses Node.js `process.loadEnvFile` (available in the documented Node 24 environment), not `source ~/.openclaw/.env`: dotenv is data, not trusted shell code. Deleting the child process's inherited token before parsing avoids accidentally returning the old token. The subprocess's stdout is consumed only by command substitution; never run it standalone.

```bash
if _gateway_token="$(node --input-type=module -e '
  import { loadEnvFile } from "node:process";
  import { homedir } from "node:os";
  import { join } from "node:path";
  try {
    delete process.env.OPENCLAW_GATEWAY_TOKEN;
    loadEnvFile(join(homedir(), ".openclaw", ".env"));
    const token = process.env.OPENCLAW_GATEWAY_TOKEN;
    if (!token || /\s/.test(token)) process.exit(1);
    process.stdout.write(token);
  } catch { process.exit(1); }
' 2>/dev/null)" && [[ -n "$_gateway_token" ]]; then
  export OPENCLAW_GATEWAY_TOKEN="$_gateway_token"
else
  unset OPENCLAW_GATEWAY_TOKEN
fi
unset _gateway_token
```

Keep tracing off. Node must already be on the login-shell PATH at this point. Load the same snippet in the current shell, or open a new login shell, before invoking CLI commands. Do not overwrite the entire `.zprofile` to install it.

## 8. Verification

### Secret-presence checks without values

These commands are for a private recovery session and were not run against live secrets when documenting. They print only labels/booleans; presence is not provider authentication. A store-backed ref need not have a same-named env variable.

```bash
set +x
# Current zsh binding versus exported child-process binding.
if [[ -n ${NINE_ROUTER_API_KEY:-} ]]; then
  printf '%s\n' '9Router shell binding: present'
else
  printf '%s\n' '9Router shell binding: missing/empty'
fi
node -e 'console.log("9Router child env: " + (process.env.NINE_ROUTER_API_KEY ? "present" : "missing/empty"))'
node -e 'console.log("Gateway CLI env: " + (process.env.OPENCLAW_GATEWAY_TOKEN ? "present" : "missing/empty"))'

# Test launchctl output, not just command exit status. Do not print the capture.
if _launch_value="$(launchctl getenv NINE_ROUTER_API_KEY 2>/dev/null)" && [[ -n "$_launch_value" ]]; then
  printf '%s\n' '9Router launchd binding: present'
else
  printf '%s\n' '9Router launchd binding: missing/empty'
fi
unset _launch_value

# A fresh login shell must export the variable to a child process.
if /usr/bin/env -u NINE_ROUTER_API_KEY /bin/zsh -lc 'node -e '\''process.exit(process.env.NINE_ROUTER_API_KEY ? 0 : 1)'\''' >/dev/null 2>&1; then
  printf '%s\n' '9Router login-shell export: present'
else
  printf '%s\n' '9Router login-shell export: unavailable (check loader/PATH privately)'
fi

# Keychain presence/nonempty retrieval without showing its contents.
if _keychain_value="$(/usr/bin/security find-generic-password -a "$USER" -s '9router-api-key' -w 2>/dev/null)" && [[ -n "$_keychain_value" ]]; then
  printf '%s\n' '9Router Keychain retrieval: present'
else
  printf '%s\n' '9Router Keychain retrieval: unavailable'
fi
unset _keychain_value
```

Check the parsed dotenv value, with inherited state removed, without printing the file:

```bash
node --input-type=module <<'NODE'
import { loadEnvFile } from 'node:process';
import { homedir } from 'node:os';
import { join } from 'node:path';
try {
  delete process.env.OPENCLAW_GATEWAY_TOKEN;
  loadEnvFile(join(homedir(), '.openclaw', '.env'));
  const present = Boolean(process.env.OPENCLAW_GATEWAY_TOKEN?.trim());
  console.log(`Gateway dotenv value: ${present ? 'present' : 'missing/empty'}`);
  process.exitCode = present ? 0 : 1;
} catch {
  console.error('Gateway dotenv check failed; no file contents displayed.');
  process.exitCode = 1;
}
NODE
```

### Final OpenClaw checks

After the controlled restart and CLI token synchronization, these were the relevant diagnostic commands. Run locally; do not publish raw model status, audit JSON, reload output, or canary output without independent redaction. Diagnostic versions can include masked credential fragments; even fragments do not belong in this repository.

```bash
openclaw --version
openclaw config get env.shellEnv.enabled --json
openclaw config get env.shellEnv.timeoutMs --json
openclaw gateway status
openclaw secrets reload
openclaw secrets audit --check
openclaw models status
```

For a no-output audit pass/fail check that does not leak findings:

```bash
if openclaw secrets audit --check >/dev/null 2>&1; then
  printf '%s\n' 'Secret audit: passed (inspect resolution completeness separately)'
else
  printf '%s\n' 'Secret audit: failed or command unavailable; investigate privately'
fi
```

Interpret results separately: Gateway connectivity/authentication, clean secret audit, effective env-backed provider resolution, and actual inference are different claims. Do not use `models status --probe` as the acceptance gate in this setup. If fresh inference proof is required, use an authorized explicit-model canary through the running Gateway with a unique session, inspect requested/effective provider and fallback metadata, and account for cost/rate limits. The [earlier canary procedure](openclaw-provider-auth-routing-hardening-macos-2026-09-09.md#231-explicit-model-canary) is a reference, not evidence of new inference tests in this incident.

### Documentation-session validation

The published recipes were checked using isolated synthetic files and a stubbed Gateway command, not live OpenClaw state. Checks passed for 13 fenced JSON/zsh snippets, the 11-section template, local file-link targets, and 14 synthetic recovery cases covering token replacement/preservation, duplicate/multiline/symlink rejection, stale CLI-token replacement, empty dotenv values, backups without optional dotfiles, SQLite/JSON restoration, corrupt-backup refusal, and missing-source-database refusal. These tests establish recipe behavior, not real provider authentication or macOS Keychain authorization. Gitleaks and a separate credential-prefix/hex check found no leaks in the intended documentation before staging.

## 9. Final working state

The operator reported this successful final runtime state:

| Provider / setting | Result |
| --- | --- |
| 9Router | Env-backed |
| B.AI | Env-backed |
| Google | Env-backed |
| Groq | Env-backed |
| OmniRoute | Env-backed |
| OpenAI | Env-backed |
| OpenRouter | Env-backed |
| Shell environment | `Shell env: on` |
| Login-shell import settings | `env.shellEnv.enabled=true`; `env.shellEnv.timeoutMs=15000` |
| CLI/Gateway authentication | Recovered after rotation and CLI environment synchronization |

Reported final security counters:

```text
plaintext=0
unresolved=0
shadowed=0
storeResidue=0
legacy=0
```

These counters apply to the audit's scope, not to every file, environment, Keychain entry, backup, or historical SQLite page on the machine. Env-backed does not itself mean encrypted at rest: `.env` remains a sensitive plaintext file, while Keychain-backed loading moves persistent storage out of shell source. Telegram was included in credential migration, but its final backing type and a new message-delivery test were not supplied; do not infer either from the model-provider table.

### Known OpenClaw 2026.9.1 technical debt

- Provider-level store refs could audit as resolvable but show `effective=missing:missing` in this setup; the implementation defect remains unisolated.
- Live model probing encountered the exclusive-ownership versus active-Gateway-snapshot conflict.
- `openclaw secrets reload` still reported warning counts despite clean audit counters and resolving providers. The exact counts and causes were not independently explained. Record this as diagnostic/technical debt, not proof of leaked secrets and not a warning-free result.
- Custom-variable shell-import availability needs process-level verification; `Shell env: on` alone is not a guarantee.

Do not attribute the reload warnings to the earlier runbook's intentional loopback/other Doctor warnings without evidence. Re-check these limitations on a future release before deciding whether to return providers to store-backed refs.

## 10. Optional cleanup

### Rollback for every manually changed JSON/SQLite file

Do not begin rollback without the exact matching protected backup and a maintenance window. Stop all writers, preserve a second protected snapshot of the current state, and verify the backup SQLite integrity. Restore a matching configuration/state/model set when the changes were coupled; do not mix incompatible schema versions or upgrade/downgrade binaries blindly.

The commands below assume `backup` still names the verified directory from section 7. If using a new shell, select that directory explicitly before continuing; do not guess or choose the newest directory by name alone.

```bash
set +x
umask 077
(
  set -eu
  : "${backup:?Select the verified backup directory first}"
  test -d "$backup"
  for name in openclaw.sqlite openclaw.json models.json; do
    test -f "$backup/$name"
  done
  test -f "$HOME/.openclaw/state/openclaw.sqlite"
  test "$(sqlite3 -readonly "$backup/openclaw.sqlite" 'PRAGMA integrity_check;')" = 'ok'
  openclaw gateway stop

  # Restore the manually modified shared database through SQLite itself.
  # All other connections must be closed; never copy over a live WAL database.
  sqlite3 "$HOME/.openclaw/state/openclaw.sqlite" ".restore '$backup/openclaw.sqlite'"
  test "$(sqlite3 -readonly "$HOME/.openclaw/state/openclaw.sqlite" 'PRAGMA integrity_check;')" = 'ok'

  # This block restores the coupled JSON files as a matched set.
  cp -p "$backup/openclaw.json" "$HOME/.openclaw/openclaw.json"
  cp -p "$backup/models.json" "$HOME/.openclaw/agents/main/agent/models.json"
  chmod 600 "$HOME/.openclaw/state/openclaw.sqlite" \
    "$HOME/.openclaw/openclaw.json" "$HOME/.openclaw/agents/main/agent/models.json"
  printf '%s\n' 'Matched-set rollback complete; SQLite integrity: ok'
)
```

Require integrity `ok` and successful restores before starting the Gateway. SQLite `.restore` uses the database API rather than pairing an old main file with incompatible WAL/SHM sidecars. If it fails or database ownership cannot be established, stop; do not delete sidecars, force-unlock, or improvise a raw replacement. The same backup/restore procedure is mandatory for any additional SQLite file a future repair explicitly modifies; this incident did not establish changes to another database.

Restore `.zprofile` from its own backup if the loader change must be reversed. Restore or merge `.env` from its own backup only with token lifecycle awareness: keep the newly rotated token unless intentionally coordinating another rotation. If either file originally did not exist, remove only the newly introduced file or loader block after confirming it contains no later unrelated edits. Do not overwrite unrelated user changes.

A rollback may restore plaintext and invalidate the clean-audit claim. Restoring a retired token does not revoke or recover it at the provider. Re-run the audit, reapply sanitized refs, synchronize credentials, and verify Gateway/provider resolution before declaring recovery complete. Generated `models.json` may be regenerated after restart; an authored-config rollback must agree with it.

### Backup retirement

After the rollback window closes, securely manage or retire secret-bearing local backups according to the machine's storage/snapshot policy. Do not claim that deleting a file securely erases APFS snapshots or SSD blocks. Do not commit backups, dotenv files, credential stores, raw diagnostics, or shell profiles to this repository. Remove unused store entries only after verifying that no channel, Gateway, agent, or other tool still references them.

## 11. If this happens again

1. Establish the active OpenClaw version and Gateway installation; inspect diagnostics privately.
2. Test nonempty presence and child-process export separately from launchd, login-shell, dotenv, and store availability.
3. Run the secret audit and check resolution completeness. A clean result is necessary, not a runtime authentication guarantee.
4. If store refs resolve in audit but show missing at runtime, compare with this version-specific incident before changing storage. Back up first; use env-backed provider refs only with verified Gateway environment delivery.
5. Do not chase `--probe` by alternately stopping and starting the Gateway. Use the active Gateway and an authorized explicit-model canary if inference proof is needed.
6. If `.env` was overwritten, restore unrelated entries, rotate the authoritative Gateway token without displaying it, update the CLI loader, and restart/synchronize deliberately.
7. Clean only proven stale JSON/SQLite values, preserving unrelated data and a tested rollback path.
8. Record audit counters, effective provider sources, `Shell env` state, Gateway connectivity, and unresolved reload warnings separately. Never paste credentials or masked credential fragments into the report.

### Credits and implementation references

- Operator and incident account: Wafi.
- Related configuration/debugging history credits ChatGPT (GPT-5.6 Sol) for reasoning and OpenClaude CLI for execution in the September 1/9 runbooks. These are credits for those documented sessions, not independently established attribution for every action in this migration.
- This runbook and repository verification: OpenCode CLI, GPT-6 Astra (`opencode/gpt-6-astra`).
- Configuration/debugging tools: OpenClaw CLI/Gateway, zsh, launchctl, macOS Keychain Access and `security`, Node.js, SQLite CLI. Publication checks use Git and Gitleaks.
- Implementation cross-checks used the installed 2026.9.1 `docs/gateway/secrets.md`, `docs/cli/secrets.md`, `docs/cli/doctor.md`, `docs/concepts/models.md`, and `docs/reference/database-schemas.md`, plus the public bundled audit, model-secret-marker, shell-import, and Gateway-token generation code. They verify documented semantics, not the historical incident's live state.
