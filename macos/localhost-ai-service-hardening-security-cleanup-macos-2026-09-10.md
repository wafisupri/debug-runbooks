# macOS Localhost AI-Service Hardening and Security Cleanup

**Date:** 2026-09-10 (completed incident date)

**Status:** Completed; credential rotation and one launchd inheritance check remain follow-up work

**Platform:** macOS

## 1. Summary

A completed hardening pass reduced the network exposure of locally hosted AI services by binding the identified FreeLLM, FCC, and OmniRoute listeners to `127.0.0.1`. Persistent startup ownership was recorded so the loopback-only state can be checked after a reboot without changing services.

The same incident moved OpenClaw provider SecretRefs for OpenRouter, OpenAI, Google, Groq, BAI, and OmniRoute from environment-backed references to shared-store references. A plaintext OpenRouter manual authentication profile was removed, the final OpenClaw secret audit was clean, and a store-only OpenRouter runtime test succeeded.

One credential-hygiene item is deliberately still open: the historical `CODEX_OMNIROUTE_API_KEY` was inherited through the user launchd environment and had previously appeared in terminal output. Its value must never be printed or retrieved. User rotation remains required, and global launchd inheritance remediation remains pending unless a future read-only check proves it was already completed.

## 2. Evidence and scope

### Verified incident facts supplied for this runbook

The following facts are the verified record of the already-completed incident. They were supplied to this documentation task; this session did **not** probe live services, service configuration, credentials, provider configuration, LaunchAgents, or source code.

- FreeLLM on port `3001` was changed to bind to `127.0.0.1`.
- The custom FreeLLM gateway on port `3002` was changed to bind to `127.0.0.1`.
- FCC on port `8082` was changed to bind to `127.0.0.1`.
- OmniRoute on port `20128` was changed to bind to `127.0.0.1`.
- Persistent startup ownership labels were:
  - `ai.freellm.gateway-3002` for port `3002`
  - `ai.fcc.server`
  - `ai.freellm.gateway`
  - `ai.omniroute.gateway`
  - `ai.groq-kimi.compat`
  - `ai.openclaw.gateway`
- Ollama remained app-managed.
- Ports known to survive reboot were `3000`, `3001`, `3002`, `8082`, `11434`, `18789`, `20128`, `20131`, `20132`, `20138`, `20139`, and `20148`.
- OpenClaw SecretRefs for OpenRouter, OpenAI, Google, Groq, BAI, and OmniRoute were moved from environment references to shared-store references.
- The `openrouter:manual` plaintext authentication profile was removed.
- The final OpenClaw audit reported `plaintext=0`, `unresolved=0`, `shadowed=0`, `storeResidue=0`, and `legacy=0`.
- An OpenRouter store-only runtime test succeeded.
- The historical `CODEX_OMNIROUTE_API_KEY` had been inherited by the user launchd environment. Its value was previously exposed in terminal output, so user rotation remains required. Global launchd inheritance remediation remains pending unless read-only verification proves otherwise.

No additional live-state claim should be inferred from this documentation session. In particular, the list of reboot-survival ports records persistence, not a claim that every listed listener was independently confirmed loopback-only during this incident.

## 3. Environment and persistent ownership

| Service | Port | Verified incident result | Persistent startup owner |
| --- | ---: | --- | --- |
| FreeLLM | `3001` | Bound to `127.0.0.1` | `ai.freellm.gateway` |
| Custom FreeLLM gateway | `3002` | Bound to `127.0.0.1` | `ai.freellm.gateway-3002` now owns persistence for this port |
| FCC | `8082` | Bound to `127.0.0.1` | `ai.fcc.server` |
| OmniRoute | `20128` | Bound to `127.0.0.1` | `ai.omniroute.gateway` |
| Groq/Kimi compatibility service | Not separately identified in the supplied facts | No listener-address claim was supplied | `ai.groq-kimi.compat` |
| OpenClaw | Not separately identified in the supplied facts | No listener-address claim was supplied | `ai.openclaw.gateway` |
| Ollama | Not separately identified in the supplied facts | Remained app-managed | App-managed; no persistent ownership label was supplied |

The service-to-owner associations above were supplied as verified incident facts. Do not infer additional port mappings from the reboot-survival inventory.

The known reboot-survival port set was:

```text
3000 3001 3002 8082 11434 18789 20128 20131 20132 20138 20139 20148
```

