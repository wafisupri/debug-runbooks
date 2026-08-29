# Kimi Code → FreeLLM Ingress Compatibility Recovery

Date: 2026-08-30
Platform: macOS Apple Silicon
Repository: `freellm_custom` (`/Users/wfspr/GitHub/freellm_custom`)
Gateway: FreeLLM `ai.freellm.gateway` :3001 (`dist/index.mjs`)
Related: Kimi Code CLI 0.38.0, OmniRoute :20128, 9Router :20138/:20148, `groq-kimi-compat.mjs` :20148

### Summary

Kimi Code requests were rejected at FreeLLM ingress before reaching provider selection. A pre-validation compatibility middleware was added to normalize Kimi-injected fields while preserving strict schema validation for unrelated fields. The fix is production-validated and closed.

### Environment

- OS: macOS Apple Silicon
- FreeLLM gateway: `apps/gateway` Express 5 + Zod, compiled `dist/index.mjs`, LaunchAgent `ai.freellm.gateway`
- Kimi Code CLI 0.38.0 under `~/.kimi-code/bin/`
- Kimi config: `~/.config/kimi-code/config.toml`
- Policy proxies: `127.0.0.1:20138`, `127.0.0.1:20148` (must not be killed)
- Kimi compat proxy: `~/.config/kimi-code/compat/groq-kimi-compat.mjs`
- FreeLLM production port: 3001; isolated test port used during repair: 3002/3737 (dev rig)

### Symptoms

Across providers and models, Kimi-initiated requests failed with ingress errors such as:

```
max_tokens: Number must be less than or equal to 32768
Unrecognized key(s) in object: 'prompt_cache_key'
```

Kimi `/compact` also became unusable because every provider/model candidate could encounter the incompatible payload. Preliminary temporary-instance checks showed that after normalization the same payload advanced past ingress and reached routing (`all_providers_exhausted` is expected for an incomplete provider health state and proves ingress was passed).

### Root Cause

Strict Zod validation ran **before** provider-level sanitization.

Existing `BaseProvider.mapRequest()` already stripped `prompt_cache_key` and clamped `max_tokens`, but it was too late. The strict schema in `apps/gateway/src/schemas.ts` (`max_tokens` capped at 32768 and `.strict()`) rejected:

1. `prompt_cache_key`
2. `max_tokens > 32768`

Therefore every Kimi request containing those fields died at ingress before routing or provider normalization could run. Separately observed issues (stale models, `reasoning_content`, TokenRouter 401) were not this ingress bug and were excluded from this fix.

### Request Lifecycle

Confirmed lifecycle:

```
express.json()
→ kimiCompat
→ rate limit
→ auth
→ route (/v1/chat/completions)
→ strict Zod validation (chatCompletionRequestSchema)
→ virtual-key guard
→ router
→ provider selection
→ BaseProvider.mapRequest()
→ upstream fetch
```

Before the fix, the validated path was effectively `express.json() → strict Zod` with no normalization; provider mapping never executed for rejected requests. After the fix, `kimiCompat` runs after body parsing but before Zod validation.

### What Did Not Work

- Relying solely on `BaseProvider.mapRequest()` sanitization — too late.
- Changing the strict schema to `.passthrough()` — would remove validation safety (rejected).
- Building a complex per-provider/per-model output-cap database in this rescue — deferred.
- Killing `policy-proxy.mjs` — immediately caused provider connection errors; forbidden.
- Patching the Kimi binary — forbidden.
- Changing model ordering, FREE-FIRST policy, OmniRoute `coding-chain`, OmniRoute/9Router, credentials, or TokenRouter keys — forbidden.
- Dependending on Kimi Code session recovery for repair — session was overfull (`191k/125k`) and `/compact` failed.

### Final Fix

Added:

```
apps/gateway/src/middleware/kimi-compat.ts
```

Wired in:

```
apps/gateway/src/app.ts
```

after `express.json()` / `express.urlencoded()` and before validation/middleware. The middleware is scoped to relevant requests only:

```
method == POST
path matches /^(?:\/api\/)?\/v1\/chat\/completions\/?$/
content-type is application/json
body is non-array object
```

