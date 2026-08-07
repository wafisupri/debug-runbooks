# Recovery Runbook — OmniRoute, OpenCode, FreeLLM, and Hermes Agent

**Date:** 7 August 2026  
**Environment:** macOS Terminal.app, zsh, NVM, Node.js, pnpm, OpenCode, OmniRoute, FreeLLM, Hermes Agent  
**Primary project:** `/Users/wfspr/GitHub/ocr-wbt/ocr-wbt`

---

## 1. Incident Summary

Terminal.app crashed unexpectedly after OmniRoute, FreeLLM, OpenCode, and Hermes Agent had been running for several days.

After reopening Terminal:

- OmniRoute no longer appeared available from the shell.
- OpenCode would not reopen its previous session.
- FreeLLM appeared unavailable.
- Port `3000` responded, but it was not FreeLLM.
- The original Attendance PWA project directory appeared not to be a Git repository.
- Multiple Node versions and shell configuration changes made the symptoms look unrelated.

No project data or OpenCode session was lost.

The incident was caused by a combination of:

1. A changed active NVM Node version.
2. Global npm packages being installed under a different Node version.
3. An obsolete `opencode` shell alias.
4. A newer OpenCode configuration schema requiring `limit.output`.
5. The actual Git repository being nested one directory deeper than expected.
6. Hermes Agent and FreeLLM both attempting to use port `3000`.
7. FreeLLM requiring `pnpm`, which was not installed under the active Node version.
8. A different Python package also being named `freellm`.

---

## 2. Final Working State

| Service | Address | Status |
|---|---|---|
| Hermes Agent WhatsApp bridge | `http://127.0.0.1:3000` | Working |
| FreeLLM API | `http://127.0.0.1:3001/v1` | Working |
| OmniRoute | `http://127.0.0.1:20128/v1` | Working |
| FreeLLM dashboard | `http://localhost:5173` | Working while dev process runs |
| FreeLLM website | `http://localhost:4321` | Working while dev process runs |
| OpenCode | Project-local TUI | Working |
| Attendance PWA repository | `/Users/wfspr/GitHub/ocr-wbt/ocr-wbt` | Correct repository root |

The active default Node version was restored to:

```zsh
v24.18.1
```

---

## 3. What Initially Looked Wrong

### Port 3000 appeared active

The first inspection showed:

```zsh
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

Port `3000` was listening, but the process was:

```text
/Users/wfspr/.hermes/hermes-agent/scripts/whatsapp-bridge/bridge.js
```

This meant port `3000` belonged to Hermes Agent, not FreeLLM.

A request to:

```zsh
curl http://127.0.0.1:3000/v1/models
```

returned:

```text
Cannot GET /v1/models
```

That response was correct for the Hermes Express bridge. It was not evidence that FreeLLM itself was healthy.

### OmniRoute command disappeared

The shell showed:

```text
zsh: command not found: omniroute
```

The active Node version was:

```text
v24.19.0
```

OmniRoute had been globally installed under:

```text
v24.18.1
```

Because NVM keeps global npm packages separate per Node version, switching Node versions made `omniroute` appear missing.

### OpenCode printed help instead of launching

OpenCode was installed, but running:

```zsh
opencode
opencode -c
```

printed the CLI help.

The shell revealed:

```text
opencode: aliased to opencode --system "$(cat ~/.config/opencode/opencode.md)"
```

The installed OpenCode version no longer supported the old `--system` option. The alias injected an invalid argument every time OpenCode was started.

### OpenCode configuration was invalid

After bypassing the alias, OpenCode reported that many models were missing:

```text
provider.omniroute.models.<model>.limit.output
```

The configuration JSON itself was syntactically valid. The problem was schema validation: newer OpenCode versions expected every configured model to have an output-token limit.

### The project directory was wrong

This path existed:

```text
/Users/wfspr/GitHub/ocr-wbt
```

But it was not the Git repository root.

The real repository was:

```text
/Users/wfspr/GitHub/ocr-wbt/ocr-wbt
```

The `.git` directory was inside the nested folder.

### FreeLLM command was misleading

This command existed:

```zsh
which freellm
```

It resolved to:

```text
/Users/wfspr/Library/Python/3.9/bin/freellm
```

Running:

```zsh
freellm start
```

produced:

```text
403 Client Error: Forbidden for https://talkai.info/api/sse/
```

This was a separate Python package named `freellm`, not the local TypeScript monorepo in:

```text
/Users/wfspr/GitHub/freellm
```

The correct FreeLLM repository was started with its pnpm workspace command.

---

## 4. Recovery Actions

## 4.1 Restored the Correct Node Version

The default NVM version was changed back to the version containing OmniRoute:

```zsh
nvm alias default 24.18.1
nvm use 24.18.1
```

Verification:

```zsh
node -v
which omniroute
```

Expected:

```text
v24.18.1
/Users/wfspr/.nvm/versions/node/v24.18.1/bin/omniroute
```

This restored access to OmniRoute without reinstalling it.

---

## 4.2 Restored OmniRoute

OmniRoute was started under Node `v24.18.1`.

Verification:

```zsh
lsof -nP -iTCP:20128 -sTCP:LISTEN
curl -sS http://127.0.0.1:20128/api/init
```

Expected response:

```json
{"initialized":true}
```

No OmniRoute data or provider configuration was lost.

---

## 4.3 Removed the Broken OpenCode Alias

Temporary removal:

```zsh
unalias opencode 2>/dev/null
```

Verification:

```zsh
type -a opencode
```

The command should resolve to an executable path, not an alias containing `--system`.

Permanent correction in `~/.zshrc`:

```zsh
grep -n 'alias opencode' ~/.zshrc
nano ~/.zshrc
```

The obsolete line was removed or commented:

```zsh
alias opencode="opencode --system \"$(cat ~/.config/opencode/opencode.md)\""
```

Then the shell was reloaded:

```zsh
source ~/.zshrc
```

---

## 4.4 Updated the OpenCode Model Configuration

A backup was created first:

```zsh
cp ~/.config/opencode/opencode.json \
   ~/.config/opencode/opencode.json.backup-20260807
