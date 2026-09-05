# OpenClaw 2026.9.1 Skills Dependency Hardening — 97 Ready, 5 Intentionally Disabled, 0 Missing Requirements

**Date:** 2026-09-06  
**Status:** Fixed / Verified  
**Platform:** macOS (Apple Silicon / arm64)  
**Components:** OpenClaw 2026.9.1 (build ad6fe23), Homebrew, Go, npm, uv, launchd, zsh

---

## 1. Summary

An OpenClaw 2026.9.1 install on macOS began the session with many skills enabled but unusable: 32 skills reported missing requirements, so the model could see them but could not actually run them.

The session took OpenClaw from that broken half-state to a clean, intentional final state:

```text
Total:                    102
Eligible:                 97
Visible to model:         97
Available as command:     96
Disabled:                 5
Blocked by allowlist:     0
Excluded by agent allowlist: 0
Missing requirements:     0
```

The core work was dependency hardening — installing the correct binaries for every intended skill using the packages OpenClaw actually declares, wiring them onto a PATH the Gateway's LaunchAgent can see, and removing an unwanted ClawHub-tracked skill that kept reinstalling itself.

Five skills were deliberately left disabled because they depend on paid cloud APIs or are simply unused. They are **not broken** — disabling them is the correct final design.

The success criterion was never "102/102 enabled." It was **zero missing requirements among the skills the user actually intends to run**.

---

## 2. Environment

```text
OS                        macOS (Apple Silicon / arm64)
Shell                     zsh
Homebrew prefix           /opt/homebrew
OpenClaw                  2026.9.1
OpenClaw build            ad6fe23
Gateway process           LaunchAgent: gui/501/ai.openclaw.gateway
Go binaries               ~/go/bin
uv tools                  ~/.local/bin (typical)
Interactive PATH          /usr/local/bin, ~/go/bin, ~/.local/bin,
                          /opt/homebrew/bin, /opt/homebrew/sbin, ...
```

Key distinction that drove much of the debugging: the **interactive zsh PATH** and the **PATH inherited by the Gateway LaunchAgent** are not the same. A binary that runs fine in Terminal can still be invisible to OpenClaw.

---

## 3. Symptoms / Initial State

At the start of the session OpenClaw reported roughly:

```text
Total:                    102
Eligible:                 70
Visible:                  70
Available as command:     69
Disabled:                 0
Missing requirements:     32
```

All intended skills had already been enabled, except one unwanted ClawHub skill that was later removed. The problem was not "skills turned off" — it was 32 enabled skills whose required binaries or environment were missing, so they were listed but not runnable.

Additional friction observed during the session:

- Pasting command blocks that contained `#` comments into zsh produced `zsh: command not found: #`.
- Homebrew repeatedly warned that `anomalyco/tap` was untrusted.
- `openclaw skills update --all` kept resurrecting a removed skill.

---

## 4. Root Cause

Three independent root causes combined into the "enabled but unusable" state:

1. **Missing dependencies.** 32 skills each declared a required binary, package, or environment variable that was not installed. OpenClaw correctly marked them as missing requirements rather than pretending they worked.

2. **PATH / LaunchAgent visibility gap.** Some binaries were installed correctly (e.g. Go tools in `~/go/bin`) and worked interactively, but the Gateway LaunchAgent did not inherit those directories, so the dependency check still failed for the Gateway.

3. **ClawHub lock tracking.** An unwanted skill (`mgc-meta-skill`) was still tracked in the ClawHub lock file, so deleting only its workspace directory was not enough — `openclaw skills update --all` reinstalled it from the lock.

The single most important lesson: **do not guess package names from missing binary names.** The reliable method was to ask OpenClaw itself what each skill needs.

---

## 5. What Did Not Work

Documented so these false starts are not repeated:

1. `brew install memo` — formula not found in core Homebrew. Requires the `antoniorodr/memo` tap.

2. `brew install remindctl` — not in core. Requires `steipete/tap/remindctl`.

3. `go install github.com/Hyaxia/blogwatcher@latest` — the module root has no installable package. The correct path includes `/cmd/blogwatcher`.

4. `brew install gog` — wrong formula name. The correct formula is `gogcli`, which installs the binary `gog`.

