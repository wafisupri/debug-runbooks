# Session Documentation — Hermes Agent + Composio + GitHub Fix

**Date:** 2026-08-07  
**Environment:** macOS, zsh, Python 3.9 system/user install, Python 3.12 virtual environment, Hermes Agent, Composio CLI/SDK, GitHub integration

---

## 1. Goal

The objective was to get Hermes Agent working reliably with Composio and verify that GitHub was correctly connected to the intended account.

The session ultimately solved three separate problems that had been mixed together:

1. An obsolete Python 3.9 Composio installation was hijacking the `composio` command.
2. Hermes' own Composio setup instructions had introduced incompatible package generations.
3. Hermes itself encountered a terminal-history Unicode crash while processing pasted terminal output.

The final result is a working Composio SDK, a working current Composio CLI, and a verified GitHub connection.

---

## 2. Initial Symptoms

The recurring errors looked like this:

```text
AttributeError: module 'typing' has no attribute 'TypeAlias'
```

and later:

```text
ImportError: cannot import name 'Composio' from 'composio.client'
```

Hermes also produced its own internal error while handling pasted terminal content:

```text
Exception 'utf-8' codec can't encode character '\udce2' ...
surrogates not allowed
```

These were not one problem. They were three different failures.

---

## 3. Root Causes

### Root Cause A — Old Python 3.9 Composio CLI

The old executable was:

```text
/Users/wfspr/Library/Python/3.9/bin/composio
```

That installation used Python 3.9, but the installed Composio code used:

```python
typing.TypeAlias
```

which requires Python 3.10+.

That caused:

```text
AttributeError: module 'typing' has no attribute 'TypeAlias'
```

---

### Root Cause B — Mixed Composio Package Generations

Hermes' earlier setup instructions installed combinations including:

```text
composio
composio-core
composio-openai
composio-langchain
composio-claude
```

This resulted in a mixed environment containing modern and legacy Composio package lines at the same time.

The collision led to:

```text
ImportError: cannot import name 'Composio' from 'composio.client'
```

The important correction was:

- Do not install `composio-core` for the current setup.
- Do not mix legacy framework adapters with the current SDK unless version compatibility is verified.
- First make the base SDK and CLI work before adding optional framework integrations.

---

### Root Cause C — Shell PATH Precedence

Even after creating a clean Python 3.12 environment, the shell could still resolve:

```bash
composio
```

to the obsolete Python 3.9 executable.

The decisive check was:

```bash
which python
which pip
which composio
type -a composio
```

This exposed all competing executables.

---

### Root Cause D — Hermes TUI Unicode History Crash

Hermes itself crashed while saving malformed pasted terminal text into prompt history.

The internal failure came from `prompt_toolkit` attempting to encode a surrogate character:

```text
Exception 'utf-8' codec can't encode character '\udce2'
surrogates not allowed
```

This was a Hermes/TUI input-handling issue, not a Composio authentication issue.

---

## 4. What Was Wrong With the Earlier Troubleshooting

Several repetitive repair attempts happened because the problem was being treated as one generic Composio failure instead of being split into:

- Python version
- PATH
- package compatibility
- CLI version
- SDK version
- Hermes' own TUI behavior

The biggest wrong turns were:

### Installing packages repeatedly

Reinstalling everything did not solve the underlying problem because the old Python 3.9 binary was still available and incompatible package generations were being mixed.

### Using obsolete Python examples

Older instructions used:

```python
from composio import Composio, App
```

For the current setup, the verified import is:

```python
from composio import Composio
```

### Treating PATH and package errors as the same issue

The Python 3.12 SDK could work while the shell still launched the Python 3.9 CLI.

This was exactly what happened.

---

## 5. The Clean Fix

### Step 1 — Create a clean Python 3.12 environment

```bash
deactivate 2>/dev/null || true

rm -rf ~/composio-venv

/opt/homebrew/bin/python3.12 -m venv ~/composio-venv
source ~/composio-venv/bin/activate

python -m pip install --upgrade pip
python -m pip install composio
```

---

### Step 2 — Verify the SDK independently

```bash
python -c "from composio import Composio; print('SDK OK')"
```

Successful result:

```text
SDK OK
```

This proved the Python SDK itself was healthy.

---

### Step 3 — Install the current standalone Composio CLI

```bash
curl -fsSL https://composio.dev/install | bash
```

The CLI installed to:

```text
~/.composio/composio
```

with the shell entry point:

```text
~/.local/bin/composio
```

The installed CLI version was:

```text
0.3.2
```

---

### Step 4 — Fix PATH precedence permanently

