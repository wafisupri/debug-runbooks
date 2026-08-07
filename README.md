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

| Date | Runbook | Status |

|---|---|---|

| 2026-08-07 | Hermes + Composio + GitHub Fix | Fixed |

| 2026-08-07 | FreeLLM + OmniRoute + OpenCode Terminal Recovery | Fixed |

## Windows
---

No runbooks yet.

## Linux
---

No runbooks yet.

## Cross-platform
---

No runbooks yet.

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
