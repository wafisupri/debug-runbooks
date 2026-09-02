# B.AI Free Models — macOS CLI Configuration Runbook

**Date:** 2026-09-03  
**Status:** Fixed  
**Platform:** macOS (Apple Silicon, arm64)

> ⏳ **Time-sensitive:** Two of the models below (DeepSeek V4 Flash and its Vision
> experimental variant) were announced as free only until 3 September 2026,
> 17:00 Asia/Brunei, unless B.AI extends the promotion. Confirm current
> availability before relying on them. See Section 11.

---

## 1. Purpose

This runbook documents the verified B.AI free-model configuration on this
macOS machine (Silver MBN / MacBook Neo). It records:

- which coding CLIs are wired to B.AI's free models and which are intentionally
  left unchanged,
- how the API key flows from macOS Keychain into each client without ever being
  stored in a repository file,
- the raw API model IDs and their user-facing display labels,
- the Codex-specific launch path (`bai-codex`) and its expected warnings,
- troubleshooting guidance keyed to HTTP status codes and error messages,
- rollback steps using the timestamped backup convention,
- a secret-handling checklist, and
- maintenance steps for the time-limited free promotion.

Everything in this file was verified on the setup date below. Any API key shown
in code blocks is a placeholder or is retrieved from Keychain at runtime — the
real key never appears in this repository.

---

## 2. Compatibility Matrix

### Configuration coverage (as applied at setup)

- **OpenCode:** B.AI registered as a custom OpenAI-compatible provider.
- **Qwen Code:** B.AI models added under its OpenAI-compatible provider.
- **OpenClaw:** B.AI provider and model aliases added.
- **Codex:** B.AI Responses provider registered (`[model_providers.bai]`,
  `wire_api = "responses"`).
- **Hermes:** `bai-hermes` convenience command added.
- **Claude Code:** intentionally unchanged — these free models are not
  officially verified for Claude Code.
- **Gemini CLI:** intentionally unchanged — it does not natively support
  arbitrary OpenAI-compatible providers.

### Route compatibility

| CLI | Endpoint family | Compatible B.AI free models | Status |
| :--- | :--- | :--- | :--- |
| Codex CLI | `/v1/responses` (via `bai-codex`) | `deepseek-v4-flash` only | Configured |
| OpenCode | OpenAI-compatible (chat completions) | All six (display labels) | Configured |
| Qwen Code | OpenAI-compatible (chat completions) | All six | Configured |
| OpenClaw | OpenAI-compatible (chat completions) | All six | Configured |
| Hermes Agent | OpenAI-compatible via `bai-hermes` | All six | Configured |
| Claude Code | — | None (not officially verified) | Intentionally unchanged |
| Gemini CLI | — | None (no native OpenAI-compatible provider support) | Intentionally unchanged |

Caveats:

- A model returned by `GET /v1/models` does **not** prove that the model
  supports every API endpoint. Verify per endpoint before switching a client.
- Inside the B.AI free set, `deepseek-v4-flash` is the model wired to Codex's
  `/v1/responses` route. The other free models use `/v1/chat/completions` and
  are **not** compatible with Codex's `/v1/responses` route.

---

## 3. Architecture & Configuration Flow

The design stores the credential in exactly one place (macOS Keychain) and
lets every client read it from the environment at runtime:

```
macOS Keychain  (service name: "B.AI API Key")
        │  security find-generic-password -w   (no plaintext on disk)
        ▼
~/.config/bai/env.zsh  ──►  export BAI_API_KEY
        │  sourced by ~/.zshrc
        ▼
bai-codex / bai-hermes / CLI configs
        ▼
https://api.b.ai/v1   (Responses for Codex; chat completions for the others)
```

### 1. Key storage

The key is stored only in the macOS Keychain under the service name
`B.AI API Key`. It is never written into a repository file, shell profile, or
CLI config.

### 2. Keychain bridge (`~/.config/bai/env.zsh`)

`env.zsh` retrieves the value at shell startup instead of storing it:

```zsh
# ~/.config/bai/env.zsh — B.AI credential bridge.
# The value is retrieved from macOS Keychain, not stored in this file.
export BAI_API_KEY="$(security find-generic-password -a "$USER" -s "B.AI API Key" -w 2>/dev/null)"
```

### 3. Shell loading (`~/.zshrc`)

The bridge and convenience commands are sourced from `~/.zshrc`:

```zsh
[[ -r "$HOME/.config/bai/env.zsh" ]] && source "$HOME/.config/bai/env.zsh"
[[ -r "$HOME/.config/bai/commands.zsh" ]] && source "$HOME/.config/bai/commands.zsh"
```

