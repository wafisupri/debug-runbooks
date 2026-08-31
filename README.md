# Debug Runbooks
---

Real-world debugging sessions converted into concise, verified recovery guides.

These are not raw chat transcripts. Each runbook records what failed, why it failed, what troubleshooting approaches did not help, the final working solution, and how the fix was verified.

The goal is to preserve practical debugging knowledge so the same problem can be solved faster the next time it appears.

## Runbook Structure
---

Every runbook follows a common structure:

### Summary
---

A concise description of the problem and the final outcome.

### Environment
---

The operating system, software versions, paths, shells, runtimes, hardware, and other relevant context.

### Symptoms
---

The errors, unexpected behavior, logs, or other observations that originally exposed the problem.

### Root Cause
---

The underlying technical reason the problem occurred.

### What Did Not Work
---

Troubleshooting attempts, incorrect assumptions, misleading fixes, or repetitive actions that should not be repeated.

### Final Fix
---

The working solution and why it resolves the underlying problem.

### Commands
---

The important commands consolidated into a clean sequence.

### Verification
---

The checks used to prove that the solution actually works.

### Final Working State
---

The known-good configuration after troubleshooting was completed.

### Optional Cleanup
---

Old files, packages, services, configurations, or other remnants that are safe to remove but are not required for the fix.

### If This Happens Again
---

The shortest reliable diagnostic and recovery procedure.

## macOS
---

<table>
  <thead>
    <tr>
      <th style="white-space: nowrap; width: 1%;">Date</th>
      <th style="width: 100%;">Runbook</th>
      <th style="white-space: nowrap; width: 1%;">Status</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">2026-08-31</td>
      <td><a href="macos/claude-freefirst-openrouter-routing-2026-08-31.md">Claude Code Free-First / OpenRouter Routing — validated 3-stage free-first → paid fallback with SSE streaming, 8s/15s/90s timeout tuning, controlled paid-fallback verification, and intentional post-validation disablement</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">2026-08-31</td>
      <td><a href="macos/kimi-cross-provider-payload-compatibility-repair-2026-08-31.md">Kimi Code Cross-Provider Payload Compatibility &amp; Model Catalogue Repair</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">2026-08-30</td>
      <td><a href="macos/openclaude-9router-silvermbn-auth-recovery-2026-08-30.md">OpenClaude → 9Router silverMBN Authentication &amp; Persistent Wrapper Recovery</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">2026-08-30</td>
      <td><a href="macos/kimi-freellm-ingress-compatibility-recovery-2026-08-30.md">Kimi Code → FreeLLM Ingress Compatibility Recovery</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">2026-08-30</td>
      <td><a href="macos/openclaude-omniroute-model-catalogue-repair-2026-08-30.md">OpenClaude / OmniRoute Model Catalogue Repair — Stray 9Router Node Removal &amp; FREE-FIRST Verification</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">2026-08-29</td>
      <td><a href="macos/tokenrouter-glm53-claude-launcher-recovery-2026-08-29.md">TokenRouter GLM 5.3 Free + Claude/OpenClaude Launcher Recovery</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">2026-08-29</td>
      <td><a href="macos/tokenrouter-credential-rotation-post-verification-2026-08-29.md">TokenRouter Credential Rotation — Post-Rotation Verification &amp; Credential Hygiene</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">2026-08-29</td>
      <td><a href="macos/omniroute-asymmetric-combo-timeouts-2026-08-29.md">OmniRoute Asymmetric Combo Timeout Optimisation</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">2026-08-28</td>
      <td><a href="macos/stage-f0d-launchd-gateway-optimization-2026-08-28.md">Stage F0D launchd Gateway Optimization &amp; DFlash 2 Caching</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">2026-08-26</td>
      <td><a href="macos/9router-apple-silicon-headless-openclaude-recovery-2026-08-26.md">9Router Apple Silicon Headless Recovery &amp; OpenClaude Integration</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">2026-08-25</td>
      <td><a href="macos/kimi-code-0.38-provider-recovery-2026-08-25.md">Kimi Code 0.38 Provider Recovery &amp; Verified 9Router Gemini Default</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">2026-08-22</td>
      <td><a href="macos/freellm-multi-cli-free-models-setup-2026-08-22.md">FreeLLM Multi-CLI Free-Tier Model Aggregation &amp; Failover Setup</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">2026-08-22</td>
      <td><a href="macos/opencode-vercel-ai-gateway-setup-2026-08-22.md">OpenCode + Vercel AI Gateway Setup (Free-Tier Model Labeling)</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">2026-08-22</td>
      <td><a href="macos/tokenrouter-multi-cli-setup-2026-08-22.md">TokenRouter Multi-CLI Integration &amp; Claude Code Bridge Setup</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">2026-08-22</td>
      <td><a href="macos/claude-code-permissions-setup-2026-08-22.md">Claude Code Permissions Setup (Global)</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">2026-08-21</td>
      <td><a href="macos/claude-code-omniroute-env-setup-2026-08-21.md">Claude Code + OmniRoute Environment Setup</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">2026-08-07</td>
      <td><a href="macos/hermes-composio-github-session-2026-08-07.md">Hermes + Composio + GitHub Fix</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">2026-08-07</td>
      <td><a href="macos/terminal-crash-recovery-runbook.md">FreeLLM + OmniRoute + OpenCode Terminal Recovery</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
  </tbody>
