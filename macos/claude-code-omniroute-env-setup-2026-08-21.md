# Claude Code + OmniRoute Environment Setup

**Date:** 2026-08-21
**Status:** Fixed
**Platform:** macOS

## Summary

Automated macOS shell environment setup for Claude Code to work with a local OmniRoute proxy on `http://localhost:20128`. The setup corrected a stale proxy port and made the environment configuration repeatable.

**Security correction (2026-09-02):** an earlier public revision contained a literal gateway credential. The current file intentionally omits all credential values. Any credential previously published should be rotated or revoked because Git history may retain older revisions.

## Environment

- macOS (Apple Silicon)
- zsh
- Node.js v24.18.1 via nvm
- Claude Code 2.1.224
- OmniRoute on `http://localhost:20128`
- Relevant files: `~/.zshrc`, `~/setup-claude-env.sh`, `~/.openclaude/settings.json`

## Symptoms

- Duplicate proxy-base entries in `~/.zshrc`
- One stale proxy endpoint still used port `3456`
- Gateway settings were managed manually and could drift
- The initial setup script could create duplicates
- An associative-array implementation failed under strict shell mode

## Root Cause

1. Manual environment-variable management caused drift.
2. The proxy base URL still referenced an old OmniRoute port.
3. The first script design conflicted with strict shell mode.

## Final Fix

The final setup script uses repeatable profile updates, points Claude Code at `http://localhost:20128`, keeps authentication material outside the public repository, and enables gateway model discovery.

The stale endpoint was changed from:

```text
http://127.0.0.1:3456
```

to:

```text
http://localhost:20128
```

## Commands

```bash
~/setup-claude-env.sh
claude --version
curl -sS http://127.0.0.1:20128/api/init
```

Expected initialization response:

```json
{"initialized":true}
```

For authenticated model-discovery testing, supply the credential from the local environment or secret store. Do not place literal credentials in documentation intended for publication.

## Verification

- Claude Code version check: PASS
- OmniRoute initialization endpoint: PASS
- Proxy base URL corrected to port `20128`: PASS
- Gateway model discovery enabled: PASS
- Current public file contains no literal credential: PASS

## Final Working State

| Item | Value |
|---|---|
| Proxy base URL | `http://localhost:20128` |
| Authentication material | Stored outside the repository |
| Gateway model discovery | Enabled |
| Active shell profile | `~/.zshrc` |
| Setup script | `~/setup-claude-env.sh` |
| Claude Code | `2.1.224` |

## If This Happens Again

```bash
grep -n 'ANTHROPIC_BASE_URL\|CLAUDE_CODE_ENABLE' ~/.zshrc
curl -sS http://127.0.0.1:20128/api/init
claude --version
```

If the proxy URL is stale, correct it to `http://localhost:20128`, rerun the setup script, and verify authentication locally without printing or committing its value.

## Security Note

Never commit live API keys, bearer tokens, session tokens, or gateway credentials. If a credential has appeared in public Git history, redacting the current file does not remove historical copies; rotate or revoke the exposed credential.