5. `brew install xurl` — wrong formula lookup. The working install used the `xdevplatform/tap/xurl` cask.

6. Several `steipete/tap` formulae initially failed because Homebrew enforces tap trust. Fixed with **targeted** `brew trust --formula ...` per formula — not by broadly trusting the whole tap.

7. Do **not** trust `anomalyco/tap` merely to silence Homebrew warnings. Homebrew repeatedly reported it as untrusted; it was left untrusted on purpose.

8. `blogwatcher` was installed and executable interactively but still missing to OpenClaw. Root cause was LaunchAgent PATH visibility, not a bad install. A `/opt/homebrew/bin` symlink resolved it.

9. The Obsidian CLI binary existed, but `obsidian version` failed when the desktop app was not running. Binary discovery and application runtime are separate checks — this is an application-runtime condition, not a missing binary.

10. Chasing a fake "102/102 enabled" goal. The correct final design intentionally disables unused or billing-dependent integrations. Success is **zero missing requirements among intended skills**, not maximum enabled count.

---

## 6. Final Fix

### 6.1 Dependency discovery method (the key technique)

Never infer a package name from a missing binary name. For every skill with a missing requirement, ask OpenClaw directly:

```bash
openclaw skills info <skill>
```

A batch loop was used to inspect all missing skills at once. This exposed the exact install method per skill: `brew`, `npm`, `go`, `uv`, an environment variable, or app-specific setup.

### 6.2 Remove the unwanted ClawHub meta skill (`mgc-meta-skill`)

`@zkeviny/mgc-meta-skill@1.4.10` had been installed. Its ClawHub audit result was **Review**, and it was not wanted. Deleting only the workspace directory was insufficient because `openclaw skills update --all` reinstalled it from the ClawHub lock file.

Correct, durable removal:

```bash
# 1. Back up the lock file first
cp ~/.openclaw/workspace/.clawhub/lock.json \
   ~/.openclaw/workspace/.clawhub/lock.json.bak

# 2. Remove the skill's entry from the lock (jq)
jq 'del(.skills["mgc-meta-skill"])' \
   ~/.openclaw/workspace/.clawhub/lock.json.bak \
   > ~/.openclaw/workspace/.clawhub/lock.json

# 3. Remove the workspace skill directory
rm -rf ~/.openclaw/workspace/skills/mgc-meta-skill

# 4. Verify no lock entry remains (expect: null)
jq '.skills["mgc-meta-skill"]' ~/.openclaw/workspace/.clawhub/lock.json

# 5. Force a sync and confirm it does NOT come back
openclaw skills update --all
```

After the sync, the skill did not return.

### 6.3 OpenClaw Blackbox (`openclaw-blackbox`)

`@shan8851/openclaw-blackbox@0.1.0` was installed; its ClawHub security audit outcome was **Safe**. The skill initially lacked its required `blackbox` binary. The required package was discovered — not guessed — with:

```bash
openclaw skills info openclaw-blackbox
```

Correct binary install (note this is **not** an unrelated "Blackbox AI" CLI):

```bash
npm install -g @shan8851/blackbox
```

The skill then became Ready.

### 6.4 PATH / LaunchAgent visibility

Interactive shell PATH included directories the Gateway LaunchAgent did not necessarily inherit. `~/go/bin` worked interactively but the Gateway could not see `blogwatcher` there. The fix was to link required binaries into `/opt/homebrew/bin` (which the Gateway does see), and keep `/usr/local/bin` available for Obsidian.

Persisted PATH additions:

```bash
export PATH="$HOME/go/bin:$PATH"
export PATH="/usr/local/bin:$PATH"
```

Also enabled interactive comments so pasted blocks containing `#` stop producing `zsh: command not found: #`:

```bash
setopt interactivecomments
echo 'setopt interactivecomments' >> ~/.zshrc
```

### 6.5 Obsidian (binary vs. running application)

Installed Obsidian version **1.13.7**. The official CLI ships inside the app bundle:

```text
/Applications/Obsidian.app/Contents/MacOS/obsidian-cli
```

A symlink onto PATH was required:

