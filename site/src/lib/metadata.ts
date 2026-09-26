/**
 * Derives display metadata from a runbook's own Markdown.
 *
 * Rule: nothing is invented. Every derived field records where it came from so
 * the content report (npm run check:content) can show it for review.
 */
import { AI_TOOLS, matchTerms } from "./taxonomy.ts";
import { cleanHeading, extractHeadings, phasesPresent, sectionDepth, splitSections, type PhaseId } from "./sections.ts";

export type Source = "runbook" | "filename" | "readme-index" | "git" | "policy-override" | "none";

export interface Sourced<T> {
  value: T;
  source: Source;
  note?: string;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** Lines before the first section heading, excluding fenced code. */
function preambleLines(markdown: string): string[] {
  const out: string[] = [];
  for (const line of markdown.split("\n")) {
    if (/^#{2,6}\s/.test(line) || /^\s*(```|~~~)/.test(line)) break;
    out.push(line);
  }
  return out;
}

/**
 * Finds an inline metadata line such as `**Date:** 2026-09-10`, `**Date**: …`
 * or `Date: …`. `key` is a regex fragment matched at the start of the label.
 */
export function findMetaLine(markdown: string, key: string): { label: string; value: string; line: string } | undefined {
  const re = new RegExp(`^\\s*(?:[-*]\\s+)?\\*{0,2}(${key}[^:*\\n]{0,40}?)\\*{0,2}\\s*:\\s*\\*{0,2}\\s*(.+?)\\s*$`, "i");
  for (const line of preambleLines(markdown)) {
    const m = re.exec(line);
    if (m) return { label: m[1].trim(), value: m[2].replace(/\*\*/g, "").trim(), line };
  }
  return undefined;
}

/** Parses the first date in a string; returns ISO date + any remaining qualifier text. */
export function parseDate(text: string): { iso: string; note?: string } | undefined {
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) {
    const note = text.replace(iso[0], "").replace(/^[\s,;—-]+|[\s,;—-]+$/g, "").trim();
    return { iso: iso[0], note: note || undefined };
  }
  const long = /\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/.exec(text);
  if (long) {
    const month = MONTHS.indexOf(long[2].toLowerCase());
    if (month >= 0) {
      const iso = `${long[3]}-${String(month + 1).padStart(2, "0")}-${long[1].padStart(2, "0")}`;
      const note = text.replace(long[0], "").trim();
      return { iso, note: note || undefined };
    }
  }
  return undefined;
}

export function dateFromFilename(filename: string): string | undefined {
  const m = /(\d{4})-?(\d{2})-?(\d{2})/.exec(filename);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Strips inline Markdown to plain text for descriptions and search. */
export function toPlainText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|\s)[*_]([^*_\n]+)[*_]/g, "$1$2")
    .replace(/^>\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** First prose paragraph (or list) of a Markdown fragment. */
export function firstParagraph(md: string): string | undefined {
  const lines = md.split("\n");
  const block: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      if (block.length) break;
      continue;
    }
    if (inFence) continue;
    const trimmed = line.trim();
    if (!block.length && /^>/.test(trimmed)) continue;
    const skippable = trimmed === "" || /^-{3,}$|^\*{3,}$|^_{3,}$/.test(trimmed) || /^#{1,6}\s/.test(trimmed) || /^\|/.test(trimmed) || /^<\/?[a-z]/i.test(trimmed);
    if (skippable) {
      if (block.length) break;
      continue;
    }
    block.push(trimmed.replace(/^[-*+]\s+|^\d+[.)]\s+/, ""));
  }
  const text = toPlainText(block.join(" "));
  return text || undefined;
}

export function truncate(text: string, max = 180): string {
  if (text.length <= max) return text.replace(/:$/, "…");
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ") > max * 0.6 ? cut.lastIndexOf(" ") : max).replace(/[,;:.\s—-]+$/, "") + "…";
}

/** Reading time from actual content: prose at 220 wpm, code counted at half weight. */
export function readingMinutes(md: string): number {
  let prose = 0;
  let code = 0;
  let inFence = false;
  for (const line of md.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    const words = line.split(/\s+/).filter(Boolean).length;
    if (inFence) code += words;
    else prose += words;
  }
  return Math.max(1, Math.round((prose + code * 0.5) / 220));
}

export function wordCount(md: string): number {
  return md.split(/\s+/).filter(Boolean).length;
}

/** Headings that explicitly record credits / provenance (not e.g. "Paid-Credit Incident"). */
export const PROVENANCE = /^(ai\s*\/\s*cli\s+)?credits?\b|provenance/i;

