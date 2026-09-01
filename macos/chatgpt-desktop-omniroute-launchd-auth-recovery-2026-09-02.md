# ChatGPT Desktop + OmniRoute launchd Authentication Recovery — 2026-09-02

**Date:** 2026-09-02

**Status:** Fixed / Verified

**Platform:** macOS

---

## Summary

ChatGPT Desktop launched successfully and loaded existing Codex/Work history, but every new prompt failed with a `401 Unauthorized` error:

```text
unexpected status 401 Unauthorized: No active credentials for provider: codex
```

The local Codex configuration deliberately used OmniRoute as its default model provider, and OmniRoute itself was healthy. The actual failure was macOS GUI environment inheritance: `CODEX_OMNIROUTE_API_KEY` existed in the interactive zsh shell but was absent from the user's `launchd` environment. ChatGPT.app, when opened from Finder/Dock, therefore reached OmniRoute without the required credential.

The working fix was to copy the already-present shell variable into the per-user `launchd` environment with `launchctl setenv`, then relaunch ChatGPT Desktop.

No credential values are included in this runbook.

---

## Environment

- **Operating system:** macOS
- **Shell:** zsh
- **Application:** ChatGPT Desktop / Codex workspace
- **Gateway:** OmniRoute
- **Observed OmniRoute process version:** `v16.3.1`
- **OmniRoute API:** `http://127.0.0.1:20128/v1`
- **Codex home:** `~/.codex`
- **Relevant config:** `~/.codex/config.toml`
- **Relevant environment variable:** `CODEX_OMNIROUTE_API_KEY`

Relevant provider configuration:

```toml
model_provider = "omniroute"

[model_providers.omniroute]
name = "OmniRoute"
base_url = "http://127.0.0.1:20128/v1"
wire_api = "responses"
env_key = "CODEX_OMNIROUTE_API_KEY"
```

The `OmniRoute` label shown in ChatGPT Desktop was therefore expected: it represented the configured Codex model provider, not evidence that the desktop application was logged into a different ChatGPT account.

---

## Symptoms

1. ChatGPT Desktop opened normally and displayed existing history.
2. New prompts did not complete.
3. The app repeatedly showed:

   ```text
   401 Unauthorized: No active credentials for provider: codex
   ```

4. Logging out and back in through the ChatGPT web account did not change the desktop behavior.
5. `~/.codex/config.toml` explicitly selected `omniroute`.
6. OmniRoute's own dashboard successfully tested the Codex-backed model route using an OmniRoute API key.
7. An unauthenticated API request to OmniRoute correctly returned an authentication error:

   ```json
   {
     "error": {
       "message": "Authentication required",
       "type": "invalid_api_key",
       "code": "invalid_api_key"
     }
   }
   ```

---

## Root Cause

The custom Codex provider configuration told ChatGPT Desktop to authenticate to OmniRoute using the environment variable:

```text
CODEX_OMNIROUTE_API_KEY
```

The variable existed in the interactive shell but not in the GUI `launchd` environment:

```text
shell: SET (35 chars)
launchd: NOT SET
```

Applications opened from Finder/Dock do not necessarily inherit variables exported only by an interactive shell profile. As a result, ChatGPT.app could reach `127.0.0.1:20128` but could not present the credential required by OmniRoute.

The downstream OmniRoute/Codex route was not the fault: it had already passed an independent dashboard test.

---

## What Did Not Work

- Logging out of the ChatGPT web app and signing back in.
- Treating the `OmniRoute` label as a wrong ChatGPT-account identity.
- Assuming `~/.codex/auth.json` was necessarily the failing authentication layer.
- Considering removal of `model_provider = "omniroute"` before proving the custom gateway itself was faulty.
- Calling `/v1/models` without a Bearer credential and interpreting the expected 401 as evidence that OmniRoute was down.

These approaches targeted the wrong layer. The failure was between the macOS GUI process environment and the local OmniRoute gateway.

---

## Final Fix

Quit ChatGPT Desktop completely, then copy the already-loaded shell credential into the user's `launchd` environment:

```bash
launchctl setenv CODEX_OMNIROUTE_API_KEY "$CODEX_OMNIROUTE_API_KEY"
```

Verify without printing the secret:

```bash
v="$(launchctl getenv CODEX_OMNIROUTE_API_KEY)"
if [[ -n "$v" ]]; then
  echo "launchd: SET (${#v} chars)"
else
  echo "launchd: NOT SET"
fi
unset v
```

Expected result:

```text
launchd: SET (35 chars)
```

Then relaunch ChatGPT Desktop:

```bash
open -a ChatGPT
```

The next prompt completed successfully through OmniRoute.

---

## Commands