```

The configuration already had correct limits for some models, for example:

```json
"limit": {
  "context": 1048576,
  "output": 384000,
  "input": 1048576
}
```

Many other models lacked `limit.output`.

The missing fields were added programmatically:

```zsh
python3 - <<'PY'
import json
from pathlib import Path

path = Path.home() / ".config/opencode/opencode.json"
config = json.loads(path.read_text())

changed = 0

for model in config["provider"]["omniroute"]["models"].values():
    limit = model.setdefault("limit", {})

    if "context" not in limit:
        limit["context"] = 128000

    if "output" not in limit:
        limit["output"] = 16384
        changed += 1

path.write_text(json.dumps(config, indent=2) + "\n")
print(f"Updated {changed} models")
PY
```

JSON validation:

```zsh
python3 -m json.tool ~/.config/opencode/opencode.json >/dev/null \
  && echo "OpenCode JSON valid"
```

This fixed the OpenCode schema error.

---

## 4.5 Located the Correct Attendance PWA Repository

The Git repositories were located with:

```zsh
find /Users/wfspr/GitHub -maxdepth 5 -type d -name .git -print
```

The Attendance PWA repository was found at:

```text
/Users/wfspr/GitHub/ocr-wbt/ocr-wbt/.git
```

Correct working directory:

```zsh
cd /Users/wfspr/GitHub/ocr-wbt/ocr-wbt
git status
```

The active branch remained:

```text
feature/attendance-ai-import
```

---

## 4.6 Relaunched OpenCode and Recovered the Previous Session

Normal launch:

```zsh
cd /Users/wfspr/GitHub/ocr-wbt/ocr-wbt
opencode
```

Resume most recent session:

```zsh
cd /Users/wfspr/GitHub/ocr-wbt/ocr-wbt
opencode -c
```

A shell shortcut can be kept in `~/.zshrc`:

```zsh
alias attendance='cd /Users/wfspr/GitHub/ocr-wbt/ocr-wbt && opencode -c'
```

Reload after adding it:

```zsh
source ~/.zshrc
```

Then resume with:

```zsh
attendance
```

---

## 4.7 Identified the Port Collision

At one point, both Hermes and FreeLLM were listening on port `3000` using different interfaces:

```text
Hermes: 127.0.0.1:3000
FreeLLM: *:3000
```

The process list showed:

- Hermes WhatsApp bridge on PID `87472`
- FreeLLM gateway on PID `96044`

A shell assignment such as:

```zsh
PID=$(lsof -tiTCP:3000 -sTCP:LISTEN)
```

returned two PIDs separated by a newline. Passing that directly to:

```zsh
ps -p "$PID"
```

failed because `ps` received one invalid multi-line process identifier.

For multiple listeners, use:

```zsh
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

