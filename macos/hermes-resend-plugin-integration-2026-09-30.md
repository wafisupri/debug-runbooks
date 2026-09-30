# Hermes Agent Resend Plugin Integration — Live Email Test and Documentation

**Date:** 2026-09-30  
**Status:** Completed  
**Platform:** macOS

---

## 1. Summary

The Resend email integration for Hermes Agent is fully complete and verified end-to-end. The official `resend/resend-skills` plugin is installed and enabled, exposing five Resend-related skills. A controlled live email test was performed using the Resend REST API via `curl` (no Python SDK required), and the recipient confirmed delivery. The integration does **not** require Hermes core to include the Python `resend` SDK in `pyproject.toml` — the plugin operates independently as skill content. An obsolete updater autostash that had added `"resend"` to `pyproject.toml` was safely dropped after verification.

---

## 2. Environment

- **Operating system:** macOS (27.0, Apple Silicon)
- **Shell:** zsh
- **Hermes checkout:** `/Users/wfspr/.hermes/hermes-agent`
- **Hermes branch:** `main`
- **Hermes HEAD:** `449fae030aa6b51105db3e440610c867e6b91024`
- **Hermes origin/main:** `449fae030aa6b51105db3e440610c867e6b91024`
- **Divergence:** 0 0
- **Working tree:** clean
- **Stashes:** none
- **Plugin location:** `~/.hermes/plugins/resend/`
- **Plugin status:** installed, enabled, doctor OK
- **Resend API:** `https://api.resend.com/emails`
- **Auth variable:** `RESEND_API_KEY` (confirmed present in Hermes runtime; value never read, printed, or committed)
- **Sender domain:** `onboarding@resend.dev` (Resend shared test domain — no custom domain verification needed)
- **Recipient:** `wafi.supri@gmail.com`

---

## 3. Initial Problem

The Resend integration needed to be verified as a complete, working feature — not just installed, but proven end-to-end with a real email send and confirmed delivery. Additionally, an obsolete updater autostash (`hermes-update-autostash-20260928-155405`) existed that had added `"resend"` to Hermes core `pyproject.toml`. This stash needed to be evaluated: was the core dependency actually needed, or was it an unnecessary change that should be dropped?

---

## 4. Why the Old `pyproject.toml + "resend"` Stash Existed

During a prior Hermes update, the updater stashed local changes before pulling. The stash `hermes-update-autostash-20260928-155405` contained a single change: adding `"resend"` to the `[project] dependencies` list in `pyproject.toml`. This was an early assumption that the Resend Python SDK was needed as a Hermes core dependency.

---

## 5. Why Blindly Applying the Stash Was Unsafe

The stash was created against an older version of the Hermes codebase. Applying it blindly to the current `pyproject.toml` risked:

- Merge conflicts if the dependencies section had been restructured.
- Introducing an unnecessary core dependency that would be paid for on every API call (Hermes core dependencies are loaded process-wide).
- Potentially breaking the build if the `resend` package version conflicted with other pinned dependencies.

The correct approach was to first verify whether the dependency was actually needed, then decide.

---

## 6. Plugin Discovery and Current Plugin Architecture

The Resend integration is delivered as a **skills/content-only plugin** — not a Python package or core module. The plugin lives at `~/.hermes/plugins/resend/` and is discovered by Hermes's plugin loader. It does not require any changes to Hermes core's `pyproject.toml`, `setup.py`, or any other packaging file.

The plugin was already cloned, registered, and enabled before this verification session began. No plugin installation or registration steps were needed.

---

## 7. Security Scanner Behavior Encountered During Plugin Installation

During the original plugin installation, Hermes's security scanner flagged the plugin for review. This is expected behavior for any new plugin — the scanner checks for potentially dangerous patterns (network access, file system writes, subprocess execution, etc.). The Resend plugin was reviewed and approved. No security concerns were identified.

---

## 8. Confirmation That the Plugin Was Already Cloned/Registered/Enabled

Before any changes were made, the plugin was verified as:

- **Cloned:** `~/.hermes/plugins/resend/` exists with plugin content.
- **Registered:** The plugin appears in Hermes's plugin registry.
- **Enabled:** The plugin is active and its skills are available.

No re-installation or re-registration was needed.

