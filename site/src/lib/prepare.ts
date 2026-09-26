/**
 * Presentation-only Markdown preprocessing. The source files are never
 * modified; this runs on an in-memory copy before rendering.
 */
import { posix } from "node:path";
import { createFenceTracker, extractHeadings, sectionDepth } from "./sections.ts";
import { githubBlobUrl } from "./paths.ts";

export interface PrepareOptions {
  /** Repository-relative path of this runbook, e.g. "macos/foo.md". */
  repoPath: string;
  /** Maps repository-relative runbook paths to site routes. */
  routeFor: (repoPath: string) => string | undefined;
  /** Metadata lines already shown in the page header (removed from the preamble only). */
  headerLines: string[];
}

/**
 * - removes the H1 and, in the preamble only, the metadata lines rendered in the page header
 * - shifts heading depth so top-level sections are <h2>
 * - drops thematic breaks that directly follow a heading (decorative in source)
 * - removes the template's literal "</> Bash" label line at the start of a code fence
 * - rewrites relative links: published runbooks → site routes, other repo files → GitHub
 */
export function prepareMarkdown(markdown: string, opts: PrepareOptions): string {
  const shift = sectionDepth(extractHeadings(markdown)) - 2;
  const pendingHeaderLines = new Set(opts.headerLines.map((l) => l.trim()).filter(Boolean));
  const fence = createFenceTracker();
  const out: string[] = [];
  let fenceStart = -1;
  let lastSignificant: "heading" | "other" | "none" = "none";
  let inPreamble = true;
  let h1Removed = false;

  for (const line of markdown.split("\n")) {
    const wasInside = fence.inside;
    if (fence.update(line)) {
      if (!wasInside) fenceStart = out.length; // opening fence line index
      // Template artefact: "</> Bash" as the first content line of a fence.
      if (wasInside && out.length - fenceStart === 1 && /^\s*<\/>\s*\w+\s*$/.test(line)) continue;
      out.push(line);
      lastSignificant = "other";
      continue;
    }
    const heading = /^(#{1,6})(\s+.*)$/.exec(line);
    if (heading) {
      if (heading[1].length === 1 && !h1Removed) {
        h1Removed = true;
        continue;
      }
      inPreamble = false;
      const depth = Math.min(6, Math.max(2, heading[1].length - shift));
      out.push("#".repeat(depth) + heading[2]);
      lastSignificant = "heading";
      continue;
    }
    if (inPreamble && pendingHeaderLines.delete(line.trim())) continue;
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line) && lastSignificant !== "other") continue;
    if (line.trim() !== "") lastSignificant = "other";
    out.push(line);
  }

  return rewriteLinks(out.join("\n"), opts);
}

function rewriteLinks(markdown: string, opts: PrepareOptions): string {
  const dir = posix.dirname(opts.repoPath);
  const rewrite = (href: string): string => {
    if (/^([a-z][a-z0-9+.-]*:|#|\/\/|\/)/i.test(href)) return href;
    const [path, hash] = href.split("#");
    if (!path) return href;
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      return href; // malformed escape: leave the link exactly as written
    }
    const target = posix.normalize(posix.join(dir, decoded));
    if (target.startsWith("..")) return href;
    const route = opts.routeFor(target);
    const suffix = hash ? `#${hash}` : "";
    return (route ?? githubBlobUrl(target)) + suffix;
  };
  // Rewrite only outside inline code spans.
  const outsideCode = (line: string, fn: (s: string) => string) =>
    line
      .split(/(`+[^`]*`+)/)
      .map((part, i) => (i % 2 ? part : fn(part)))
      .join("");

  const fence = createFenceTracker();
  return markdown
    .split("\n")
    .map((line) => {
      if (fence.update(line)) return line;
      const ref = /^(\s{0,3}\[[^\]]+\]:\s*)(\S+)(.*)$/.exec(line);
      if (ref) return ref[1] + rewrite(ref[2]) + ref[3];
      return outsideCode(line, (s) =>
        s
          .replace(/\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (_m, href: string, title = "") => `](${rewrite(href)}${title})`)
          .replace(/href="([^"]+)"/g, (_m, href: string) => `href="${rewrite(href)}"`),
      );
    })
    .join("\n");
}
