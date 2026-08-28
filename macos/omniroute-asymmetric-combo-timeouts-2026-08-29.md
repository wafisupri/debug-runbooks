# OmniRoute Asymmetric Combo Timeout Optimisation

Date: 2026-08-29
Platform: macOS Apple Silicon
Gateway: OmniRoute :20128
Scope: FREE-FIRST → PAID-FALLBACK combo latency optimisation

## Objective

Document that the original OmniRoute combo-target policy used approximately one shared 10-second timeout.

Observed failure pattern:

```
auto/coding:free
→ first-output timeout
→ openrouter-free
→ stream committed
```

The chosen optimisation was asymmetric target timeouts rather than reducing every free route to 5 seconds.

## Routing policy

Preserve:

```
auto/coding:free
→ openrouter-free
→ openrouter-paid
```

Timeout policy:

```
auto/coding:free     → 8,000 ms
openrouter-free      → 15,000 ms
known paid routes    → 90,000 ms
unknown/other        → existing/default combo timeout
```

Emphasize that FREE-FIRST → PAID-FALLBACK was not changed.

## Relevant environment

```
/Users/wfspr/.nvm/versions/node/v24.18.1/lib/node_modules/omniroute/
```

Database:

```
/Users/wfspr/.omniroute/storage.sqlite
```

Primary modified file:

```
/Users/wfspr/.nvm/versions/node/v24.18.1/lib/node_modules/omniroute/open-sse/services/combo/targetTimeoutRunner.ts
```

Related inspected file:

```
/Users/wfspr/.nvm/versions/node/v24.18.1/lib/node_modules/omniroute/open-sse/handlers/chatCore/upstreamTimeouts.ts
```

Only `targetTimeoutRunner.ts` was modified.

## Implementation

Before:

```
one shared comboTargetTimeoutMs for all combo targets
```

After:

```
getComboTargetTimeoutMs(modelStr, defaultTimeoutMs)
```

Effective resolver:

```
auto/coding:free                                      8,000 ms
openrouter-free / concrete models ending in :free   15,000 ms
known premium families                               90,000 ms
unknown/other                                        existing default
```

The current implementation reportedly recognizes paid families including:

```
claude-*
anthropic/*
gpt-4*
gpt-5*
openai/*
gemini-2*
deepseek-reasoner
```

Record this as a future hardening concern.

Do NOT claim that every `anthropic/*` or `openai/*` model is inherently paid.

Preferred future design:

```
exact configured paid target(s) → 90,000 ms
free targets                    → route-specific free timeout
unknown targets                 → existing/default timeout
```

## 524 versus 504

Document:

```
524 = synthetic internal timeout for an individual combo target
504 = downstream/outer gateway timeout if all candidates/global request fail
```

The 524 allows the combo engine to advance to the next target.

No status-semantics changes were made.

## Timeout cancellation

Document that timeout cleanup remains preserved through:

```
clearTimeout(timeoutId)
```

in the appropriate `finally` path.

Successful early responses therefore continue streaming normally rather than being killed when the timer would otherwise expire.

## coding-chain verification

Current order:

```
Strategy: priority
maxRetries: 2
retryDelayMs: 1000

1.
id: coding-chain-model-1-auto-coding-free
kind: model
model: auto/coding:free
providerId: auto

2.
id: coding-chain-ref-2-openrouter-free
kind: combo-ref
comboName: openrouter-free

3.
id: coding-chain-ref-3-openrouter-paid
kind: combo-ref
comboName: openrouter-paid
```

## openrouter-free verification

Ordered targets:

```
1. openrouter/poolside/laguna-s-2.1:free
2. openrouter/cohere/north-mini-code:free
3. openrouter/minimax/minimax-m2.7:free
4. openrouter/nvidia/nemotron-3-super-120b-a12b:free
5. openrouter/google/gemma-4-31b-it:free
```

## Critical resolver finding

When target #1 is attempted:

```
modelStr = "auto/coding:free"
```

Therefore:

```
auto/coding:free => 8000
```

is reachable in real traffic.

For the nested OpenRouter free target:

```
modelStr = "openrouter/poolside/laguna-s-2.1:free"
```

Therefore it matches the `:free` policy and receives:

```
15000 ms
```

## Live request

Record this result:

```
HTTP status: 200
duration: 2705 ms
comboName: coding-chain
comboStepId: openrouter-free-model-1-openrouter-poolside-laguna-s-2-1-free
model: poolside/laguna-s-2.1:free
provider: openrouter
paid fallback reached: NO
```

Relevant persisted log:

```
/Users/wfspr/.omniroute/call_logs/2026-08-28/2026-08-28T10-45-24.065Z_1787913921384-c4baf8.json
```

## Reconstruction of that request

Document:

1. auto/coding:free was evaluated/attempted.
2. provider `auto` had no available provider connection/candidate match.
3. it failed fast in under roughly 10 ms.
4. coding-chain advanced to openrouter-free.
5. poolside/laguna-s-2.1:free answered successfully.
6. successful OpenRouter request completed in 2705 ms.
7. paid fallback was not reached.

Explain that OmniRoute's persisted summary fields describe the successful/final upstream target. Earlier failed pre-checks/attempts may only appear in combo telemetry.

Therefore seeing:

```
comboStepId = openrouter-free-model-1-...
```

does NOT mean `auto/coding:free` was absent or skipped.

## Validation results

Include:

```
auto/coding:free → 8000
openrouter-free  → 15000
gpt-4o           → 90000
unknown          → default, typically 10000
```

State that focused Node/tsx assertion testing passed.

## Upgrade persistence

Clearly warn:

```
NOT PERSISTENT ACROSS OMNIROUTE/NPM REINSTALL OR UPGRADE
```

because the patch lives inside:

```
~/.nvm/versions/node/v24.18.1/lib/node_modules/omniroute/
```

Potential overwrites include:

```
npm update
npm install -g omniroute
OmniRoute upgrade/reinstall
Node/nvm version changes
```

## Accidental loop incident

Document that an unintended scheduled `/loop` job was created during investigation:

```
Job ID: abfbfa9a
```

It was cancelled successfully.

Do not recreate it.

## Credits

```
## Credits

Configuration architecture, timeout policy design, review, and handover guidance:

- OpenAI ChatGPT — GPT-5.6 Sol

Local implementation, OmniRoute source inspection, database inspection, runtime tracing, validation, and troubleshooting:

- OpenClaude CLI
```

Important attribution rule:

```
The exact active routed AI model used by OpenClaude CLI for every local execution step was not reliably captured in the retained logs and is intentionally not guessed.
```

Also include:

```
## Subsequent handover prepared for:

- Antigravity CLI — Gemini 3.7
```

But explicitly state:

```
Antigravity CLI / Gemini 3.7 was prepared as the next handover target and should only receive implementation credit for work it actually performs after that handover. It did not implement the timeout patch documented here.
```

## Final status table

```
coding-chain order                    PASS
auto/coding:free first                PASS
8s auto matcher reachable             PASS
15s OpenRouter-free matcher reachable PASS
fast successful free response         PASS (2705 ms)
paid fallback avoided                  PASS
routing order preserved                PASS
timeout cancellation preserved        PASS
internal 524 semantics preserved       PASS
upgrade persistence                    NO
paid matcher hardening audit          PENDING
```