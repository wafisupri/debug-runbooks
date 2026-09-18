# Repository Guidelines

## Project Structure & Module Organization

This is a documentation-only repository of verified debugging runbooks.

- `macos/`, `windows/`, `linux/`, and `cross-platform/` contain platform-specific runbooks.
- Each platform directory has a `README.md` index; `README.md` is the master index.
- `templates/runbook-template.md` defines the required runbook structure.
- Keep supporting snippets inside the relevant runbook; there is no separate assets directory.

## Build, Test, and Development Commands

There is no build system or automated test suite. Useful checks are:

```bash
git diff --check   # Detect whitespace errors
git status --short # Review modified and untracked files
```

Preview Markdown in your editor or on GitHub before submitting.

## Coding Style & Naming Conventions

- Follow the numbered sections in `templates/runbook-template.md`; preserve them for new runbooks.
- Use Markdown headings, tables, and fenced code blocks. Label code blocks with `bash`, `text`, or the appropriate language.
- Name files by platform, topic, and date, for example `macos/kimi-recovery-2026-08-25.md` or `windows/2026-08-23-pm2-setup.md`.
- Keep titles concise and outcome-oriented. Use sentence case for headings.
- Keep commands copyable, but include only those needed for diagnosis, repair, or verification.

## Testing Guidelines

Every runbook must describe work that was actually performed and verified. Include:

- The relevant environment, versions, paths, and ports.
- What failed and why.
- Approaches that did not work.
- The final fix and the exact verification commands or results.

Record expected output where it clarifies success. Do not invent results or add speculative fixes.

## Commit & Pull Request Guidelines

History uses concise `docs:` commit messages, such as `docs: add macOS recovery runbook`. Continue this format.

Pull requests should:

- Describe the failure, fix, and verification evidence.
- Link related runbooks or issues.
- Include before/after behavior where useful.
- Update the platform `README.md` and root `README.md` when adding or changing an indexed runbook.

## Security & Configuration Tips

Do not commit credentials, API tokens, private URLs, or unredacted authentication material. Prefer placeholders such as `<API_KEY>` and explain where secrets should be stored. Include machine-specific paths only when they are necessary to reproduce or recover the issue.
