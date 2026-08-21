# Claude Code Permissions Setup (Global)

**Date:** 2026-08-22

**Status:** Fixed

**Platform:** macOS

---

## 1. Summary

Configured global Claude Code permissions in `~/.openclaude/settings.json` to allow common development commands without prompting. Added allow rules for npm, git, all bash commands, and file operations (Read/Edit/Write/Glob/Grep).

---

## 2. Environment

- **Operating system:** macOS (Apple Silicon, Darwin 25.6.0)
- **Hardware:** MacBook (Silver MBN / MacBook Neo)
- **Shell:** zsh (with Powerlevel10k)
- **Application/tool:** OpenClaude CLI
- **Relevant paths:**
  - `~/.openclaude/settings.json` — global Claude Code config
- **AI agent used:** OpenClaude (auto/best-free model)

---

## 3. Symptoms

- Every npm, git, and bash command required permission prompts
- File operations (Read/Edit/Write/Glob/Grep) required permission prompts
- This slowed down development workflows significantly

---

## 4. Root Cause

Default OpenClaude permissions require explicit approval for each tool use. No global allow rules were configured.

---

## 5. What Did Not Work

- Trying to use `--dangerously-skip-permissions` flag (not preferred for security)
- Adding permissions per-project instead of globally

---

## 6. Final Fix

### Updated `~/.openclaude/settings.json`

Added a `permissions.allow` array with the following rules:

```json
"permissions": {
  "allow": [
    "Bash(npm:*)",
    "Bash(git:*)",
    "Bash",
    "Read",
    "Edit",
    "Write",
    "Glob",
    "Grep"
  ]
}
```

### Explanation of rules

| Rule | Purpose |
|------|---------|
| `Bash(npm:*)` | Allows all npm commands without prompting |
| `Bash(git:*)` | Allows all git commands without prompting |
| `Bash` | Allows any shell command without prompting |
| `Read` | Allows file reading without prompting |
| `Edit` | Allows file editing without prompting |
| `Write` | Allows file writing without prompting |
| `Glob` | Allows file pattern matching without prompting |
| `Grep` | Allows content searching without prompting |

---

## 7. Commands

### View current permissions

```bash
cat ~/.openclaude/settings.json
```

### Test permissions work

```bash
# Should not prompt
npm --version
git status
ls -la
```

---

## 8. Verification

```bash
cat ~/.openclaude/settings.json
```

**Expected result:**
```json
{
  "env": {},
  "model": "auto/best-free",
  "effortLevel": "high",
  "permissions": {
    "allow": [
      "Bash(npm:*)",
      "Bash(git:*)",
      "Bash",
      "Read",
      "Edit",
      "Write",
      "Glob",
      "Grep"
    ]
  }
}
```

```bash
npm --version
```

**Expected result:** Returns version without permission prompt.

```bash
git status
```

**Expected result:** Returns git status without permission prompt.

---

## 9. Final Working State

| Setting | Value |
|---------|-------|
| Config file | `~/.openclaude/settings.json` |
| Permissions scope | Global (all projects) |
| Allow rules | 8 rules covering npm, git, bash, file ops |
| Model | `auto/best-free` |
| Effort level | `high` |

---

## 10. Optional Cleanup

None needed. The permissions are intentionally broad for a personal development machine.

---

## 11. If This Happens Again

### Minimal diagnostics

```bash
cat ~/.openclaude/settings.json | jq '.permissions'
```

### Shortest recovery

```bash
# Re-add permissions if lost
cat > ~/.openclaude/settings.json << 'EOF'
{
  "env": {},
  "model": "auto/best-free",
  "effortLevel": "high",
  "permissions": {
    "allow": [
      "Bash(npm:*)",
      "Bash(git:*)",
      "Bash",
      "Read",
      "Edit",
      "Write",
      "Glob",
      "Grep"
    ]
  }
}
EOF
```

### Security note

These permissions are appropriate for a personal development machine. For shared or production environments, use more restrictive rules (e.g., specific commands only, or project-scoped settings in `.openclaude/settings.json`).