# Fix: Agent Amnesia Across the CLI Fleet (Local Memory MCP Servers)

**Date:** 2026-08-23  

**Status:** Fixed — configured on Windows & macOS  

**Platform:** Cross-platform (Windows + macOS)

---

## 1. Summary

**Problem:** Every coding CLI in daily use (`opencode`, `claude`, `openclaude`, `pi`, Kimi Code, Antigravity, GitHub Copilot CLI) starts each session with zero memory. Project context, decisions, and preferences must be re-explained every time, separately in every CLI.

**Fix:** One shared set of three fully-local, free memory MCP servers, registered into every MCP-capable CLI on both machines:

| Server | What it is | Storage |
|---|---|---|
| `basic-memory` | Markdown notes + knowledge graph | `~/basic-memory` |
| `memory-service` | SQLite-vec + semantic vector search (ONNX embeddings, offline) | local SQLite DB |
| `graph-memory` | Official JSONL knowledge-graph reference server | `~/ai-memory/memory.jsonl` |

Rejected alternatives: Ditto (`@heyditto/mcp`) — cloud-hosted, pay-as-you-go credits after 30 free messages; mem0 standalone MCP — repo archived, cloud-first now.

---

## 2. Environment

- Operating systems: Windows 11 (PC) + macOS (Mac)
- Shell: PowerShell 7+ (Windows) / zsh (macOS)
- Runtimes: Node.js (`npx`), Python via `uv`/`uvx`
- Relevant paths (home-relative, identical layout on both OSes):
  - Tool executables: `~/.local/bin/basic-memory.exe|.app` etc. via `uv tool` bin dir
  - opencode config: `~/.config/opencode/opencode.json`
  - Claude Code config: `~/.claude.json`
  - OpenClaude config: `~/.openclaude.json`
  - pi global MCP config: `~/.pi/agent/mcp.json` (via extension)
  - Copilot CLI config: `~/.copilot/mcp-config.json`

### Fleet status matrix

| CLI | Launch command | MCP support | Status (this PC) | Registration method |
|---|---|---|---|---|
| opencode | `opencode` | native | ✅ configured | `"mcp"` block in `opencode.json` |
| claude (Claude Code) | `claude` | native | ✅ configured | `claude mcp add <name> --scope user -- <cmd>` |
| openclaude | `openclaude` | native (Claude-Code-shaped) | ✅ configured | `openclaude mcp add ...`; note: its arg parser mishandles `-y` passthrough — edit `~/.openclaude.json` directly for npx servers |
| Antigravity | `agy` | native (`agy mcp`) | ✅ configured | `agy mcp add [-e K=V] <name> <cmd> [args]` — flags BEFORE name; `--` before command if args contain leading-dash flags |
| Kimi Code | `kimi` | native (`mcp.json`, no subcommand) | ✅ configured | write `~/.kimi-code/mcp.json`; validate with `kimi doctor`; `/mcp` inside TUI shows status |
| pi | `pi` | **extension only** ("No MCP" by design) | ✅ configured | `pi install npm:pi-mcp-extension` + `~/.pi/agent/mcp.json` |
| GitHub Copilot CLI | `ghcl` → winget `copilot.exe` | native | ✅ configured | `copilot mcp add [--env K=V] <name> -- <cmd> [args]` → writes `~/.copilot/mcp-config.json` |

> **ghcl note (2026-08-23):** `ghcl` is the user's alias for the GitHub Copilot CLI. The binary is a winget **user-scope** install at `%LOCALAPPDATA%\Microsoft\WinGet\Packages\GitHub.Copilot_Microsoft.Winget.Source_8wekyb3d8bbwe\copilot.exe` (v1.0.80) and is NOT on non-interactive/CI PATH — resolve it via `Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter copilot.exe` when scripting against it.

---

## 3. Symptoms

```text
</> any CLI

New session: agent knows nothing about prior decisions.
Same context re-explained N times for N CLIs.
Cloud memory services meter usage or store data off-device.
```

---

## 4. Root Cause

- Session transcripts are ephemeral and per-CLI; nothing persists by default.
- No common memory layer existed across the fleet → each tool re-amnesia independently.
- Cloud memory products conflict with the free/local requirement.

---

## 5. What Did Not Work

