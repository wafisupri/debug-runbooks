/**
 * Brand-system guards:
 *  1. components and pages never hard-code colour literals (tokens only);
 *  2. every semantic text/graphic pairing meets WCAG 2.2 contrast minimums,
 *     computed from tokens.css itself (light and dark themes).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../src");
const tokensCss = readFileSync(join(SRC, "styles/tokens.css"), "utf8");

function* walk(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith(".astro")) yield p;
  }
}

describe("no raw colours outside tokens", () => {
  it("components and pages only use CSS custom properties for colour", () => {
    const offenders: string[] = [];
    for (const dir of ["components", "pages", "layouts"]) {
      for (const file of walk(join(SRC, dir))) {
        const text = readFileSync(file, "utf8");
        const m = text.match(/#[0-9a-fA-F]{3,8}\b(?![-\w])|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/g);
        if (m) offenders.push(`${file.replace(SRC, "src")}: ${m.join(", ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ── OKLCH → relative luminance ──────────────────────────────────────────────
type Oklch = [number, number, number];

function oklchToLinearSrgb([L, C, h]: Oklch): [number, number, number] {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const luminance = (c: Oklch) => {
  const [r, g, b] = oklchToLinearSrgb(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: Oklch, b: Oklch) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// Palette primitives parsed from tokens.css.
const HUE = Number(/--brand-h:\s*([\d.]+)/.exec(tokensCss)![1]);
it("parses the palette from tokens.css", () => {
  expect(palette.size).toBe(11 + 13);
});
const palette = new Map<string, Oklch>();
for (const m of tokensCss.matchAll(/--(brand-\d+):\s*oklch\(([\d.]+)\s+calc\(([\d.]+)\s*\*\s*var\(--brand-c-scale\)\)\s+var\(--brand-h\)\)/g)) {
  palette.set(m[1], [Number(m[2]), Number(m[3]), HUE]);
}
for (const m of tokensCss.matchAll(/--(neutral-\d+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+(var\(--brand-h\)|[\d.]+)\)/g)) {
  palette.set(m[1], [Number(m[2]), Number(m[3]), m[4].startsWith("var") ? HUE : Number(m[4])]);
}

/** Resolves semantic tokens for a theme block (light = first :root block with semantics). */
function theme(block: string): (name: string) => Oklch {
  const map = new Map<string, string>();
  for (const m of block.matchAll(/--([\w-]+):\s*var\(--([\w-]+)\)/g)) map.set(m[1], m[2]);
  const resolveToken = (name: string): Oklch => {
    if (palette.has(name)) return palette.get(name)!;
    const ref = map.get(name) ?? lightMap.get(name);
    if (!ref) throw new Error(`unresolved token --${name}`);
    return resolveToken(ref);
  };
  return resolveToken;
}

const blocks = tokensCss.split(/\n(?=[:@])/);
const lightBlock = blocks.find((b) => b.includes("--surface-page: var(--neutral-50)"))!;
const darkBlock = blocks.find((b) => b.startsWith(':root[data-theme="dark"]'))!;
const lightMap = new Map<string, string>([...lightBlock.matchAll(/--([\w-]+):\s*var\(--([\w-]+)\)/g)].map((m) => [m[1], m[2]]));

const TEXT_PAIRS: Array<[string, string]> = [
  ["text-primary", "surface-page"], ["text-primary", "surface-primary"], ["text-primary", "surface-secondary"],
  ["text-secondary", "surface-page"], ["text-secondary", "surface-primary"], ["text-secondary", "surface-secondary"],
  ["text-muted", "surface-page"], ["text-muted", "surface-primary"], ["text-muted", "surface-secondary"], ["text-muted", "surface-code"],
  ["text-link", "surface-page"], ["text-link", "surface-primary"], ["text-link", "surface-accent"],
  ["text-accent", "surface-page"], ["text-on-brand", "brand-primary"], ["text-primary", "surface-accent"],
];
const GRAPHIC_PAIRS: Array<[string, string]> = [
  ["focus-ring", "surface-page"], ["focus-ring", "surface-primary"],
  ["border-strong", "surface-primary"],
  ["status-resolved", "surface-page"], ["status-followup", "surface-page"], ["status-partial", "surface-page"], ["status-unstated", "surface-page"],
  ["signal-low", "surface-page"], ["signal-high", "surface-page"], ["signal-node", "surface-page"],
  ["category-strong", "surface-page"], ["category-medium", "surface-page"],
];

describe.each([
  ["light", theme(lightBlock)],
  ["dark", theme(darkBlock)],
])("%s theme contrast", (_name, t) => {
  it.each(TEXT_PAIRS)("text --%s on --%s ≥ 4.5:1", (fg, bg) => {
    expect(contrast(t(fg), t(bg))).toBeGreaterThanOrEqual(4.5);
  });
  it.each(GRAPHIC_PAIRS)("graphic --%s on --%s ≥ 3:1", (fg, bg) => {
    expect(contrast(t(fg), t(bg))).toBeGreaterThanOrEqual(3);
  });
});