Treat that list as a post-reboot verification inventory. A listener's presence proves persistence, not safe interface binding or correct ownership.

## 4. Security problem

Local AI gateways are often intended only for clients on the same Mac. A wildcard bind such as `0.0.0.0` can make a service reachable through every active network interface, subject to firewall and network policy. Binding an intended localhost service to `127.0.0.1` narrows that exposure to IPv4 loopback clients.

Credential storage was a separate risk surface. Environment-backed provider references and an extra plaintext manual authentication profile created more opportunities for credential inheritance, precedence conflicts, and residue. The completed OpenClaw cleanup consolidated the named provider credentials in the shared secret store, removed the plaintext OpenRouter profile, and verified both a zero-finding audit and a store-only runtime path.

## 5. Root causes and durability risks

### Listener binding and startup persistence

The supplied facts establish the completed loopback outcomes, but do not establish the prior bind mechanism for every service. Because the listed ports are known to survive reboot, a future check must verify the listener address after startup rather than assuming a one-off loopback result remains durable.

### Custom FreeLLM source-level bind is technical debt

The custom FreeLLM implementation at:

```text
/Users/wfspr/GitHub/freellm_custom/apps/gateway/src/server.ts
```

had previously been changed from a wildcard bind to `127.0.0.1`, and:

```text
apps/gateway/dist/index.mjs
```

was rebuilt. This fix was not upstream-driven or configuration-driven. Reinstalling, recloning, or replacing that checkout may restore a `0.0.0.0` bind, so port `3002` must be rechecked after any such lifecycle event.

The preferred durable correction is an upstream/configurable `HOST` or bind setting with a loopback-safe default. Do not make another source edit as part of this runbook.

### Historical launchd environment exposure

`CODEX_OMNIROUTE_API_KEY` historically existed in the user launchd environment and was previously exposed in terminal output. Removing inheritance later would not invalidate a value that had already been disclosed. Rotation is therefore still required even if a future read-only check finds that the global launchd binding is absent.

Never retrieve or print the value while verifying this condition. Global launchd inheritance remediation remains an explicit pending item unless read-only verification establishes that it was already completed.

## 6. Completed remediation

1. FreeLLM `:3001`, custom FreeLLM `:3002`, FCC `:8082`, and OmniRoute `:20128` were constrained to `127.0.0.1`.
2. Persistent startup ownership was recorded as `ai.freellm.gateway-3002` for custom FreeLLM on port `3002`, `ai.freellm.gateway` for FreeLLM, `ai.fcc.server` for FCC, `ai.omniroute.gateway` for OmniRoute, `ai.groq-kimi.compat` for Groq/Kimi compatibility, and `ai.openclaw.gateway` for OpenClaw; Ollama remained app-managed.
3. The known reboot-survival port inventory was recorded for future checks.
4. OpenClaw provider SecretRefs for OpenRouter, OpenAI, Google, Groq, BAI, and OmniRoute were moved from env refs to shared-store refs.
5. The plaintext `openrouter:manual` authentication profile was removed.
6. The final secret audit reached all-zero findings:

   ```text
   plaintext=0 unresolved=0 shadowed=0 storeResidue=0 legacy=0
   ```

7. A store-only OpenRouter runtime test succeeded, showing that the provider worked after removal of the plaintext manual profile.

## 7. Safe read-only verification

Use these checks only to observe state. They do not alter services, LaunchAgents, credentials, provider configuration, or source files. Run them after reboot and after reinstalling or replacing a relevant application or checkout.

### Check listeners without contacting them

```bash
/usr/sbin/lsof -nP -iTCP -sTCP:LISTEN
```

Review the output for the known port inventory. For services intended to remain local, confirm the listener address is loopback (`127.0.0.1`, or an intentionally supported IPv6 loopback address) rather than `*`, `0.0.0.0`, or a LAN address. Pay particular attention to ports `3001`, `3002`, `8082`, and `20128`.

A process name alone is not authoritative ownership evidence. Correlate its PID with the executable name while avoiding argument and environment views that could contain credentials:

```bash
/bin/ps -p PID -o pid=,ppid=,user=,comm=
```

Substitute a PID observed in the listener listing. Do not request `command=`/full arguments, use `ps e` or `ps -E`, run `/usr/bin/env`, dump process environments, or enable diagnostic modes that display environment values.

### Check persistent ownership labels

List user-domain jobs without dumping job definitions or environments:

