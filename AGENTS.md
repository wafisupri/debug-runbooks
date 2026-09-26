# Repository Guidelines

## Project Structure & Module Organization

This repository contains verified debugging runbooks plus a static website (`site/`) that publishes them.

- `macos/`, `windows/`, `linux/`, and `cross-platform/` contain platform-specific runbooks.
- Each platform directory has a `README.md` index; `README.md` is the master index.
- `templates/runbook-template.md` defines the required runbook structure.
- Keep supporting snippets inside the relevant runbook; there is no separate assets directory.

## Build, Test, and Development Commands

The runbooks themselves have no build step. Useful checks are:

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

## Website (`site/`)

The Astro site reads runbooks directly from the platform folders; runbook Markdown remains the source of truth and must stay readable on GitHub. Do not add frontmatter or edit runbooks for the website's sake.

```bash
cd site
npm ci
npm run check:content  # derived metadata per runbook, with sources and warnings
npm test               # vitest: pipeline, privacy, activity, brand/contrast guards
npm run check          # astro check (types)
npm run build          # activity data + static build + output secret/path scan
```

- Publishing rules (exclusions, redactions, per-runbook overrides with a reason) live in `site/content-policy.yaml`.
- Colours come only from `site/src/styles/tokens.css`; see `docs/brand/brand-guidelines.md`.
- Deployment (Cloudflare Workers static assets) is documented in `docs/deployment.md`.
- New runbook status wording must be recognised by `site/src/lib/status.ts`; `npm test` fails otherwise.
