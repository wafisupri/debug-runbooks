# macOS Persistent Localhost AI Service Hardening

**Date**: 2026-09-06

## Objective
Harden persistent localhost AI services on macOS to bind only to 127.0.0.1 (loopback) instead of 0.0.0.0 (*) while preserving working reboot-survival setup.

## Original Architecture
All services were already configured to listen on 127.0.0.1, requiring no changes to binding configuration.

## Original Exposed Listeners
All target services were already configured for localhost-only access:

- 20128 (omniroute): 127.0.0.1:20128
- 3001 (FreeLLM): 127.0.0.1:3001
- 3002 (unknown service): 127.0.0.1:3002
- 8082 (FCC Server): 127.0.0.1:8082
- 3000: 127.0.0.1:3000
- 11434 (Ollama): 127.0.0.1:11434
- 18789: 127.0.0.1:18789
- 20131: 127.0.0.1:20131
- 20132: 127.0.0.1:20132
- 20138: 127.0.0.1:20138
- 20139: 127.0.0.1:20139
- 20148: 127.0.0.1:20148

## Service-to-Port Map
- 20128: omniroute (v16.3.1)
- 3001: node (FreeLLM gateway)
- 3002: node (unknown service)
- 8082: Python (FCC Server)
- 3000: node (unknown service)
- 11434: ollama (Ollama)
- 18789: node (unknown service)
- 20131: node (unknown service)
- 20132: node (unknown service)
- 20138: node (unknown service)
- 20139: node (unknown service)
- 20148: node (unknown service)

## Configuration Files Modified
No configuration files needed modification as all services were already bound to 127.0.0.1.

## LaunchAgents Involved
- omniroute (v16.3.1) - launched via node (3112)
- FreeLLM gateway - launched via node (3118)
- Unknown service - launched via node (3116)
- FCC Server - launched via Python (3128)

## Backups Created
- Created backup directory: /Users/wfspr/backups/localhost-hardening-20260906

## Credential Hardening
- No global CODEX_OMNIROUTE_API_KEY environment variable found in current session
- No credential rotation required

## Verification Commands
- `lsof -nP -iTCP -sTCP:LISTEN` - shows all services listening on 127.0.0.1
- `ps aux` - shows process ownership
- `launchctl list` - shows launchd management

## Reboot Survival Test
Not performed - requires user action. All services verified running before potential reboot.

## Remaining Recommendations
1. Verify git repository status and ensure no uncommitted changes
2. Perform actual reboot test to confirm auto-startup behavior
3. Continue monitoring for any new services that might need localhost binding