### 1. Confirm OmniRoute is running

```bash
ps aux | grep -i '[o]mniroute'
```

### 2. Confirm OmniRoute enforces authentication

```bash
curl -sS http://127.0.0.1:20128/v1/models | jq .
```

An unauthenticated request should return an authentication error. That proves the endpoint is reachable and credential-protected; it is not a successful model test.

### 3. Compare shell and GUI environment state safely

```bash
printf 'shell: '
if [[ -n "$CODEX_OMNIROUTE_API_KEY" ]]; then
  echo "SET (${#CODEX_OMNIROUTE_API_KEY} chars)"
else
  echo "NOT SET"
fi

printf 'launchd: '
v="$(launchctl getenv CODEX_OMNIROUTE_API_KEY)"
if [[ -n "$v" ]]; then
  echo "SET (${#v} chars)"
else
  echo "NOT SET"
fi
unset v
```

### 4. Inject the credential into launchd

```bash
launchctl setenv CODEX_OMNIROUTE_API_KEY "$CODEX_OMNIROUTE_API_KEY"
```

### 5. Relaunch ChatGPT Desktop

```bash
open -a ChatGPT
```

---

## Verification

The working state was verified at multiple layers:

| Check | Result |
|---|---|
| OmniRoute process running | PASS |
| Local API endpoint reachable | PASS |
| API authentication enforced | PASS |
| OmniRoute dashboard Codex route | PASS |
| Shell credential present | PASS |
| `launchd` credential before fix | FAIL / missing |
| `launchd` credential after fix | PASS |
| ChatGPT Desktop response after relaunch | PASS |

Final proof: ChatGPT Desktop responded normally to a new prompt after `launchctl setenv` and relaunch.

---

## Final Working State

```ini
CODEX_MODEL_PROVIDER=omniroute
OMNIROUTE_ENDPOINT=http://127.0.0.1:20128/v1
OMNIROUTE_PROCESS=RUNNING
OMNIROUTE_AUTH_ENFORCEMENT=PASS
SHELL_CODEX_OMNIROUTE_API_KEY=SET
LAUNCHD_CODEX_OMNIROUTE_API_KEY=SET
CHATGPT_DESKTOP_401=FIXED
CHATGPT_DESKTOP_GENERATION=PASS
FINAL_STATUS=CLOSED
```

`~/.codex/config.toml` and the custom OmniRoute provider were left intact because they were valid configuration. No destructive reset of `auth.json` was required.

---

## Persistence Caveat

`launchctl setenv` changes the current user launchd environment but should not automatically be assumed to survive every logout or reboot.

If the same 401 returns after a new login session, first rerun the safe shell/launchd comparison above. If `shell` is `SET` but `launchd` is `NOT SET`, restore the variable to `launchd` again or implement a secure persistent login-time mechanism rather than storing the secret directly in public configuration or documentation.

---

## Secret Handling

Never print or commit the value of `CODEX_OMNIROUTE_API_KEY`.

Safe checks should report only whether the variable is present and, optionally, its character count. If a real credential appears in a public repository, redact it from the current file and rotate/revoke the exposed credential because Git history may still retain the old value.

---

## If This Happens Again

Run this minimal sequence:

```bash
ps aux | grep -i '[o]mniroute'

printf 'shell: '
[[ -n "$CODEX_OMNIROUTE_API_KEY" ]] && echo "SET (${#CODEX_OMNIROUTE_API_KEY} chars)" || echo "NOT SET"

printf 'launchd: '
v="$(launchctl getenv CODEX_OMNIROUTE_API_KEY)"
[[ -n "$v" ]] && echo "SET (${#v} chars)" || echo "NOT SET"
unset v
```

If shell is set and launchd is not:

```bash
launchctl setenv CODEX_OMNIROUTE_API_KEY "$CODEX_OMNIROUTE_API_KEY"
open -a ChatGPT
```

Do not delete `~/.codex/auth.json` or remove the OmniRoute provider unless diagnostics independently prove those components are broken.

---

## Credits / Provenance

- **Human operator:** Wafi Supri — system owner/operator; executed diagnostics, supplied outputs, validated the OmniRoute dashboard route, and confirmed the final ChatGPT Desktop response.
- **ChatGPT (GPT-5.6 Sol):** troubleshooting sequence, layer-by-layer diagnosis, safe credential checks, root-cause identification, verification plan, and runbook preparation.
- **OmniRoute CLI / gateway v16.3.1:** local OpenAI-compatible gateway used by the ChatGPT/Codex provider configuration.
- **macOS Terminal / zsh:** command execution environment.
- **CLI utilities used:** `ps`, `curl`, `jq`, `grep`, `sed`, `launchctl`, and `open`.