or:

```zsh
PIDS=$(lsof -tiTCP:3000 -sTCP:LISTEN | paste -sd, -)
ps -p "$PIDS" -o pid,ppid,command
```

The preferred final decision was:

- Keep Hermes on port `3000`
- Move FreeLLM to port `3001`

---

## 4.8 Installed pnpm Under the Correct Node Version

FreeLLM used a pnpm workspace, but `pnpm` was not installed under Node `v24.18.1`.

Installation:

```zsh
npm install -g pnpm
```

Verification:

```zsh
pnpm --version
```

Installed version:

```text
11.20.0
```

---

## 4.9 Configured FreeLLM to Use Port 3001

The FreeLLM repository:

```text
/Users/wfspr/GitHub/freellm
```

A `.env` file was created or updated:

```zsh
cd /Users/wfspr/GitHub/freellm
touch .env

grep -v '^PORT=' .env > .env.tmp
printf '\nPORT=3001\n' >> .env.tmp
mv .env.tmp .env
```

Verification:

```zsh
grep '^PORT=' .env
```

Expected:

```text
PORT=3001
```

---

## 4.10 Started the Correct FreeLLM Repository

Dependencies:

```zsh
cd /Users/wfspr/GitHub/freellm
pnpm install
```

Start all workspace services:

```zsh
pnpm run dev
```

This launched:

```text
FreeLLM gateway: http://localhost:3001
Dashboard:       http://localhost:5173
Website:         http://localhost:4321
```

The critical success message was:

```text
FreeLLM gateway listening
port: 3001
```

---

## 4.11 Verified FreeLLM

Model endpoint test:

```zsh
curl -sS http://127.0.0.1:3001/v1/models \
  -H 'Authorization: Bearer freellm'
```

The response listed working models including:

```text
free
free-fast
free-smart
groq/llama-3.3-70b-versatile
groq/llama-3.1-8b-instant
groq/meta-llama/llama-4-scout-17b-16e-instruct
groq/qwen/qwen3-32b
gemini/gemini-2.5-flash
gemini/gemini-2.5-pro
```

Listener verification:

```zsh
echo "Hermes:"
lsof -nP -iTCP:3000 -sTCP:LISTEN

echo "FreeLLM:"
lsof -nP -iTCP:3001 -sTCP:LISTEN
```

Final result:

```text
Hermes:  127.0.0.1:3000
FreeLLM: *:3001
```

---

## 5. Commands to Use From Now On

## Start OmniRoute

Ensure the correct Node version is active:

```zsh
nvm use 24.18.1
omniroute
```

Verify:

```zsh
curl -sS http://127.0.0.1:20128/api/init
```

---

## Start FreeLLM

```zsh
cd /Users/wfspr/GitHub/freellm
pnpm run dev
```

Keep this Terminal tab open.

Verify:

```zsh
curl -sS http://127.0.0.1:3001/v1/models \
  -H 'Authorization: Bearer freellm'
```

---

## Start or Resume OpenCode

Start a new OpenCode session in the Attendance PWA:

```zsh
cd /Users/wfspr/GitHub/ocr-wbt/ocr-wbt
opencode
```

Resume the most recent session:

```zsh
cd /Users/wfspr/GitHub/ocr-wbt/ocr-wbt
opencode -c
```

---

## Check Hermes Agent

```zsh
lsof -nP -iTCP:3000 -sTCP:LISTEN
pgrep -alf 'hermes|whatsapp-bridge'
```

Do not use port `3000` for FreeLLM.

---

## 6. Correct Environment Variables

For applications connecting directly to FreeLLM:

```zsh
export OPENAI_BASE_URL=http://localhost:3001/v1
export OPENAI_API_KEY=freellm
```

For OmniRoute, retain its existing configuration:

```zsh
export OMNIROUTE_API_KEY="<existing-key>"
```

OmniRoute base URL:

```text
http://localhost:20128/v1
```

Do not leave a global FreeLLM base URL pointing to port `3000`.

---

## 7. Things Not to Repeat

### Do not run the Python `freellm` package