### 4. Codex provider registration (`~/.codex/config.toml`)

Codex references the key by environment variable name, never by literal value:

```toml
[model_providers.bai]
name = "B.AI"
base_url = "https://api.b.ai/v1"
env_key = "BAI_API_KEY"
wire_api = "responses"
```

Plain `codex` continues to use the pre-existing OmniRoute provider and default
model; `bai-codex` overrides only the per-invocation settings:

```zsh
# ~/.config/bai/commands.zsh — B.AI convenience commands
bai-codex() {
  codex -c 'model_provider="bai"' -c 'model="deepseek-v4-flash"' -c 'web_search="disabled"' "$@"
}

bai-hermes() {
  export OPENAI_API_KEY="$BAI_API_KEY"          # sourced from the Keychain bridge
  export OPENAI_BASE_URL="https://api.b.ai/v1"
  hermes "$@"
}
```

Existing OmniRoute providers and defaults were preserved; B.AI was added
alongside them rather than replacing anything.

### 5. Other clients

- **OpenCode:** B.AI provider in `~/.config/opencode/opencode.json` with the
  display labels from Section 4.
- **Qwen Code:** B.AI models declared under its OpenAI-compatible provider.
- **OpenClaw:** B.AI provider and model aliases in `~/.openclaw/openclaw.json`.
- **Hermes:** `bai-hermes` wrapper (above) points Hermes at the B.AI
  OpenAI-compatible endpoint.

### 6. Backups before every change

Each edited file was copied to a timestamped backup before modification (see
Section 9). Example backups created at setup on 2026-09-03:

```text
~/.config/bai/env.zsh.backup-20260903-013856
~/.config/bai/commands.zsh.backup-20260903-013856
~/.codex/config.toml.backup-20260903-013856
~/.config/opencode/opencode.json.backup-20260903-013856
~/.openclaw/openclaw.json.backup-20260903-013856
```

These backups live in the user's home configuration directories, **not** in
this repository, and must never be committed.

---

## 4. Installed Model Labels

`GET https://api.b.ai/v1/models` returned the following raw API IDs for the
account at setup. The display labels are what the CLIs show in pickers and
menus.

| Real API ID (send this on the wire) | Display label (UI only) |
| :--- | :--- |
| `glm-5.3-flash` | `[B.AI] GLM 5.3 Flash :free` |
| `qwen3.8-flash` | `[B.AI] Qwen 3.8 Flash :free` |
| `hy3` | `[B.AI] HY3 :free` |
| `mimo-v2.5` | `[B.AI] MiMo V2.5 :free` |
| `deepseek-v4-flash` ⏳ | `[B.AI] DeepSeek V4 Flash :free` |
| `deepseek-v4-flash-vision-exp` ⏳ | `[B.AI] DeepSeek V4 Flash Vision :free` |

Rules:

- `:free` is a **display-only** marker. It must never be appended to an API ID
  in a request — `deepseek-v4-flash:free` is not a valid model ID.
- The two rows marked ⏳ are promotional free models. See Section 11 for the
  expiry date and maintenance steps.
- A label in a picker does not guarantee endpoint support (see Section 2).

---

## 5. Installation & Verification

### Install (one-time, recorded on 2026-09-03)

1. Store the key in Keychain using the interactive prompt — never pass the key
   as a command-line argument:

   ```zsh
   security add-generic-password -U -s "B.AI API Key" -a "$USER" -w
   # type or paste the key at the prompt only
   ```

2. Create the Keychain bridge (`~/.config/bai/env.zsh`) and source it plus
   `commands.zsh` from `~/.zshrc` (Section 3, steps 2–3).

3. Register the Codex provider in `~/.codex/config.toml` (Section 3, step 4).

4. Add B.AI to the remaining clients per Section 2: OpenCode custom provider,
   Qwen Code OpenAI-compatible provider, OpenClaw provider + aliases, and the
   `bai-hermes` wrapper. Leave Claude Code and Gemini CLI unchanged.

5. Before each edit, create a timestamped backup (Section 9).

### Verification (results recorded on 2026-09-03)

| Check | Command | Expected result |
| :--- | :--- | :--- |
| Keychain bridge loaded | `[[ -n "$BAI_API_KEY" ]] && echo set` | `set` (do **not** print the value) |
| Codex launches B.AI | `bai-codex` | Codex starts with model header `deepseek-v4-flash` |
| Tool execution works | `whoami` (inside the Codex session) | `wfspr` |

Recorded outcome:

- `bai-codex` launched successfully with the active B.AI model
  `deepseek-v4-flash`.
- Codex executed `whoami` successfully and returned the macOS username:
  `wfspr`.