```bash
sudo mkdir -p /usr/local/bin
sudo ln -sf \
  /Applications/Obsidian.app/Contents/MacOS/obsidian-cli \
  /usr/local/bin/obsidian
```

`which obsidian` then resolved to `/usr/local/bin/obsidian`.

When the desktop app was not running, `obsidian version` returned:

```text
The CLI is unable to find Obsidian. Please make sure Obsidian is running and try again.
```

This is an **application-runtime** condition, not a missing CLI binary. OpenClaw's dependency check only requires the executable, so it correctly moved `obsidian` into Ready.

---

## 7. Commands

The installs and fixes that actually worked, grouped by source.

### Homebrew (core + taps)

```bash
# 1Password CLI (binary: op)
brew install 1password-cli

# Apple Notes (binary: memo)
brew tap antoniorodr/memo
brew install antoniorodr/memo/memo

# Apple Reminders (binary: remindctl)
brew install steipete/tap/remindctl

# Himalaya (email)
brew install himalaya

# tmux
brew install tmux

# summarize
brew install summarize

# Google Workspace CLI (formula gogcli -> binary: gog)
brew install gogcli

# OpenHue (binary: openhue)
brew install openhue/cli/openhue-cli
```

### Homebrew — steipete/tap with targeted trust

Trust each formula individually, then install:

```bash
brew trust --formula steipete/tap/camsnap
brew trust --formula steipete/tap/gifgrep
brew trust --formula steipete/tap/codexbar
brew trust --formula steipete/tap/peekaboo
brew trust --formula steipete/tap/songsee
brew trust --formula steipete/tap/spogo

brew install steipete/tap/camsnap
brew install steipete/tap/gifgrep
brew install steipete/tap/codexbar
brew install steipete/tap/peekaboo
brew install steipete/tap/songsee
brew install steipete/tap/spogo

# Order CLI
brew trust --formula steipete/tap/ordercli
brew install steipete/tap/ordercli

# Eight Sleep
brew install steipete/tap/eightctl

# Sonos (binary: sonos)
brew install steipete/tap/sonoscli
```

### Homebrew cask

```bash
# X / Twitter CLI (binary: xurl)
brew install --cask xdevplatform/tap/xurl
```

### npm (global)

```bash
npm install -g mcporter
npm install -g @shan8851/blackbox     # OpenClaw Blackbox
npm install -g @steipete/oracle       # Oracle
```

### uv tools

```bash
uv tool install nano-pdf
```

### Go tools + LaunchAgent-visible symlinks

```bash
# BlogWatcher — correct package path is /cmd/blogwatcher
go install github.com/Hyaxia/blogwatcher/cmd/blogwatcher@latest
ln -sf "$HOME/go/bin/blogwatcher" /opt/homebrew/bin/blogwatcher

# Bear Notes (grizzly) — symlink into /opt/homebrew/bin for Gateway visibility
go install github.com/tylerwince/grizzly/cmd/grizzly@latest
ln -sf "$HOME/go/bin/grizzly" /opt/homebrew/bin/grizzly

# BluOS (blu) — symlink into /opt/homebrew/bin for Gateway visibility
go install github.com/steipete/blucli/cmd/blu@latest
ln -sf "$HOME/go/bin/blu" /opt/homebrew/bin/blu

# Things 3 — install straight into /opt/homebrew/bin via GOBIN
GOBIN=/opt/homebrew/bin go install \
  github.com/ossianhempel/things3-cli/cmd/things@latest
```

### Skills satisfied indirectly

```text
spogo      -> satisfied the spotify-player skill
codexbar   -> satisfied the model-usage skill
```

### PATH / zsh persistence

```bash
export PATH="$HOME/go/bin:$PATH"
export PATH="/usr/local/bin:$PATH"
setopt interactivecomments
echo 'setopt interactivecomments' >> ~/.zshrc
```

---

## 8. Verification

Restart the Gateway (so it re-reads PATH and re-scans dependencies) and check skills:

```bash
openclaw gateway restart
openclaw skills check
```

Verified final result:

```text
Agent: main
Total:                       102
Eligible:                    97
Visible to model:            97
Available as command:        96
Disabled:                    5
Blocked by allowlist:        0
Excluded by agent allowlist: 0
Missing requirements:        0
```

