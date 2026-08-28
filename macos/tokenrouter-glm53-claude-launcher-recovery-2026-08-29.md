# TokenRouter GLM 5.3 Free + Claude/OpenClaude Launcher Recovery
---

### Summary
---
Recovery of multiple AI CLI launchers and migration to a new free model via TokenRouter after promotional model expiry of previous free models. Includes repair of Zsh completion warnings and secure restoration of disappeared Claude Code launchers.

### Environment
---
- OS: macOS (Apple Silicon)
- Shell: zsh
- CLI Tools: Claude Code, OpenClaude, OpenCode, Kimi Code
- Gateways: TokenRouter, 9Router, OmniRoute
- Key Files: `~/.zshrc`, `~/.openclaude.json`, `/Users/wfspr/.local/bin/`

### Symptoms
---
1. **Model Failure**: `qwen/qwen3.8-max-free` stopped being free on TokenRouter.
2. **Missing Launchers**: `claude-freefirst` and `claude-openrouter` disappeared from the shell.
3. **OpenClaude UI**: New TokenRouter models did not appear in the `/model` picker despite being added to `~/.openclaude.json`.
4. **Shell Warnings**: Sourcing `~/.zshrc` emitted `compdef:153: _comps: assignment to invalid subscript range`.

### Root Cause
---
1. **TokenRouter**: Promotional free-tier for Qwen 3.8 Max expired.
2. **Launchers**: Launchers were accidentally disabled/renamed to `.disabled-*` files.
3. **OpenClaude**: The `openclaude` shell wrapper hard-coded environment variables for 9Router, overriding the provider profiles in `~/.openclaude.json`.
4. **Zsh Warning**: `_comps` was being treated as an indexed array instead of an associative array during re-sourcing, likely due to a type collision in the completion initialization sequence.

### What Did Not Work
---
1. **OpenClaude Profile Update**: Adding the TokenRouter profile to `~/.openclaude.json` alone was insufficient because the shell wrapper forced 9Router.
2. **Wholesale `.zshrc` Restore**: Rejected to avoid deleting newer, working launcher functions.
3. **Keychain Assumptions**: Assumed `claude-openrouter` would find its key in the macOS Keychain, but the item was missing.
4. **Speculative Cache Cleaning**: Attempted to find the source of `~anthropic/claude-sonnet-latest` warnings; decided against mutating cache without a proven persistent source.

### Final Fix
---
1. **Model Migration**: Migrated all TokenRouter-dependent tools to `z-ai/glm-5.3-free`.
2. **Launcher Restoration**: 
   - Restored `claude-freefirst` and its bridge from `.disabled-*` backups.
   - Restored `claude-openrouter` and repaired its credential lookup to use `~/.config/omniroute-keys/openrouter-rotation-new.key` instead of the missing Keychain item.
3. **OpenClaude Expansion**: Created a new dedicated launcher `openclaude-tokenrouter` to bypass the 9Router hard-coding in the main `openclaude` function.
4. **Zsh Repair**: Added explicit `compinit` initialization to `~/.zshrc` to ensure `_comps` is correctly typed as an associative array.

### Commands
---

#### TokenRouter Model Update (Logic)
Update provider config to use `z-ai/glm-5.3-free` at `https://api.tokenrouter.com/v1`.

#### Launcher Restoration
```zsh
# Restore claude-freefirst
cp ~/.local/bin/claude-freefirst.disabled-2dd-20260828-160803 ~/.local/bin/claude-freefirst
# Restore claude-openrouter (after credential repair)
cp ~/.local/bin/claude-openrouter.disabled-2de-20260828-170343 ~/.local/bin/claude-openrouter
```

#### OpenClaude TokenRouter Launcher
Added to `~/.zshrc`:
```zsh
openclaude-tokenrouter() {
  # ... retrieves key from ~/.openclaude.json ...
  CLAUDE_CODE_USE_OPENAI=1 \
  OPENAI_BASE_URL="https://api.tokenrouter.com/v1" \
  OPENAI_API_FORMAT="chat_completions" \
  OPENAI_API_KEY="$tr_key" \
  OPENAI_MODEL="z-ai/glm-5.3-free" \
  command openclaude "$@"
}
```

#### Zsh Completion Fix
Added to top of `~/.zshrc`:
```zsh
autoload -Uz compinit && compinit -i
```

### Verification
---
```zsh
# Verify Launcher Resolution
type claude
type claude-freefirst
type claude-openrouter
type openclaude
type openclaude-tokenrouter

# Verify Shell Integrity
zsh -n ~/.zshrc
source ~/.zshrc # Should be warning-free

# Live Model Tests
claude-freefirst --print "Reply exactly: CLAUDE_FREEFIRST_OK"
claude-openrouter --print "Reply exactly: CLAUDE_OPENROUTER_OK"
openclaude --print "Reply exactly: OPENCLAUDE_OK"
openclaude-tokenrouter --print "Reply exactly: OPENCLAUDE_TOKENROUTER_OK"
```

### Final Working State
---
- `claude` $\to$ Standard Claude Code $\to$ **Working**
- `claude-freefirst` $\to$ Free-first Gateway $\to$ **Working**
- `claude-openrouter` $\to$ OpenRouter Route $\to$ **Working**
- `openclaude` $\to$ 9Router (`ag/gemini-3.7-flash-high`) $\to$ **Working**
- `openclaude-tokenrouter` $\to$ TokenRouter (`z-ai/glm-5.3-free`) $\to$ **Working**
- `OpenCode` default $\to$ `omniroute/coding-chain` $\to$ **Working**
- `Kimi Code` $\to$ TokenRouter (`z-ai/glm-5.3-free`) $\to$ **Working**

### If This Happens Again
---
1. **Model Expired**: Check TokenRouter for new free-tier models (e.g., GLM series) and update provider configs.
2. **Missing Launchers**: Check `~/.local/bin/` for `.disabled-*` files.
3. **Credential Failures**: Check `~/.config/omniroute-keys/` before assuming Keychain is the only source.
4. **Completion Warnings**: Ensure `compinit` is called before any `compdef` registrations.
