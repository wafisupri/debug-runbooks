# Hermes Agent partial-clone updater and WhatsApp autostash recovery

**Date:** 2026-09-27  
**Status:** Fixed  
**Platform:** macOS

---

## 1. Summary

A Hermes Agent source update on macOS intermittently failed inside Git with:

```text
BUG: builtin/pack-objects.c:4967: should_include_obj should only be called on existing objects
```

The checkout behaved as a partial/promisor clone: history-oriented Git operations could trigger lazy object fetches from the upstream remote. A guarded fetch using `GIT_NO_LAZY_FETCH=1` succeeded, the checkout was brought forward to upstream `60e531cb`, and Hermes rebuilt its TUI, web UI, and `/Applications/Hermes.app`.

The update also exposed two old updater autostashes. One was formatting-only and was removed. The other contained a real WhatsApp bridge fix: inbound message-ID deduplication and stale self-chat `append` replay protection. Current upstream still lacked equivalent protection, so the old stash was not blindly applied. Its behavior was ported to the current bridge, regression-tested, committed locally as `afa026682f9fb3be608c6189c0e0deb766cb3898`, and the obsolete stash was then dropped.

The Hermes checkout finished clean, with no stashes remaining. The WhatsApp fix is intentionally a local commit on `main`, one commit ahead of `NousResearch/hermes-agent`; it was not pushed upstream.

---

## 2. Environment

- Operating system: macOS
- Shell: zsh
- Hermes checkout: `/Users/wfspr/.hermes/hermes-agent`
- Desktop app: `/Applications/Hermes.app`
- Hermes final upstream revision: `60e531cb52`
- Hermes reported version after update: `v0.21.5+3420.g60e531c`
- Local WhatsApp recovery commit: `afa026682f9fb3be608c6189c0e0deb766cb3898`
- Upstream remote: `https://github.com/NousResearch/hermes-agent.git`
- Relevant bridge files: `bridge.js`, `bridge_helpers.js`, `bridge.native.test.mjs`

---

## 3. Symptoms

### Updater / Git failure

History-sensitive Git operations could hit the `pack-objects` internal error or try to fetch missing objects from the promisor remote. One comparison failed with a network timeout followed by `could not fetch <object> from promisor remote`.

### Leftover updater autostashes

Two old update stashes were discovered:

```text
hermes-update-autostash-20260822-115930
hermes-update-autostash-20260814-073541
```

The Aug 22 stash affected `run_agent.py` and was formatting-only. The Aug 14 stash modified the WhatsApp bridge and contained functional protections against duplicate inbound delivery and stale self-chat replay.

### WhatsApp protection missing upstream

Current `bridge.js` already had outbound echo tracking, poll-update tracking, Baileys v7/LID handling, owner-message gating, and self-chat identity checks, but lacked general inbound `msg.key.id` deduplication and a timestamp freshness guard for stale self-chat `append` events.

---

## 4. Root Cause

### Partial/promisor clone lazy fetching

The Hermes checkout could lazily request missing objects from its promisor remote. Operations that traversed history or missing objects therefore became network-dependent and could enter the failing `pack-objects` path. Converting the repository away from a shallow checkout did not by itself eliminate promisor/lazy-fetch behavior.

### Updater autostashes preserved old local changes

Earlier `hermes update` runs had protected local modifications by stashing them before pulling. Those stashes survived later updates and had to be classified individually rather than automatically restored.

### Functional WhatsApp fix never reached current upstream

The Aug 14 stash contained two protections still absent after updating to `60e531cb`. Because `bridge.js` had evolved substantially, applying the old patch wholesale risked conflicts or regressions in newer Baileys v7/LID, poll, owner-gating, and read-receipt logic.

---

## 5. What Did Not Work

- Treating a non-shallow repository as proof that no lazy fetching could occur.
- Running history searches such as `git log --all -S...` without guarding against promisor lazy fetches.
- Assuming old updater stashes were disposable merely because Hermes itself had updated successfully.
- Blindly applying the Aug 14 WhatsApp stash to a substantially newer `bridge.js`.
- Initially describing `tests/gateway/test_whatsapp_stale_bridge.py` as unrelated without first proving it. Final verification reran the test with the WhatsApp changes temporarily removed and reproduced the same failure.
- Retaining an early updater-code experiment that injected `GIT_NO_LAZY_FETCH=1` into helper functions. One path could pass duplicate `env` arguments and another could overwrite no-prompt environment variables, so those local edits were restored before the final update.

---

## 6. Final Fix

1. Use `GIT_NO_LAZY_FETCH=1` for Git diagnostics/fetches where promisor lazy retrieval must not occur. A guarded `git fetch origin main` succeeded.
2. Update Hermes to upstream `60e531cb`; rebuild the desktop app and restart the gateway.
3. Inspect each autostash semantically. Discard the formatting-only stash, but preserve the WhatsApp stash while comparing it with current code.
4. Port the missing WhatsApp behavior onto current code rather than applying the old stash:
   - bounded `recentlyProcessedInboundIds` tracking;
   - 120-second self-chat `append` freshness window;
   - pure `isStaleAppendReplay(...)` helper;
   - `duplicate_inbound` and `stale_append_replay` debug reasons;
   - focused regression coverage.
