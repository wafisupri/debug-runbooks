# OmniRoute Asymmetric Timeout Hardening — Free-First / Paid-Fallback

---

### Summary
---
Hardening and closure of OmniRoute's asymmetric per-target timeout policy for the `coding-chain` routing stack.

The objective was to preserve fast failover for free models while allowing longer execution time only for explicitly approved paid OpenRouter fallbacks.

Final routing policy remains:

```text
auto/coding:free
        ↓
openrouter-free
        ↓
openrouter-paid
```

Final timeout policy:

| Target classification | Timeout |
|---|---:|
| `auto/coding:free` | 8 seconds |
| `openrouter-free` or any model ending in `:free` | 15 seconds |
| Exact members of `openrouter-paid` | 90 seconds |
| Everything else | caller default (`10s` at validation time) |

Status: **PASS / CLOSED**

### Environment
---
- OS: macOS, Apple Silicon
- OmniRoute: v16.2.12
- OmniRoute port: `20128`
- Runtime source:
  `~/.nvm/versions/node/v24.18.1/lib/node_modules/omniroute/open-sse/services/combo/targetTimeoutRunner.ts`
- Runtime loading: TypeScript loaded dynamically through `tsx/esm`
- Routing strategy: `priority`
- `coding-chain` retry configuration:
  - `maxRetries: 2`
  - `retryDelayMs: 1000`

### Problem
---
The original paid-timeout classification relied on broad model-name substring matching.

Examples included:

```text
claude-
gpt-4
gpt-5
gemini-2
deepseek-reasoner
anthropic/
openai/
```

Any model matching one of those strings could receive the 90-second paid timeout even when that model was free, unknown, or not a member of the approved paid fallback combo.

This created three risks:

1. Free or unknown models could be misclassified as paid.
2. Future free models under `anthropic/` or `openai/` namespaces could unintentionally receive 90-second waits.
3. Timeout classification was broader than the actual `openrouter-paid` policy boundary.

### Approved Paid Models
---
At closure, `openrouter-paid` contained exactly:

```text
openrouter/qwen/qwen3-coder-flash
openrouter/deepseek/deepseek-v4-flash
openrouter/anthropic/claude-sonnet-5
```

These are last-resort paid fallbacks only.

### Final Fix
---
The broad paid-family substring matcher was removed and replaced by an exact whitelist:

```ts
const paidWhitelist = new Set([
  "openrouter/qwen/qwen3-coder-flash",
  "openrouter/deepseek/deepseek-v4-flash",
  "openrouter/anthropic/claude-sonnet-5",
]);

if (paidWhitelist.has(s)) {
  return 90000;
}
```

The existing free-first rules were preserved:

```ts
if (s === "auto/coding:free" || s.includes("auto/coding:free")) {
  return 8000;
}

if (
  s === "openrouter-free" ||
  s.includes("openrouter-free") ||
  s.endsWith(":free")
) {
  return 15000;
}
```

Any model not matched by those rules falls back to:

```ts
return defaultTimeoutMs;
```

### Effective Timeout Function
---
The hardened behavior is logically equivalent to:

```ts
export function getComboTargetTimeoutMs(
  modelStr: string,
  defaultTimeoutMs: number,
): number {
  if (!modelStr) return defaultTimeoutMs;

  const s = modelStr.toLowerCase();

  if (s === "auto/coding:free" || s.includes("auto/coding:free")) {
    return 8000;
  }

  if (
    s === "openrouter-free" ||
    s.includes("openrouter-free") ||
    s.endsWith(":free")
  ) {
    return 15000;
  }

  const paidWhitelist = new Set([
    "openrouter/qwen/qwen3-coder-flash",
    "openrouter/deepseek/deepseek-v4-flash",
    "openrouter/anthropic/claude-sonnet-5",
  ]);

  if (paidWhitelist.has(s)) {
    return 90000;
  }

  return defaultTimeoutMs;
}
```

### Runtime Integration
---
`buildTargetTimeoutRunner()` uses the effective model-specific timeout rather than blindly applying the combo-wide default.

Relevant logic:

```ts
const effectiveTimeoutMs =
  getComboTargetTimeoutMs(modelStr, comboTargetTimeoutMs);

if (effectiveTimeoutMs <= 0) {
  // existing behavior
}
```

The timeout warning and timer use `effectiveTimeoutMs`.

The runtime source was verified to be the `.ts` file above; OmniRoute loads it dynamically through the TypeScript/ESM runtime rather than using a separate precompiled JavaScript copy.