Optional non-interactive smoke test (first run may ask you to approve the
working directory):

```zsh
bai-codex exec "whoami"
```

---

## 6. Normal Usage

- **Daily Codex use:** launch `bai-codex`. The active model is
  `deepseek-v4-flash` via B.AI's `/v1/responses` route, with `web_search`
  disabled (the B.AI DeepSeek Responses route does not support web search).
- **Trust the model header:** the custom model may not appear in Codex's
  `/model` picker; the model header shown by Codex is the reliable indicator of
  the configured model (Section 7).
- **Other CLIs:** launch OpenCode, Qwen Code, OpenClaw, or Hermes normally and
  pick the B.AI model from the picker using the display labels in Section 4.
  The raw API ID is what gets sent on the wire.
- **Hermes:** use the `bai-hermes` convenience command to run Hermes against
  B.AI's OpenAI-compatible endpoint.
- **Chat-completions-only models:** the five non-`deepseek-v4-flash` free
  models cannot be driven through Codex's `/v1/responses` route. Use one of the
  chat-completions clients above for those models.

---

## 7. Expected Warnings

The following are known and expected for the B.AI + Codex setup. Do not treat
them as failures:

- **"Model metadata not found"** — Codex may display this for the custom B.AI
  model. It is currently expected; successful inference and tool execution
  confirm that the connection works.
- **Custom model missing from the `/model` picker** — expected for this custom
  provider registration. The model header is the reliable indicator of which
  model is active.
- **`web_search` disabled** — expected. B.AI's DeepSeek Responses route does
  not support web search, so it is turned off in `bai-codex`.
- **Chat-completions-only models rejected by Codex** — expected. Only
  `deepseek-v4-flash` is wired to Codex's `/v1/responses` route.

---

## 8. Troubleshooting by HTTP Status or Error Message

| Symptom / status | Likely cause | Action |
| :--- | :--- | :--- |
| `401 Unauthorized` | Key missing, wrong, or rotated in Keychain | Check that the Keychain item `B.AI API Key` exists and `BAI_API_KEY` is set (without printing it). Re-store the key via the interactive prompt (Section 5). |
| `403 Forbidden` | Account or endpoint restriction | Confirm plan entitlement and per-model endpoint support (Section 2). Try the `/v1/chat/completions` route for models that do not support `/v1/responses`. |
| `404 Model Not Found` | Wrong API ID, `:free` suffix accidentally appended, or a promotional model removed after expiry | Use the raw API IDs from Section 4 — never `:free`. If the model is a ⏳ promo model, check Section 11; otherwise roll back the last config change (Section 9). |
| `429 Too Many Requests` | Free-tier rate limit or quota, or promotional window pressure | Wait and retry with backoff, or switch to another B.AI free model. Confirm the promotion is still active (Section 11). |
| `5xx` / gateway timeout | Provider-side incident or overload | Retry later. Keep `web_search` disabled (it is unsupported on the DeepSeek Responses route). Check B.AI status before changing config. |
| `Model metadata not found` | Expected Codex warning for the custom provider | Run a real inference/tool call to confirm. See Section 7. |
| Route/endpoint not supported error on `/v1/responses` | Model is chat-completions-only | Use a chat-completions client (OpenCode, Qwen Code, OpenClaw, Hermes) or switch Codex back to `deepseek-v4-flash`. |
| Empty or stale model list from `/v1/models` | Auth problem, cached response, or promo removal | Re-run the safe model query in Section 11. Refresh the client picker; if a promo model disappeared, update labels per Section 11. |
| CLI fails to parse a config file | Malformed edit | Restore the timestamped backup for that file (Section 9) and re-verify (Section 5). |
| `bai-codex` does not connect | Bridge not loaded in the current shell | Run `source "$HOME/.config/bai/env.zsh"` in the same shell (key still stays out of files), then retry. |

General rule: if a credential is ever suspected of leaking (e.g., shown in a
diff, log, or issue), treat it as compromised — rotate it at B.AI, update the
Keychain item, and re-run the Section 5 verification.

---

## 9. Rollback Using Timestamped Backups

Every configuration file edited during this setup was backed up first using
the repository-wide convention:

```zsh
cp "<file>" "<file>.backup-$(date +%Y%m%d-%H%M%S)"
```

Example backups created on 2026-09-03 (see Section 3 for the full list):

```text
~/.codex/config.toml.backup-20260903-013856
~/.config/opencode/opencode.json.backup-20260903-013856
~/.openclaw/openclaw.json.backup-20260903-013856
~/.config/bai/env.zsh.backup-20260903-013856
~/.config/bai/commands.zsh.backup-20260903-013856
```

To roll back a single file:

