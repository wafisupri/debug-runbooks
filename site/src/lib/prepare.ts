/**
 * Presentation-only Markdown preprocessing. The source files are never
 * modified; this runs on an in-memory copy before rendering.
 */
import { posix } from "node:path";
import { extractHeadings, sectionDepth } from "./sections.ts";
import { githubBlobUrl } from "./paths.ts";

const FENCE = /^(\s*)(```|~~~)/;

export interface PrepareOptions {
  /** Repository-relative path of this runbook, e.g. "macos/foo.md". */
  repoPath: string;
  /** Maps repository-relative runbook paths to site routes. */
  routeFor: (repoPath: string) => string | undefined;
  /** Metadata lines already shown in the page header (removed from the body). */
  headerLines: string[];
}

/**
 * - removes the H1 and the metadata lines rendered in the page header
 * - shifts heading depth so top-level sections are <h2>
 * - drops thematic breaks that directly follow a heading (decorative in source)
 * - removes the template's literal "</> Bash" label lines inside code fences
 * - rewrites relative links: published runbooks → site routes, other repo files → GitHub
 */
export function prepareMarkdown(markdown: string, opts: PrepareOptions): string {
  const shift = sectionDepth(extractHeadings(markdown)) - 2;
  const header = new Set(opts.headerLines.map((l) => l.trim()));
  const out: string[] = [];
  let inFence = false;
  let fenceOpenedAt = -1;
  let lastSignificant: "heading" | "other" | "none" = "none";
  let h1Removed = false;

  for (const line of markdown.split("\n")) {
    const fence = FENCE.exec(line);
    if (fence) {
      inFence = !inFence;
      fenceOpenedAt = inFence ? out.length : -1;
      out.push(line);
      lastSignificant = "other";
      continue;
    }
    if (inFence) {
      // Template artefact: a "</> Bash" label as the first lines of a fence.
      const firstLines = out.length - fenceOpenedAt <= 2;
      if (firstLines && /^\s*<\/>\s*\w+\s*$/.test(line)) continue;
      out.push(line);
      continue;
    }
    const heading = /^(#{1,6})(\s+.*)$/.exec(line);
    if (heading) {
      if (heading[1].length === 1 && !h1Removed) {
        h1Removed = true;
        continue;
      }
      const depth = Math.min(6, Math.max(2, heading[1].length - shift));
      out.push("#".repeat(depth) + heading[2]);
      lastSignificant = "heading";
      continue;
    }
    if (header.has(line.trim()) && line.trim() !== "") continue;
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line) && lastSignificant !== "other") {
      // Decorative rule under a heading or at the top of the document.
      continue;
    }
    if (line.trim() !== "") lastSignificant = "other";
    out.push(line);
  }

  return rewriteLinks(out.join("\n"), opts);
}

function rewriteLinks(markdown: string, opts: PrepareOptions): string {
  const dir = posix.dirname(opts.repoPath);
  const rewrite = (href: string): string => {
    if (/^([a-z]+:|#|\/\/)/i.test(href)) return href;
    const [path, hash] = href.split("#");
    if (!path) return href;
    const target = posix.normalize(posix.join(dir, decodeURIComponent(path)));
    if (target.startsWith("..")) return href;
    const route = opts.routeFor(target);
    if (route) return route + (hash ? `#${hash}` : "");
    return githubBlobUrl(target) + (hash ? `#${hash}` : "");
  };
  let inFence = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (FENCE.test(line)) inFence = !inFence;
      if (inFence) return line;
      return line
        .replace(/\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (_m, href: string, title = "") => `](${rewrite(href)}${title})`)
        .replace(/href="([^"]+)"/g, (_m, href: string) => `href="${rewrite(href)}"`);
    })
    .join("\n");
}