Avoid:

```zsh
freellm start
```

On this Mac, it resolves to:

```text
/Users/wfspr/Library/Python/3.9/bin/freellm
```

That package attempted to access `talkai.info` and failed with HTTP 403.

Use the repository instead:

```zsh
cd /Users/wfspr/GitHub/freellm
pnpm run dev
```

### Do not run `npm start` in the FreeLLM repository

The root `package.json` has no `start` script.

Use:

```zsh
pnpm run dev
```

### Do not use the old OpenCode alias

Avoid any alias containing:

```text
opencode --system
```

The installed OpenCode no longer accepts that option.

### Do not use the wrong project folder

Incorrect:

```text
/Users/wfspr/GitHub/ocr-wbt
```

Correct:

```text
/Users/wfspr/GitHub/ocr-wbt/ocr-wbt
```

### Do not assign multiple PIDs to one quoted `ps -p` argument

When a port has multiple listeners, inspect them with `lsof` or convert newlines to commas.

### Do not reinstall tools before checking the active Node version

With NVM, global packages are installed per Node version.

Always check:

```zsh
node -v
which <command>
npm list -g --depth=0
```

### Do not run `npm install` casually inside a pnpm workspace

It created an unwanted `package-lock.json`.

The FreeLLM repository showed:

```text
M .env.example
M pnpm-lock.yaml
M pnpm-workspace.yaml
?? "Testing Your API Connection - FreeLLM.rtf"
?? package-lock.json
```

Only `package-lock.json` was clearly caused by the accidental npm install. The other changes may predate the incident and should be reviewed before reverting.

---

## 8. Fast Diagnostic Checklist

Run this when something stops working:

```zsh
echo "=== Node ==="
node -v
which node
which npm
which pnpm
which omniroute
type -a opencode

echo
echo "=== Ports ==="
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:3001 -sTCP:LISTEN
lsof -nP -iTCP:20128 -sTCP:LISTEN

echo
echo "=== Processes ==="
pgrep -alf 'hermes|whatsapp-bridge|freellm|omniroute|opencode|node'

echo
echo "=== OmniRoute ==="
curl -sS http://127.0.0.1:20128/api/init

echo
echo "=== FreeLLM ==="
curl -sS http://127.0.0.1:3001/v1/models \
  -H 'Authorization: Bearer freellm'
```

Expected port ownership:

```text
3000  Hermes Agent
3001  FreeLLM
20128 OmniRoute
```

---

## 9. One-Shot Recovery Sequence

Use this sequence after a Terminal crash.

### Terminal tab 1 — OmniRoute

```zsh
nvm use 24.18.1
omniroute
```

### Terminal tab 2 — FreeLLM

```zsh
nvm use 24.18.1
cd /Users/wfspr/GitHub/freellm
pnpm run dev
```

### Terminal tab 3 — OpenCode

```zsh
nvm use 24.18.1
cd /Users/wfspr/GitHub/ocr-wbt/ocr-wbt
opencode -c
```

### Verification tab

```zsh
echo "Hermes"
lsof -nP -iTCP:3000 -sTCP:LISTEN

echo "FreeLLM"
lsof -nP -iTCP:3001 -sTCP:LISTEN

echo "OmniRoute"
lsof -nP -iTCP:20128 -sTCP:LISTEN

curl -sS http://127.0.0.1:20128/api/init
curl -sS http://127.0.0.1:3001/v1/models \
  -H 'Authorization: Bearer freellm'
```

---

## 10. Root-Cause Summary

The Terminal crash itself did not destroy anything. It exposed several configuration dependencies that had accumulated:

- Services were running as foreground processes.
- NVM switched the shell to a Node version without the required global packages.
- OpenCode had an obsolete alias and outdated model definitions.
- The expected project path was one level above the actual Git repository.
- Hermes and FreeLLM were sharing port `3000`.
- FreeLLM depended on pnpm under the active Node installation.
- A separate Python package used the same `freellm` command name.

The recovery succeeded because each layer was checked independently:

1. Process and port ownership.
2. Active Node version and global package paths.
3. Shell aliases.
4. OpenCode configuration schema.
5. Actual Git repository location.
6. FreeLLM package manager and workspace command.
7. Permanent port separation.
8. Endpoint-level verification.

No project work, provider data, or OpenCode session was lost.