```zsh
cp "$HOME/.codex/config.toml.backup-20260903-013856" "$HOME/.codex/config.toml"
```

Rules:

- Roll back one file at a time, then re-run the Section 5 verification.
- The backups live in home configuration directories, **not** in this
  repository. Never stage, commit, or push a `.backup-*` file.
- If a backup contains a credential (for example, an older config with an
  inline key), delete it after verifying the rollback instead of keeping it.
- Backups are short-lived by design: once the restored config is verified,
  archive or remove the backup.

---

## 10. Security & Secret-Handling Checklist

Use this checklist before and after any change to this configuration:

- [ ] The B.AI key exists in exactly one place: macOS Keychain, service
      `B.AI API Key`. It is never written into repository files, shell
      profiles, or CLI configs.
- [ ] `~/.config/bai/env.zsh` only retrieves the key from Keychain; it does
      not contain the value.
- [ ] Clients reference `BAI_API_KEY` by name (for example, Codex
      `env_key = "BAI_API_KEY"`) instead of embedding a literal key.
- [ ] Never run `env`, `printenv`, `set -x`, or verbose curl (`-v`/`-i`) in a
      session where `BAI_API_KEY` is exported.
- [ ] Never paste terminal output that contains credentials into an issue,
      pull request, or commit message.
- [ ] Never pass the key as a command-line argument or include it in a URL.
      Use the interactive Keychain prompt and the Authorization header.
- [ ] Before editing a config, create a `.backup-YYYYMMDD-HHMMSS` copy
      (Section 9); never commit a backup.
- [ ] Existing OmniRoute providers and defaults are preserved — new B.AI
      entries are added alongside them; nothing is replaced or removed.
- [ ] If a leak is suspected, rotate the key at B.AI immediately, update the
      Keychain item, and re-verify with Section 5.

This runbook intentionally contains no real credential — every example uses a
placeholder or a Keychain retrieval command.

---

## 11. Promotion-Expiry Maintenance

> ⚠️ **Time-sensitive.** B.AI announced DeepSeek V4 Flash
> (`deepseek-v4-flash`) and its experimental Vision variant
> (`deepseek-v4-flash-vision-exp`) as **free only until 3 September 2026,
> 17:00 Asia/Brunei (UTC+8)** unless B.AI extends the promotion. After that
> time, confirm availability before relying on either model. This runbook was
> written on the setup date (2026-09-03) while the promotion was still
> expected to be active.

### Check the current model list safely

Query `GET https://api.b.ai/v1/models` without printing the key:

```zsh
# 1) Load the Keychain bridge (exports BAI_API_KEY). Never echo the value.
source "$HOME/.config/bai/env.zsh"

# 2) Fetch the model list. The key travels in the Authorization header only —
#    never in the URL. -sS keeps response headers out of the transcript.
curl -sS https://api.b.ai/v1/models \
  -H "Authorization: Bearer $BAI_API_KEY" \
  -o /tmp/bai-models.json

# 3) Print only model ids and count (no header or credential material).
python3 - <<'PY'
import json

with open("/tmp/bai-models.json") as fh:
    data = json.load(fh)

models = data.get("data", [])
print("model count:", len(models))
for model in models:
    print(model.get("id"))
PY

# 4) Clean up and drop the variable from the shell.
rm -f /tmp/bai-models.json
unset BAI_API_KEY
```

Safety notes for the query:

- Do **not** use `curl -v`, `curl -i`, or an echo of `$BAI_API_KEY` — they
  print the Authorization header.
- The key is expanded into the curl argument for the lifetime of the process.
  On a single-user machine this is acceptable, but never run the query through
  a logging proxy or a shared/multi-user shell.
- If the response looks empty or the shell reports the variable is unset,
  source the bridge again and confirm the Keychain item exists.

### Maintenance checklist

- [ ] On or after the promo end (3 September 2026, 17:00 Asia/Brunei), run the
      safe model query and compare the returned API IDs with Section 4.
- [ ] If `deepseek-v4-flash` / `deepseek-v4-flash-vision-exp` are gone from
      the list, the promotion ended: update `bai-codex` to a still-available
      model (or a non-promotional B.AI model), refresh display labels, and note
      the change here.
- [ ] If the models remain, the promotion was extended — record the new expiry
      in this section.
- [ ] A model appearing in `/v1/models` does **not** mean it supports every
      endpoint. Verify `/v1/chat/completions` vs `/v1/responses` support for
      any model you newly wire into a client.
- [ ] Keep display labels separate from API IDs. `:free` is a label marker and
      must never be appended to an API ID in a request.
- [ ] After any model or config change, re-run the Section 5 verification
      (`bai-codex`, then `whoami`).