---

## 9. Plugin Health Verification

```bash
hermes plugin doctor
```

Result: **OK** — the plugin passes all health checks.

---

## 10. Skills Exposed by the Plugin

The `resend/resend-skills` plugin exposes the following five skills:

| Skill | Purpose |
|-------|---------|
| `resend` | Core Resend email sending skill |
| `resend-cli` | Resend CLI operations |
| `react-email` | React-based email template authoring |
| `email-best-practices` | Email deliverability and best practices |
| `agent-email-inbox` | Agent-managed email inbox operations |

---

## 11. Dependency Analysis

The Python `resend` SDK was **not installed** in the Hermes runtime environment. A direct import test confirmed:

```bash
python3 -c "import resend"  # ModuleNotFoundError: No module named 'resend'
```

This is expected and correct — the plugin does not use the Python SDK. Instead, it calls the Resend REST API directly via HTTP.

---

## 12. Why Hermes Core Does NOT Require the Python `resend` Dependency

The Resend plugin is a **skills/content-only plugin**. It provides:

- Skill definitions (SKILL.md files) that guide the agent in using the Resend REST API.
- Reference documentation and examples.
- No Python code that imports the `resend` package.

The plugin's skills instruct the agent to use `curl` or similar HTTP clients to call `https://api.resend.com/emails` directly. This is the intended architecture — the plugin is a knowledge/content layer, not a code dependency.

Adding `"resend"` to `pyproject.toml` would:

- Add an unnecessary core dependency.
- Increase the install footprint for all Hermes users, not just those using Resend.
- Violate the principle that plugins should be self-contained.

---

## 13. Safe Stash Cleanup Decision

After confirming that:

1. The plugin works without the Python SDK.
2. The plugin is skills/content-only.
3. No Hermes core code imports `resend`.

The obsolete stash `hermes-update-autostash-20260928-155405` was safely dropped:

```bash
git stash drop 'stash@{0}'
```

The stash contained only the unnecessary `pyproject.toml` change. No meaningful work was lost.

---

## 14. `RESEND_API_KEY` Handling and Security Rules

- The `RESEND_API_KEY` environment variable is present in the Hermes runtime environment.
- Its value was **never** read, printed, logged, committed, or exposed in any way.
- The key is referenced only by name in documentation.
- The key is used implicitly by `curl` via the `Authorization: Bearer $RESEND_API_KEY` header — the shell resolves the variable without displaying it.

**Security rule:** The actual API key value must never appear in documentation, logs, commit messages, or any persisted file. Only the variable name `RESEND_API_KEY` is safe to document.

---

## 15. Live Email Test Procedure

A single controlled test email was sent using the Resend REST API:

```bash
curl -s -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "onboarding@resend.dev",
    "to": "wafi.supri@gmail.com",
    "subject": "Hermes Resend Test — Live Email from This Session",
    "html": "<h2>Hermes Resend Test Email</h2>..."
  }'
```

The email body included full session provenance:
- Sender: Hermes Agent (AI assistant)
- Model: `upstage/solar-pro4:free` (provider: `nous`)
- Interface: CLI (terminal)
- Date: Wednesday, September 30, 2026 (+08, UTC+08:00)
- Session ID: `20260930_220623_4ad7b2`
- Platform: macOS (27.0)

---

## 16. Successful API Acceptance

Resend accepted the email and returned:

```json
{"id": "01a0f2ae-e2d9-76fd-8c38-c893bf77439b"}
```

The email ID `01a0f2ae-e2d9-76fd-8c38-c893bf77439b` is safe to document (it is a public identifier, not a secret).

---

## 17. Confirmed Delivery

The recipient (`wafi.supri@gmail.com`) explicitly confirmed receipt of the email. The complete verified chain:

```text
Hermes runtime → RESEND_API_KEY → Resend REST API → accepted by Resend → delivered → recipient confirmed receipt
```

---

## 18. Final Git/Repository State

### Hermes Agent repository (`/Users/wfspr/.hermes/hermes-agent`)

```text
branch:       main
HEAD:         449fae030aa6b51105db3e440610c867e6b91024
origin/main:  449fae030aa6b51105db3e440610c867e6b91024
divergence:   0 0
working tree: clean
stashes:      none
```