No other services, configs, or binaries were modified.

### Compatibility Behavior

```
prompt_cache_key              → removed
max_tokens <= 32768           → preserved
max_tokens > 32768            → clamped to 32768
missing max_tokens            → remains missing
model identity                → unchanged
max_context_size              → unchanged
routing / fallback data       → unchanged
unrelated unknown top-level   → still rejected by strict Zod validation
non-object / array bodies     → ignored safely
unrelated routes/methods      → untouched
```

The global 32768 ceiling preserves gateway safety. Provider-specific caps remain handled later in `BaseProvider.mapRequest()` / provider overrides (e.g., Cloudflare).

### Commands / Important Checks

Preserve worktree (never reset/stash in dirty checkout):

```bash
cd /Users/wfspr/GitHub/debug-runbooks
git status --short
git branch --show-current
git rev-parse HEAD && git rev-parse origin/main
git fetch origin
```

Isolated worktree for docs (do not disturb dirty checkout):

```bash
git worktree add -b docs/kimi-freellm-ingress-compat-2026-08-30 \
  /Users/wfspr/GitHub/debug-runbooks-kimi-docs origin/main
cd /Users/wfspr/GitHub/debug-runbooks-kimi-docs
git status --short
git branch --show-current
```

FreeLLM validation (gateway):

```bash
cd /Users/wfspr/GitHub/freellm_custom/apps/gateway
npm run test -- tests/kimi-compat.test.ts
npm run test              # full suite
npm run typecheck
npx biome check src/app.ts src/middleware/kimi-compat.ts tests/kimi-compat.test.ts
```

Production identity and health (read-only):

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
ps -p $(lsof -tiTCP:3001 -sTCP:LISTEN) -o pid=,ppid=,lstart=,command=
launchctl print gui/$(id -u)/ai.freellm.gateway
curl -sS http://127.0.0.1:3001/healthz
lsof -nP -iTCP:20138 -sTCP:LISTEN
lsof -nP -iTCP:20148 -sTCP:LISTEN
```

Rebuild + scoped restart only when safe (never touch policy proxies):

```bash
cd /Users/wfspr/GitHub/freellm_custom/apps/gateway
npm run build
launchctl kickstart -k gui/$(id -u)/ai.freellm.gateway
```

Do not use `pkill -f` or `killall node` on this host.

### Verification

Focused compatibility tests (supertest against `kimiCompat` + strict Zod):

```
Focused tests       : 8/8 PASS
  - preserves normal max_tokens
  - strips prompt_cache_key and clamps 50000 → 32768
  - strips prompt_cache_key and preserves 8192
  - does not invent max_tokens
  - leaves unrelated requests untouched
  - does not alter model/context/routing data
  - ignores non-object bodies safely
  - retains strict rejection for unrelated unknown fields
```

Full gateway suite:

```
Gateway suites       : 120/120 PASS
Gateway tests        : 334/334 PASS
Typecheck            : PASS
Targeted Biome       : PASS
```

Production HTTP on :3001 (direct curl, no auth bypass tricks beyond required headers):

```
normal max_tokens: 10                 → HTTP 200
50000 + prompt_cache_key              → HTTP 200 (clamped)
8192 + prompt_cache_key               → HTTP 200 (preserved)
missing max_tokens + prompt_cache_key → HTTP 200 (no invention)
unrelated totally_unknown_field       → HTTP 400 invalid_request
  Unrecognized key(s) in object: 'totally_unknown_field'
