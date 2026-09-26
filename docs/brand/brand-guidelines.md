# Debug Runbooks brand guidelines

These rules keep the website consistent when it is changed by a person or a coding agent. The authoritative values live in [`site/src/styles/tokens.css`](../../site/src/styles/tokens.css); this document explains how to use them.

## Philosophy

The runbooks are the product. The site should read like an engineer's carefully kept incident log: calm, dense, precise. Credibility comes from the content, typography and structure, not from decoration.

- One chromatic hue plus neutrals. Nothing else.
- Differentiate information by typography, hierarchy, spacing, shape, borders, density and opacity **before** reaching for a different tone.
- Every visual element must carry information. If it does not, remove it.

## Primary hue

| Token | Value | Notes |
| --- | --- | --- |
| `--brand-h` | `195` (OKLCH hue) | Verdigris: oxidised-copper blue-green. |
| `--brand-c-scale` | `1` | Chroma multiplier. `0` produces a fully monochrome site. |

Re-branding means changing `--brand-h` (and, if necessary, `--brand-c-scale`). No other file should need to change. The hue was chosen to avoid imitating common technology brands, such as GitHub green, Cloudflare orange, the Anthropic clay tone and generic "AI" purple-blue.

## Tonal scale

Lightness and chroma steps are fixed; only the hue is shared.

| Step | L | C | Typical semantic use |
| --- | --- | --- | --- |
| `brand-50` | 0.975 | 0.012 | — |
| `brand-100` | 0.950 | 0.025 | category surface (light) |
| `brand-200` | 0.900 | 0.045 | text selection, dark-mode strong category |
| `brand-300` | 0.830 | 0.065 | dark-mode links, status, signal-high |
| `brand-400` | 0.740 | 0.085 | dark-mode focus ring and accents |
| `brand-500` | 0.640 | 0.095 | light-mode partial status, signal-low |
| `brand-600` | 0.550 | 0.090 | focus ring, follow-up status, accent borders |
| `brand-700` | 0.460 | 0.080 | primary buttons, resolved status |
| `brand-800` | 0.380 | 0.065 | links, signal-high, strong category |
| `brand-900` | 0.300 | 0.050 | link hover |
| `brand-950` | 0.220 | 0.035 | dark-mode accent surface |

## Neutral palette

`neutral-0` … `neutral-950` are near-achromatic greys (chroma ≤ 0.007) tinted towards the brand hue so they sit with it rather than against it. Neutrals carry all backgrounds, body text, borders and code surfaces.

## Semantic tokens

Components use **semantic tokens only**. Never use a raw colour literal in a component or page. `tests/brand.test.ts` fails the build if one appears.

| Group | Tokens |
| --- | --- |
| Surfaces | `--surface-page`, `--surface-primary`, `--surface-secondary`, `--surface-sunken`, `--surface-code`, `--surface-accent` |
| Text | `--text-primary`, `--text-secondary`, `--text-muted`, `--text-on-brand`, `--text-link`, `--text-link-hover`, `--text-accent` |
| Borders | `--border-default`, `--border-subtle`, `--border-strong`, `--border-accent` |
| Brand | `--brand-primary`, `--brand-primary-hover`, `--focus-ring` |
| Status | `--status-resolved`, `--status-followup`, `--status-partial`, `--status-unstated` |
| Category | `--category-strong`, `--category-medium`, `--category-soft`, `--category-surface` |
| Activity | `--signal-baseline`, `--signal-idle`, `--signal-low`, `--signal-high`, `--signal-node`, `--signal-selected` |
| Callouts | `--callout-note-border`, `--callout-warning-border`, `--callout-surface` |

Light values are the default. Dark values apply under `prefers-color-scheme: dark` and under `:root[data-theme="dark"]`, and the two blocks must stay identical.

## Typography

- **Sans:** IBM Plex Sans (variable, self-hosted via `@fontsource-variable`). Used for body text and headings.
- **Mono:** JetBrains Mono (variable, self-hosted). Used for code and for *labels*: metadata keys, dates, status and platform markers, section kickers. Labels are uppercase with `--tracking-label`.
- Fluid scale `--text-xs` … `--text-2xl`, built with `clamp()`. The largest heading is `--text-2xl`, and there are no giant marketing headlines.
- Prose measure is `--measure` (72ch).

## Spacing, borders and shape

- 4px-based spacing scale `--space-1` … `--space-8`, with a fluid page gutter `--gutter`.
- Structure comes from **rules**, not boxes. A 2px `--text-primary` rule opens a major section (`.section-head`), and 1px `--border-default` / `--border-subtle` rules separate rows.
- Radii are nearly square (`--radius-1` = 2px). Avoid rounded cards, shadows, blur and glass.
- Touch targets are at least `--target-min` (44px) for primary controls.

## Status indicators

Shape, fill and text carry the meaning. The tones are shades of the single brand hue, with no traffic-light colours.

| Status | Mark | When |
| --- | --- | --- |
| Resolved | filled square | the runbook's own status text says fixed/resolved/completed/verified/closed/pass |
| Resolved · follow-up | half-filled square | the text also says work, debt or exceptions remain |
| Partial | outlined square | the text says partial / in progress |
| Status not stated | dashed neutral square | no status anywhere |

The raw status text from the runbook is always shown next to the mark on runbook pages. The mapping is in `site/src/lib/status.ts`.

## Category differentiation

Platforms differ by **glyph shape** and tone of the same hue:

| Platform | Glyph |
| --- | --- |
| macOS | solid square, `--category-strong` |
| Windows | outlined square, `--category-medium` |
| Linux | filled circle, `--category-medium` |
| Cross-platform | diagonal split square, strong + surface |

Systems (Claude Code, OmniRoute, OAuth, …) are plain monospace text or outlined chips. They never get their own colours.

## Activity visualisation ("signal trace")

- One vertical stroke per calendar day on a baseline, a telemetry trace rather than a contribution grid.
- **Height** ∝ √(commits / busiest day). The square root keeps quiet days visible next to a busy one.
- **Tone:** `--signal-high` for days that touched a runbook, `--signal-low` for index-only or site-only days, and a 1px `--signal-idle` tick for days with no commits.
- **Node:** a filled dot above the stroke on days a runbook was first added.
- **Selection:** `--signal-selected` stroke plus an underline.
- Data comes only from git history. Days are never padded or invented, and the range runs from the first commit to the build date.
- Every encoding is repeated in text: the summary sentence, the detail panel and the data table.

## Accessibility

- Text pairs meet WCAG 2.2 AA (4.5:1) and graphics meet 3:1, in both themes. `tests/brand.test.ts` computes these ratios from `tokens.css` and fails on regressions.
- Focus is always visible (`--focus-ring`, 2px outline).
- No information is available only on hover.
- `prefers-reduced-motion` disables transitions and smooth scrolling.

## Do

- Add a new semantic token when a new *role* appears, mapped to an existing scale step.
- Use a rule, spacing or a type change to separate things.
- Keep new components dense and aligned to the existing grid.

## Don't

- Add a second hue, including for a new platform, tool or "error" state.
- Add gradients (except the platform split glyph), glows, glassmorphism, blur, drop shadows or 3D effects.
- Use typewriter effects, fake terminals, animated counters or decorative motion.
- Show skill bars, vanity metrics, or statistics not derived from the repository.
- Put every section in a card.
- Hard-code `#hex`, `rgb()`, `hsl()` or `oklch()` in components.