### WhatsApp native bridge regression suite

```text
24/24 passed
exit code 0
```

---

## 19. Future Custom-Domain Option

A verified custom sending domain is **intentionally deferred** for later. The current sender `onboarding@resend.dev` is Resend's shared test domain and works out of the box without domain verification. Configuring a custom domain (e.g., `mail.wafi-supri.workers.dev`) would require:

- Adding the domain in the Resend dashboard.
- Verifying DNS records (SPF, DKIM, DMARC).
- Updating the `from` address in send calls.

This is a future enhancement, not an unresolved fault.

---

## 20. Troubleshooting Notes

### MallocStackLogging warning on macOS

When running Python on macOS, you may see:

```text
python3(<PID>) MallocStackLogging: can't turn off malloc stack logging because it was not enabled.
```

This is **harmless diagnostic noise** from macOS/Python malloc debugging infrastructure:

- It does **not** indicate a Hermes crash.
- It does **not** prove a memory leak.
- If Hermes otherwise operates normally, it can be ignored.
- Investigate separately **only** if accompanied by actual crashes or memory problems.

### Email not arriving

If a Resend email does not arrive:

1. Check spam/junk folder (especially with `onboarding@resend.dev`).
2. Verify `RESEND_API_KEY` is set: `echo ${#RESEND_API_KEY}` (should be > 0).
3. Check the Resend dashboard for delivery status.
4. Verify the recipient address is correct.

### Plugin not appearing

If Resend skills are not available:

1. Verify plugin is enabled: `hermes plugin list`.
2. Run `hermes plugin doctor` to check health.
3. Check `~/.hermes/plugins/resend/` exists and contains skill files.

---

## 21. Security Lessons

1. **Never commit secrets.** The `RESEND_API_KEY` value must never appear in any file, log, or commit. Only the variable name is safe.
2. **Verify before applying stashes.** An updater autostash may contain outdated or unnecessary changes. Always inspect and verify before applying.
3. **Plugins are self-contained.** A skills/content-only plugin should not require core dependency changes. If a plugin seems to need a core dependency, verify whether it's truly necessary.
4. **Use the REST API when possible.** For simple integrations, `curl` to a REST API is often simpler and more transparent than installing an SDK.
5. **Document the email ID, not the key.** Resend email IDs are safe to document; API keys are not.

---

## 22. Future Upgrade/Update Checklist

When updating Hermes or the Resend plugin:

- [ ] Verify `RESEND_API_KEY` is still present in the environment.
- [ ] Run `hermes plugin doctor` to confirm plugin health.
- [ ] Check that all five Resend skills are still exposed.
- [ ] Send a test email to confirm end-to-end functionality.
- [ ] Verify `git status --short` is clean in the Hermes checkout.
- [ ] Check `git stash list` for any new updater autostashes.
- [ ] Review any new stashes before applying or dropping them.
- [ ] Confirm no changes to `pyproject.toml` are needed (they should not be).

---

## Known-Good Final State

| Item | Known-good value |
|------|------------------|
| Resend plugin installed | YES |
| Resend plugin enabled | YES |
| Plugin doctor | OK |
| Skills exposed | 5 (resend, resend-cli, react-email, email-best-practices, agent-email-inbox) |
| Hermes core needs Python `resend` | NO |
| `RESEND_API_KEY` exposed | NO |
| Live test accepted by Resend | YES |
| Live test delivered | YES |
| Recipient confirmed receipt | YES |
| Custom sending domain configured | NO — intentionally deferred |
| Hermes branch | `main` |
| Hermes HEAD | `449fae030aa6b51105db3e440610c867e6b91024` |
| Divergence | 0 0 |
| Working tree | Clean |
| Stashes | None |
| WhatsApp regression suite | 24/24 passed |

---

## Credits

- **Resend integration verification:** Hermes Agent CLI
- **Live email test:** Hermes Agent CLI (curl to Resend REST API)
- **Documentation:** Hermes Agent runbook authoring
- **Plugin architecture:** `resend/resend-skills` (official Resend plugin)

---

*Runbook created 2026-09-30 from the verified Resend integration session. Repository: `https://github.com/wfspr/debug-runbooks.git`, branch `main`.*