export interface Provenance {
  /** Cleaned heading texts of every credits/provenance section, at any depth. */
  sectionTitles: string[];
  /** AI tools named inside those sections only. */
  tools: string[];
}

export function extractProvenance(markdown: string): Provenance | undefined {
  const titles: string[] = [];
  let text = "";
  let captureDepth = 0;
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const h = !inFence && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      const depth = h[1].length;
      if (captureDepth && depth <= captureDepth) captureDepth = 0;
      if (!captureDepth && PROVENANCE.test(cleanHeading(h[2]))) {
        captureDepth = depth;
        titles.push(cleanHeading(h[2]));
        continue;
      }
    }
    if (captureDepth) text += line + "\n";
  }
  if (!titles.length) return undefined;
  const tools = AI_TOOLS.filter((t) => t.pattern.test(text)).map((t) => t.label);
  return { sectionTitles: [...new Set(titles)], tools };
}

export interface DerivedMeta {
  title: string;
  date: Sourced<string | undefined>;
  statusRaw: Sourced<string | undefined>;
  platformDetail?: string;
  scope?: string;
  summary?: string;
  description: string;
  systems: string[];
  sections: string[];
  phases: Record<PhaseId, string[]>;
  provenance?: Provenance;
  readingMinutes: number;
  words: number;
  warnings: string[];
}

export interface DeriveContext {
  filename: string;
  index?: { date?: string; status?: string };
  gitCreated?: string;
  statusOverride?: string;
}

export function deriveMeta(markdown: string, ctx: DeriveContext): DerivedMeta {
  const warnings: string[] = [];

  const h1 = extractHeadings(markdown).find((h) => h.depth === 1);
  const title = h1 ? toPlainText(h1.text) : ctx.filename.replace(/\.md$/, "");
  if (!h1) warnings.push("no H1 title; using filename");

  // Date: runbook → filename → README index → git.
  let date: Sourced<string | undefined> = { value: undefined, source: "none" };
  const dateLine = findMetaLine(markdown, "Date");
  const parsed = dateLine && parseDate(dateLine.value);
  if (parsed) date = { value: parsed.iso, source: "runbook", note: parsed.note };
  else {
    if (dateLine) warnings.push(`unparsable Date line`);
    const fromName = dateFromFilename(ctx.filename);
    if (fromName) date = { value: fromName, source: "filename" };
    else if (ctx.index?.date) date = { value: ctx.index.date, source: "readme-index" };
    else if (ctx.gitCreated) date = { value: ctx.gitCreated, source: "git", note: "first commit" };
    else warnings.push("no date available");
  }

  // Status: policy override → runbook → README index → none.
  let statusRaw: Sourced<string | undefined> = { value: undefined, source: "none" };
  const statusLine = findMetaLine(markdown, "Status");
  if (ctx.statusOverride) statusRaw = { value: ctx.statusOverride, source: "policy-override" };
  else if (statusLine) statusRaw = { value: statusLine.value, source: "runbook" };
  else if (ctx.index?.status) statusRaw = { value: ctx.index.status, source: "readme-index" };
  else warnings.push("no status stated");

  const platformDetail = findMetaLine(markdown, "Platform")?.value;
  const scope = findMetaLine(markdown, "Scope")?.value;

  const sections = splitSections(markdown);
  const summarySection = sections.find((s) => /\bsummary\b/i.test(s.key)) ??
    sections.find((s) => /^(overview|purpose|objective|goal|problem)\b/i.test(s.key));
  let summary = summarySection ? firstParagraph(summarySection.body) : undefined;
  if (!summary) {
    // Fall back to the first prose paragraph after the metadata lines.
    const pre = preambleLines(markdown)
      .filter((l) => !/^#\s/.test(l) && !/^\s*\*{0,2}[A-Z][A-Za-z /]{1,30}\*{0,2}\s*:/.test(l))
      .join("\n");
    summary = firstParagraph(pre);
  }
  if (!summary) warnings.push("no summary paragraph found");

  const bodyForTerms = sections
    .filter((s) => !PROVENANCE.test(s.key))
    .map((s) => s.body)
    .join("\n");

  return {
    title,
    date,
    statusRaw,
    platformDetail,
    scope,
    summary,
    description: truncate(summary ?? title, 180),
    systems: matchTerms(title, bodyForTerms),
    sections: sections.map((s) => s.key),
    phases: phasesPresent(sections),
    provenance: extractProvenance(markdown),
    readingMinutes: readingMinutes(markdown),
    words: wordCount(markdown),
    warnings,
  };
}

export { cleanHeading, sectionDepth };