provider observed: mistral
```

Strict-schema regression proven: unrelated fields still rejected.

### Production Runtime

```
Service : ai.freellm.gateway
Port    : 3001
Runtime : dist/index.mjs
Working : /Users/wfspr/GitHub/freellm_custom/apps/gateway
Health  : HTTP 200
Restart : launchctl kickstart -k gui/$(id -u)/ai.freellm.gateway only
```

Only FreeLLM was restarted. OmniRoute, 9Router, policy proxies, and OpenClaw were not restarted.

### Routing Safety

Unchanged:

```
FREE-FIRST              : UNCHANGED
provider ordering        : UNCHANGED
central fallback         : UNCHANGED
billing policy           : UNCHANGED
credentials              : UNCHANGED
OmniRoute                : UNCHANGED
9Router                  : UNCHANGED
duplicate Kimi fallback  : ABSENT
```

Confirmed `BaseProvider.mapRequest()` remains the provider-specific boundary; Cloudflare override and `supportsAssistantReasoningContent` handling were not altered for this fix beyond existing failover work.

### Separate Follow-Up

`reasoning_content` — providers reject replayed assistant messages containing this field.

Finding:

- provider responses can contain reasoning fields
- Kimi may replay them in history
- nested message schema strips unknown fields in some paths
- `BaseProvider.mapRequest()` strips reasoning fields when `supportsAssistantReasoningContent` is false; Gemini opts in

Appropriate future boundary: provider-specific `mapRequest()` after provider selection. Not implemented in this rescue. Do not globally strip `reasoning_content` at ingress.

Also excluded: stale model cleanup (`oc/deepseek-v4-flash-free`, NVIDIA `meta/llama-3.3-70b-instruct`, etc.) and TokenRouter authentication issues.

### If This Happens Again

1. Confirm lifecycle: `express.json() → kimiCompat → strict Zod → router → mapRequest()`.
2. Check `kimiCompat` is mounted after JSON parsing and before `validate(chatCompletionRequestSchema)`.
3. Verify it strips `prompt_cache_key` and clamps `max_tokens` to 32768 for `POST /v1/chat/completions` JSON only.
4. Run `tests/kimi-compat.test.ts` — must include strict-rejection case.
5. Hit `:3001/v1/chat/completions` with the five payloads above; expect 200/200/200/200/400.
6. Check `lsof :3001`, `launchctl print ai.freellm.gateway`, and `dist/index.mjs` mtime vs sources; rebuild + kickstart only that service if stale.
7. Verify `127.0.0.1:20138` and `127.0.0.1:20148` remain LISTENING; never `pkill -f policy-proxy`.

### Credits / Provenance

#### Human operator

**Wafi Supri**

- system owner / operator
- routing-policy decisions
- execution oversight
- acceptance of final configuration

#### Planning / diagnostic guidance

**ChatGPT — GPT-5.6 Sol**

- architecture analysis
- diagnosis review
- validation-order identification
- safe handover design
- regression criteria
- closure review
- runbook preparation guidance

#### Initial diagnosis / partial implementation

**Kimi Code CLI 0.38.0**

- cross-provider investigation
- request-path tracing
- error reproduction (`max_tokens` / `prompt_cache_key`)
- initial `kimiCompat` middleware implementation
- preliminary temporary-port validation

AI/model context during troubleshooting included models available through the configured provider fleet; do not falsely attribute every Kimi-side edit to a single model without evidence.

#### Final implementation validation

**OpenCode CLI — GPT-OSS 120B**

- inherited partial-patch review
- middleware safety and scoping improvements
- focused automated tests (8 cases)
- full gateway suite validation (120/120 suites, 334/334 tests)
- production runtime identification
- FreeLLM-only restart (LaunchAgent)
- production HTTP validation
- strict-schema regression check
- policy-proxy and routing safety validation

#### Documentation / publication

**OpenCode CLI — OpenRouter/openai/gpt-5.6-sol-pro via 9Router**

- runbook creation
- README update
- secret scanning and redaction
- repository hygiene and blocker assessment
- triple verification
- commit and push

### Final Working State

```
Kimi ingress compatibility       : FIXED
Strict validation preserved     : YES
Production health :3001         : HTTP 200
Policy proxies :20138/:20148    : LISTENING
Routing / FREE-FIRST            : UNCHANGED
Tests                           : 8/8 focused, 120/120 suites, 334/334 tests
Typecheck / Biome               : PASS
Docs branch                     : docs/kimi-freellm-ingress-compat-2026-08-30
Runbook                         : macos/kimi-freellm-ingress-compatibility-recovery-2026-08-30.md
Stale models / reasoning_content: explicitly deferred
Final verdict                   : PASS — CLOSED
```