- `pip install mcp-memory-service` — no `pip` on this machine; use `uv tool install`.
- `npx` directly as a stdio command **on Windows** in any client — fails to spawn (`.ps1`/`.cmd` shim); must wrap as `cmd /c npx ...`. On macOS plain `npx` works.
- `openclaude mcp add graph-memory ... -- cmd /c npx -y @modelcontextprotocol/server-memory` → `error: unknown option '-y'` — openclaude's parser steals flags meant for the wrapped command. Workaround: hand-edit `~/.openclaude.json`.
- Expecting instant memory-service startup — first run downloads the ONNX embedding model.
- Running all three servers enabled simultaneously during focused A/B tests — 30+ tools bloats context and skews comparisons. Enable one at a time when benchmarking recall quality.

---

## 6. Final Fix

Install the two Python servers once per machine via `uv`, pin the JSONL path, then register all three into each CLI with **identical names everywhere** (`basic-memory`, `memory-service`, `graph-memory`) so switching CLIs requires zero muscle-memory change.

Per-CLI registration differs (see matrix), but server names, storage paths, and data formats do not.

---

## 7. Commands

### Both OSes — install memory servers

```
</> shell

uv tool install basic-memory
uv tool install mcp-memory-service
mkdir ~/ai-memory   # Windows: New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\ai-memory"
```

### Windows — register into each CLI

```
</> PowerShell

# Claude Code
claude mcp add basic-memory --scope user -- basic-memory mcp
claude mcp add memory-service --scope user -- memory server
claude mcp add graph-memory --scope user -e "MEMORY_FILE_PATH=C:\Users\1\ai-memory\memory.jsonl" -- cmd /c npx -y @modelcontextprotocol/server-memory

# OpenClaude (two entries via CLI, graph-memory via direct JSON edit due to -y parsing bug)
openclaude mcp add basic-memory --scope user -- basic-memory mcp
openclaude mcp add memory-service --scope user -- memory server
# then merge into ~/.openclaude.json "mcpServers":
"graph-memory": {
  "type": "stdio",
  "command": "cmd",
  "args": ["/c", "npx", "-y", "@modelcontextprotocol/server-memory"],
  "env": { "MEMORY_FILE_PATH": "C:\\Users\\1\\ai-memory\\memory.jsonl" }
}

# opencode — merge into ~/.config/opencode/opencode.json:
{
  "mcp": {
    "basic-memory":   { "type": "local", "command": ["basic-memory", "mcp"], "enabled": true },
    "memory-service": { "type": "local", "command": ["memory", "server"], "enabled": true },
    "graph-memory":   { "type": "local",
                        "command": ["cmd", "/c", "npx", "-y", "@modelcontextprotocol/server-memory"],
                        "environment": { "MEMORY_FILE_PATH": "C:\\Users\\1\\ai-memory\\memory.jsonl" },
                        "enabled": true }
  }
}
```

### macOS — same registrations, no cmd wrapper

```
</> zsh

claude mcp add basic-memory --scope user -- basic-memory mcp
claude mcp add memory-service --scope user -- memory server
claude mcp add graph-memory --scope user -e "MEMORY_FILE_PATH=$HOME/ai-memory/memory.jsonl" -- npx -y @modelcontextprotocol/server-memory

# opencode block identical except command arrays:
["npx", "-y", "@modelcontextprotocol/server-memory"]

# Copilot CLI (either OS):
copilot mcp add basic-memory -- basic-memory mcp
copilot mcp add memory-service -- memory server

# pi (either OS):
pi install npm:pi-mcp-extension
# then ~/.pi/agent/mcp.json:
{
  "settings": { "toolPrefix": "mcp" },
  "mcpServers": {
    "basic-memory":   { "command": "basic-memory", "args": ["mcp"],    "transport": "stdio", "lifecycle": "eager" },
    "memory-service": { "command": "memory",       "args": ["server"], "transport": "stdio", "lifecycle": "eager" },
    "graph-memory":   { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-memory"],
                        "transport": "stdio", "lifecycle": "lazy",
                        "env": { "MEMORY_FILE_PATH": "~/ai-memory/memory.jsonl" } }
  }
}

### Windows-only — Antigravity CLI (`agy`) and Kimi Code (`kimi`)

```
</> PowerShell