```bash
/bin/launchctl list
```

Confirm the expected labels are present where applicable:

```text
ai.freellm.gateway-3002
ai.fcc.server
ai.freellm.gateway
ai.omniroute.gateway
ai.groq-kimi.compat
ai.openclaw.gateway
```

`launchctl list` presence alone does not prove which interface a process uses; pair it with the listener check. Ollama is app-managed, so do not infer a missing LaunchAgent label is a fault.

### Check OpenClaw without exposing credentials

Use OpenClaw's audit and status interfaces only if their installed help confirms they redact secrets. The expected completed-incident audit result is:

```text
plaintext=0 unresolved=0 shadowed=0 storeResidue=0 legacy=0
```

Do not inspect raw store contents, authentication database rows, exported environment values, or verbose diagnostics that may reveal credentials. A clean audit establishes the audited categories only; retain the successful store-only OpenRouter runtime test as the incident's functional evidence.

### Check only whether the historical launchd name is defined

If a future operator has a proven read-only, redacted method that reports **presence only**, use it to determine whether the user launchd environment still defines `CODEX_OMNIROUTE_API_KEY`. Do not run a command that returns its value, do not capture it in command substitution, and do not place it in logs.

If no such safely redacted method is available, leave remediation status as **unknown/pending**. Absence, if safely proven, closes only the inheritance-remediation check; it does not remove the rotation requirement caused by the earlier disclosure.

## 8. Expected final working state

- FreeLLM on `3001` listens on `127.0.0.1`.
- The custom FreeLLM gateway on `3002` listens on `127.0.0.1`.
- FCC on `8082` listens on `127.0.0.1`.
- OmniRoute on `20128` listens on `127.0.0.1`.
- The supplied service-to-owner associations remain in effect: custom FreeLLM `ai.freellm.gateway-3002`, FreeLLM `ai.freellm.gateway`, FCC `ai.fcc.server`, OmniRoute `ai.omniroute.gateway`, Groq/Kimi compatibility `ai.groq-kimi.compat`, and OpenClaw `ai.openclaw.gateway`; Ollama remains app-managed.
- The reboot-survival port inventory is checked after startup without assuming persistence equals secure binding.
- The six named OpenClaw provider credentials resolve through shared-store SecretRefs.
- No `openrouter:manual` plaintext authentication profile remains.
- The OpenClaw audit remains at zero for plaintext, unresolved refs, shadowing, store residue, and legacy residue.
- OpenRouter continues to work through the store-only path.
- Rotation of the historically exposed OmniRoute-related credential remains required.
- Global user-launchd inheritance remediation remains pending unless read-only, value-safe evidence proves completion.

## 9. If this happens again

1. Inventory listeners with `lsof` and compare only against the known ports and expected loopback addresses.
2. Correlate persistent ownership through label listings without dumping LaunchAgent contents or process environments.
3. If port `3002` reverted after a reinstall, re-clone, or replacement, treat the custom source patch as lost technical debt; pursue a configurable `HOST`/bind solution rather than editing source under this runbook.
4. Run a redaction-safe OpenClaw secret audit and compare the categories with the all-zero baseline.
5. Verify provider functionality through the intended store-only route without creating a plaintext fallback profile.
6. Never print or retrieve `CODEX_OMNIROUTE_API_KEY`. Rotate it through an approved secret-entry workflow, then separately establish whether global launchd inheritance has been remediated using presence-only evidence.

## 10. Remaining recommendations

1. **Rotate the historically exposed credential.** User rotation of `CODEX_OMNIROUTE_API_KEY` remains mandatory because it previously appeared in terminal output.
2. **Close the launchd inheritance finding safely.** Keep global user-launchd inheritance remediation pending until a read-only, presence-only check proves the name is absent; never retrieve its value.
3. **Replace the custom bind patch with configuration.** Add or adopt an upstream-supported `HOST`/bind option for the custom FreeLLM gateway, defaulting to loopback where appropriate.
4. **Reverify after lifecycle events.** Check port `3002` after reinstall, re-clone, replacement, or rebuild, and check the complete known port inventory after reboot.
5. **Preserve credential-layer evidence.** Keep both a clean OpenClaw audit and a functional store-only provider test; neither alone proves the other.

## 11. Credits

- **AI Agent:** OpenClaw
- **CLI/Environment:** OpenClaw on macOS
- **Earlier investigation/planning assistance:** ChatGPT