### Validation
---
Validation used:

```text
defaultTimeoutMs = 10000
```

Results:

| Test case | Expected | Result |
|---|---:|---:|
| `auto/coding:free` | 8000 | PASS |
| `openrouter/poolside/laguna-s-2.1:free` | 15000 | PASS |
| `openrouter/qwen/qwen3-coder-flash` | 90000 | PASS |
| `openrouter/deepseek/deepseek-v4-flash` | 90000 | PASS |
| `openrouter/anthropic/claude-sonnet-5` | 90000 | PASS |
| `openrouter/anthropic/unlisted` | 10000 | PASS |
| `openrouter/openai/unlisted` | 10000 | PASS |
| `unknown/test-model` | 10000 | PASS |

TypeScript syntactic/type-transpile validation:

```text
PASS — 0 errors
```

### Routing Verification
---
`coding-chain` remained unchanged:

```text
Step 1: auto/coding:free
Step 2: openrouter-free
Step 3: openrouter-paid
```

No combo membership changes were required.

No provider credentials were changed.

No ports were changed.

No unrelated gateway components were modified as part of the timeout hardening.

### Runtime Restart Verification
---
OmniRoute was restarted using its LaunchAgent:

```zsh
launchctl kickstart -k gui/$(id -u)/ai.omniroute.gateway
```

Post-restart verification confirmed:

- OmniRoute process running
- Port `20128` responding
- unauthenticated health request returned expected `AUTH_001`, confirming the server was healthy and listening

### Design Invariant
---
The routing and cost-control invariant remains:

```text
FREE-FIRST → PAID FALLBACK
```

The 90-second timeout does **not** imply that paid models are preferred.

It applies only after routing reaches one of the explicitly approved paid fallback models.

### Remaining Operational Risk
---
The customized source file is inside the globally installed OmniRoute npm package:

```text
~/.nvm/versions/node/v24.18.1/lib/node_modules/omniroute/
```

A future global OmniRoute npm upgrade can overwrite the modification.

After any OmniRoute upgrade:

1. Check whether `targetTimeoutRunner.ts` still contains the asymmetric timeout policy.
2. Confirm the broad paid-family matcher has not returned.
3. Reconcile the whitelist with the current `openrouter-paid` combo membership.
4. Re-run the behavioral test matrix above.
5. Verify `coding-chain` remains free-first.
6. Restart only OmniRoute if a runtime source change was required.

### Recovery Check
---
Quick read-only inspection:

```zsh
grep -nE 'auto/coding:free|openrouter-free|paidWhitelist|qwen3-coder-flash|deepseek-v4-flash|claude-sonnet-5|return 90000|return 15000|return 8000' ~/.nvm/versions/node/v24.18.1/lib/node_modules/omniroute/open-sse/services/combo/targetTimeoutRunner.ts
```

Broad-matcher regression check:

```zsh
grep -nE 'includes\("claude-"\)|includes\("gpt-4"\)|includes\("gpt-5"\)|includes\("gemini-2"\)|includes\("deepseek-reasoner"\)|includes\("anthropic/"\)|includes\("openai/"\)' ~/.nvm/versions/node/v24.18.1/lib/node_modules/omniroute/open-sse/services/combo/targetTimeoutRunner.ts
```

Expected result for the second command:

```text
no matches
```

### Credits / Provenance
---
Configuration planning, safety boundaries, validation criteria, and closure review:

- **ChatGPT — GPT-5.6 Sol**
- Role: architecture review, free-first/paid-fallback policy preservation, hardening guidance, validation plan, and runbook preparation

Implementation and runtime validation:

- **Antigravity CLI (Agy)**
- **GPT-OSS 120B** — used during the cost-constrained hardening/validation session
- **Gemini 3.7 Flash High (`ag/gemini-3.7-flash-high`)** — model shown by Agy during the successful final closure report
- Role: source inspection, surgical whitelist edit, runtime-source verification, focused behavioral validation, TypeScript validation, combo verification, OmniRoute restart, and post-restart health verification

Human operator:

- **Wafi Supri**
- Role: system owner/operator, routing-policy decisions, execution oversight, and acceptance of the final configuration

### Final State
---
```text
ASYMMETRIC_TIMEOUT_OPTIMISATION=PASS
TIMEOUT_HARDENING=PASS
FREE_FIRST_POLICY=UNCHANGED
CODING_CHAIN=UNCHANGED
UNRELATED_CONFIG_MUTATION=NONE
FINAL_STATUS=CLOSED
```