# Antigravity — native MCP management; flags BEFORE name, -- before dash-args
agy mcp add basic-memory basic-memory mcp
agy mcp add memory-service memory server
agy mcp add -e "MEMORY_FILE_PATH=C:\Users\1\ai-memory\memory.jsonl" graph-memory -- cmd /c npx -y @modelcontextprotocol/server-memory
agy mcp list

# Kimi Code — no subcommand; write %USERPROFILE%\.kimi-code\mcp.json (Claude-style schema):
{
  "mcpServers": {
    "basic-memory":   { "command": "basic-memory", "args": ["mcp"] },
    "memory-service": { "command": "memory", "args": ["server"] },
    "graph-memory":   { "command": "cmd",
                        "args": ["/c", "npx", "-y", "@modelcontextprotocol/server-memory"],
                        "env": { "MEMORY_FILE_PATH": "C:\\Users\\1\\ai-memory\\memory.jsonl" } }
  }
}
kimi doctor        # validates config.toml/tui.toml
# inside kimi TUI: /mcp shows connection status, /mcp-config edits servers interactively
```

---

## 8. Verification

```
</> shell

# Versions resolve
basic-memory --version   # Basic Memory version: 0.22.1
memory --version         # MCP Memory Service, version 11.8.2

# Per-client health checks
claude mcp list
openclaude mcp list      # inside copilot: /mcp ; inside pi: /mcp
Get-Content ~/.config/opencode/opencode.json -Raw | ConvertFrom-Json   # Windows JSON validity
```

Expected result:

```text
basic-memory: basic-memory mcp - ✔ Connected
memory-service: memory server - ✔ Connected
graph-memory: cmd /c npx -y @modelcontextprotocol/server-memory - ✔ Connected
```

Functional test (repeat per CLI):

1. Session A: "Remember: my deploy key lives in vault X."
2. Fresh session: "Where's my deploy key?" — correct answer = persistence works.

---

## 9. Final Working State

This PC (Windows), as of 2026-08-23:

- `basic-memory` 0.22.1 and `mcp-memory-service` 11.8.2 installed via uv in `C:\Users\1\.local\bin`
- Claude Code: 3/3 Connected (`C:\Users\1\.claude.json`, user scope)
- OpenClaude: 3/3 Connected (`C:\Users\1\.openclaude.json`)
- opencode: 3 servers enabled in `C:\Users\1\.config\opencode\opencode.json`
- Antigravity CLI: 3/3 registered + enabled (`agy mcp list`)
- Kimi Code: `C:\Users\1\.kimi-code\mcp.json` written; verify inside TUI with `/mcp`
- pi: `npm:pi-mcp-extension` installed (`pi list`) + `C:\Users\1\.pi\agent\mcp.json`; verify with `/mcp` inside a pi session
- GitHub Copilot CLI (`ghcl`): 3/3 added at user scope (`copilot mcp list`) → `%USERPROFILE%\.copilot\mcp-config.json`
- Storage: `C:\Users\1\basic-memory` (markdown), memory-service SQLite DB, `C:\Users\1\ai-memory\memory.jsonl`
- All transports stdio — no ports, no auth
- Mac: apply Section 7 macOS commands; no cmd-wrapper needed

---

## 10. Optional Cleanup

- Remove from a client: `claude|openclaude mcp remove <name> --scope user`; delete entry from opencode/pi/copilot configs.
- Uninstall a server: `uv tool uninstall basic-memory|mcp-memory-service`.
- Wipe stored memories: delete `~/basic-memory`, `~/ai-memory`, or the memory-service DB dir.
- Silence basic-memory promo telemetry: `BASIC_MEMORY_NO_PROMOS=1`.

---

## 11. If This Happens Again

Shortest diagnostics:

```
</> shell

<cli> mcp list                          # which client fails?
basic-memory --version; memory --version  # binaries still resolve?
# Windows only: does every npx-based entry use the cmd /c wrapper?
# Config still valid JSON? ConvertFrom-Json / jq .
```

Recovery:

1. Connects in one client but not another → client config issue; check that client's syntax (Section 7) and the Windows npx wrapper rule.
2. Fails everywhere → run binary bare (`basic-memory mcp`) to read stderr; `uv tool install <pkg> --force` if broken.
3. memory-service suddenly slow → embedding model re-downloading; wait once.
4. Context bloat / confused agent → keep one memory server enabled at a time while evaluating.
5. After installing a new fleet CLI (Kimi Code, Antigravity, Copilot) → repeat Section 7 registrations for it before first use.