Spot-check individual binaries resolve on PATH:

```bash
which op memo remindctl himalaya tmux summarize gog openhue
which mcporter blackbox oracle nano-pdf
which blogwatcher grizzly blu things xurl obsidian
which camsnap gifgrep codexbar peekaboo songsee spogo
```

---

## 9. Final Working State

```text
OpenClaw                     2026.9.1 (build ad6fe23)
Gateway LaunchAgent          gui/501/ai.openclaw.gateway
Total skills                 102
Eligible / Ready             97
Visible to model             97
Available as command         96
Intentionally disabled       5
Blocked by allowlist         0
Excluded by agent allowlist  0
Missing requirements         0
Status                       FIXED / VERIFIED
```

### Intentionally disabled (by user choice — not broken)

```text
goplaces             requires Google Places API / billing;
                     user avoids billing-dependent integrations.
openai-whisper-api   requires OPENAI_API_KEY / cloud API; local
                     openai-whisper is already Ready, so nothing lost.
sag                  requires ElevenLabs API key / cloud service.
sherpa-onnx-tts      unused.
trello               unused.
```

### openai-whisper vs. openai-whisper-api

- `openai-whisper` is the **local** transcription skill and is **Ready**.
- `openai-whisper-api` is a **separate cloud** skill requiring `OPENAI_API_KEY`.
- The API version was intentionally disabled; no local Whisper functionality was lost.

---

## 10. Optional Cleanup

- **Homebrew `anomalyco/tap` untrusted warning.** Homebrew repeatedly showed `anomalyco/tap is not trusted`. Do **not** resolve this with `brew trust anomalyco/tap` or by disabling tap trust globally unless a future task explicitly requires something from that tap. Leave it untrusted as a security posture.
- The ClawHub lock backup (`lock.json.bak`) can be removed once the `mgc-meta-skill` removal is confirmed stable.

---

## 11. If This Happens Again

1. Do not guess. For any skill showing a missing requirement, run:

   ```bash
   openclaw skills info <skill>
   ```

   and install exactly what it declares.

2. If a binary works in Terminal but OpenClaw still reports it missing, it is a **LaunchAgent PATH** problem. Symlink the binary into `/opt/homebrew/bin`:

   ```bash
   ln -sf "$HOME/go/bin/<binary>" /opt/homebrew/bin/<binary>
   ```

   then `openclaw gateway restart`.

3. If a removed ClawHub skill keeps returning after `openclaw skills update --all`, it is still in the lock. Back up `~/.openclaw/workspace/.clawhub/lock.json`, `jq 'del(.skills["<name>"])'` it out, delete the workspace directory, then re-sync.

4. For app-bundled CLIs (e.g. Obsidian), symlink the in-bundle executable onto PATH. A runtime error like "make sure Obsidian is running" is expected when the app is closed and does **not** mean the dependency is missing.

5. Do not chase 102/102. Confirm success with:

   ```bash
   openclaw gateway restart
   openclaw skills check
   ```

   Target: `Missing requirements: 0` among intended skills.

---

## 12. Security / Secret Hygiene

- No secret values appear in this runbook. Only environment-variable **names** are referenced: `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `TRELLO_API_KEY`, `TRELLO_TOKEN`.
- The billing/cloud-dependent skills (`goplaces`, `openai-whisper-api`, `sag`, `trello`) were left disabled rather than populated with live credentials.
- Do not commit terminal dumps, `.env` files, ClawHub lock files, or generated API responses that could contain credentials.
- `anomalyco/tap` was deliberately **not** trusted; broadly trusting taps to silence warnings weakens the Homebrew trust boundary.
- Only targeted, per-formula `brew trust --formula ...` was used for known-needed `steipete/tap` formulae.

---

## 13. AI / CLI Credit

- **OpenAI ChatGPT — GPT-5.6 Sol:** troubleshooting guidance, OpenClaw skill/dependency analysis, package-source correction, LaunchAgent PATH diagnosis, security decisions, final-state design, and runbook specification.
- **Hermes Agent v0.21.0 (2026.8.31):** edited, validated, secret-scanned, committed, and pushed this runbook directly to `main`.