</table>

## Windows
---

<table>
  <thead>
    <tr>
      <th style="white-space: nowrap; width: 1%;">Date</th>
      <th style="width: 100%;">Runbook</th>
      <th style="white-space: nowrap; width: 1%;">Status</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">2026-08-23</td>
      <td><a href="windows/2026-08-23-pm2-windows-dual-router-setup.md">PM2 Windows Dual-Router Setup (OmniRoute + 9Router Port Mapping &amp; Daemonization)</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">2026-08-23</td>
      <td><a href="windows/2026-08-23-windows-multi-cli-free-model-setup.md">Windows Multi-CLI Free-Tier Model Setup (OmniRoute + OpenClaw + Hermes)</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
    <tr>
      <td style="white-space: nowrap;">2026-08-23</td>
      <td><a href="windows/2026-08-23-windows-multi-provider-kimi-deepseek-setup.md">Windows Multi-Provider Kimi/DeepSeek Setup (PWA + OpenCode + Pi + OpenClaude + Kimi Code)</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
  </tbody>
</table>

## Linux
---

<table>
  <thead>
    <tr>
      <th style="white-space: nowrap; width: 1%;">Date</th>
      <th style="width: 100%;">Runbook</th>
      <th style="white-space: nowrap; width: 1%;">Status</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">—</td>
      <td><em>No runbooks yet.</em></td>
      <td style="white-space: nowrap;">—</td>
    </tr>
  </tbody>
</table>

## Cross-platform
---

<table>
  <thead>
    <tr>
      <th style="white-space: nowrap; width: 1%;">Date</th>
      <th style="width: 100%;">Runbook</th>
      <th style="white-space: nowrap; width: 1%;">Status</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="white-space: nowrap;">2026-08-23</td>
      <td><a href="cross-platform/local-memory-mcp-setup-runbook.md">Agent Amnesia Across the CLI Fleet (Local Memory MCP Servers)</a></td>
      <td style="white-space: nowrap;">Fixed</td>
    </tr>
  </tbody>
</table>

## Philosophy
---

A useful runbook should answer four questions:

1. What actually broke?

2. Why did it break?

3. What fixed it?

4. How do I prove it is fixed?

The emphasis is on verified solutions rather than reproducing every troubleshooting step.
## License
---

The original documentation in this repository is licensed under the
[Creative Commons Attribution 4.0 International License (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

You are free to share and adapt these runbooks, including for commercial purposes, provided appropriate credit is given.

Third-party software, command output, logs, trademarks, screenshots, code snippets, and other referenced material remain subject to their respective licenses and rights.