Add the current CLI paths before the old Python paths:

```bash
echo 'export PATH="$HOME/.local/bin:$HOME/.composio:$PATH"' >> ~/.zshrc
exec zsh
```

Then verify:

```bash
which composio
type -a composio
composio --version
```

Correct active path:

```text
/Users/wfspr/.local/bin/composio
```

Correct version:

```text
0.3.2
```

---

## 6. Verified Current State

### Python SDK

Working:

```bash
python -c "from composio import Composio; print('SDK OK')"
```

Result:

```text
SDK OK
```

---

### Composio CLI

Working:

```bash
composio --version
```

Result:

```text
0.3.2
```

---

### Composio Login

Working:

```bash
composio login
```

Result:

```text
You're already logged in!
```

---

### GitHub Connection

The active GitHub connection was visible with:

```bash
composio connections list
```

One GitHub connection showed:

```text
status: ACTIVE
word_id: github_plough-gaz
```

Other older GitHub entries were `INITIALIZING` or `EXPIRED`.

---

## 7. How GitHub Ownership Was Verified

The strongest verification was:

```bash
composio execute GITHUB_GET_THE_AUTHENTICATED_USER
```

This successfully returned the authenticated GitHub identity:

```text
login: wafisupri
name: wfspr
id: 25943507
location: Brunei Darussalam
html_url: https://github.com/wafisupri
```

It also reported private-account information such as:

```text
owned_private_repos: 2
total_private_repos: 2
```

That is stronger evidence than simply fetching a public GitHub profile.

---

## 8. Commands That Matter

This is the compact working sequence.

### SDK

```bash
source ~/composio-venv/bin/activate
python -c "from composio import Composio; print('SDK OK')"
```

### CLI

```bash
which composio
composio --version
composio whoami
```

### GitHub

```bash
composio connections list
composio execute GITHUB_GET_THE_AUTHENTICATED_USER
```

---

## 9. Commands / Approaches To Avoid

Do not reinstall Composio just because an error appears.

Do not use the old Python 3.9 executable:

```text
~/Library/Python/3.9/bin/composio
```

Do not reinstall:

```text
composio-core
```

unless a specific, verified dependency requires it.

Do not use the old verification snippet:

```python
from composio import Composio, App
```

Do not blindly install all framework adapters together.

Do not let Hermes repeat the old `composio-setup` workflow without checking current CLI and SDK behavior first.

---

## 10. Optional Cleanup

The obsolete Python 3.9 Composio package still exists.

Verified old installation:

```text
Name: composio
Version: 0.15.0
Location: /Users/wfspr/Library/Python/3.9/lib/python/site-packages
```

Old executable:

```text
/Users/wfspr/Library/Python/3.9/bin/composio
```

It is no longer active because the current CLI is earlier in PATH.

This old installation can be removed later, but it is not currently blocking anything.

---

## 11. Hermes Agent Corrections

Hermes should treat the current setup as stable.

The correct baseline is:

```text
Python SDK: working
Python venv: ~/composio-venv
CLI: ~/.local/bin/composio
Standalone CLI source: ~/.composio/composio
CLI version: 0.3.2
Composio login: authenticated
GitHub connection: ACTIVE
GitHub authenticated user: wafisupri
```

Hermes should NOT:

- reinstall Composio automatically
- reinstall `composio-core`
- use Python 3.9
- overwrite PATH
- use obsolete `App.GITHUB` examples
- modify the environment unless explicitly requested

---

## 12. If This Happens Again

Run this first:

```bash
echo "=== Python ==="
which python
python --version

echo
echo "=== Composio CLI ==="
which composio
type -a composio
composio --version

echo
echo "=== SDK ==="
python -c "from composio import Composio; print('SDK OK')"

echo
echo "=== Login ==="
composio whoami

echo
echo "=== GitHub ==="
composio execute GITHUB_GET_THE_AUTHENTICATED_USER
```

Expected healthy state:

```text
Python 3.12.x
composio -> ~/.local/bin/composio
Composio CLI 0.3.2
SDK OK
authenticated Composio account
GitHub login = wafisupri
```

If those pass, do not reinstall anything.

---

## 13. Final Outcome

The session ended with:

- the Python 3.9 conflict identified
- the package-generation conflict identified
- the PATH conflict fixed
- the modern standalone Composio CLI installed
- Composio login verified
- SDK verified
- GitHub connection verified
- authenticated GitHub account confirmed
- repetitive reinstall loops stopped
- a stable baseline established for Hermes Agent

The key improvement was separating the problem into independent layers and verifying each one before changing anything else.