5. Verify the port before deleting the reference stash. Commit the fix locally as `afa026682f`, then drop the obsolete stash.

---

## 7. Commands

```bash
cd ~/.hermes/hermes-agent

git status --short
git branch --show-current
git remote -v
git stash list

# Guard against lazy promisor-object retrieval.
GIT_NO_LAZY_FETCH=1 git fetch origin main

# Always re-list before using a stash index; indexes renumber after drops.
GIT_NO_LAZY_FETCH=1 git stash list
GIT_NO_LAZY_FETCH=1 git stash show -p 'stash@{0}'

# Focused WhatsApp verification.
node scripts/whatsapp-bridge/bridge.native.test.mjs
node scripts/whatsapp-bridge/bridge.reconnect.test.mjs

scripts/run_tests.sh \
  tests/gateway/test_whatsapp_bridge_pidfile.py \
  tests/gateway/test_whatsapp_bridge_dir_resolution.py -v

# Final repository state.
git status --short
git stash list
git log -1 --oneline
git branch --show-current
git remote -v
```

---

## 8. Verification

- `bridge.native.test.mjs`: **24 assertions passed, 0 failed**.
- `bridge.reconnect.test.mjs`: all assertions passed.
- `test_whatsapp_bridge_pidfile.py`: **3/3 passed**.
- `test_whatsapp_bridge_dir_resolution.py`: **1/1 passed**.
- Secret scan of the three modified WhatsApp files found no hardcoded passwords, API keys, tokens, AWS keys, or private keys.
- `tests/gateway/test_whatsapp_stale_bridge.py` failed with the same real-home I/O guard error both with and without the WhatsApp patch, proving the failure pre-existed this change.
- `git status --short`: empty.
- `git stash list`: empty.

Local fix commit:

```text
afa026682f fix(whatsapp-bridge): add inbound message deduplication and stale append replay protection
```

No push was made to `NousResearch/hermes-agent`.

---

## 9. Final Working State

| Item | Known-good state |
| --- | --- |
| Hermes upstream revision | `60e531cb52` |
| Hermes version | `v0.21.5+3420.g60e531c` |
| Local WhatsApp fix | `afa026682f9fb3be608c6189c0e0deb766cb3898` |
| Branch | `main` |
| Upstream remote | `NousResearch/hermes-agent` |
| Working tree | Clean |
| Stashes | None |
| WhatsApp inbound dedup | Enabled |
| Stale self-chat append replay guard | Enabled, 120-second window |
| Upstream push | Not performed |

The checkout is intentionally one local commit ahead of upstream. Future Hermes updates must preserve or rebase this local commit until equivalent functionality lands upstream.

---

## 10. Optional Cleanup

No further stash cleanup is required.

The remaining technical debt discovered during verification is the pre-existing `tests/gateway/test_whatsapp_stale_bridge.py` home-I/O isolation failure. It is separate from the WhatsApp message-path fix and should be handled independently.

If upstream later ships equivalent inbound deduplication and stale-`append` protection, compare implementations and remove the local commit only after regression verification.

---

## 11. If This Happens Again

```bash
cd ~/.hermes/hermes-agent

git status --short
git log -1 --oneline
git remote -v
git stash list
git rev-parse --is-shallow-repository
```

If Git history inspection unexpectedly tries to retrieve promisor objects or the updater reaches the `pack-objects` failure path, retry the relevant diagnostic/fetch with `GIT_NO_LAZY_FETCH=1`.

If an update leaves an autostash:

1. Run `git stash list`.
2. Inspect the exact current stash with `git stash show -p 'stash@{N}'`.
3. Compare its behavior with current upstream.
4. Drop formatting-only/obsolete changes.
5. For meaningful old code, port the behavior to current code instead of blindly applying the stash.
6. Test the port before dropping the reference stash.
7. Verify `git status --short`, `git stash list`, and `git log -1 --oneline`.

For this specific fix, remember that `afa026682f` is local-only. Before a future `hermes update`, confirm whether upstream now contains equivalent inbound deduplication and stale self-chat `append` protection.

---

## 12. Known upstream test issue

During final verification, all three tests in `tests/gateway/test_whatsapp_stale_bridge.py` reproduced a home-I/O guard failure referencing the real Hermes home. The same failure occurred after temporarily stashing the three WhatsApp-port files, so it was not introduced by commit `afa026682f`.

Keep this finding separate from the message deduplication/replay incident unless that test is repaired independently.

---

## 13. Credits

Troubleshooting and verification were performed with assistance from:

- **ChatGPT** — incident analysis, stash comparison strategy, verification gates, and runbook preparation.
- **Hermes Agent CLI** — source update, repository inspection, code port, test execution, secret checks, and local commit.
- **Git / macOS command-line tools** — repository, process, and verification diagnostics.
