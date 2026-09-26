/**
 * Section structure of a runbook, derived from its headings.
 *
 * Runbooks use either `## 1. Summary` (template style) or `### Summary`
 * directly under the H1. The "section level" is the shallowest heading level
 * below H1 that the document uses.
 */
export interface Heading {
  depth: number;
  text: string;
}

export interface Section {
  title: string;
  /** Title with numbering like "1. " removed, for matching. */
  key: string;
  body: string;
}

export const PHASES = [
  { id: "observe", label: "Observe", match: /\b(symptom|environment|problem|context|inventory|topology|background|observ)/i },
  { id: "hypothesize", label: "Hypothesize & test", match: /(did not work|didn'?t work|investigat|hypothes|attempt|diagnos|troubleshoot|failed approach)/i },
  { id: "isolate", label: "Isolate", match: /\b(root cause|cause|why it|request lifecycle|finding)/i },
  { id: "remediate", label: "Remediate", match: /\b(final fix|fix|resolution|remediat|commands|implementation|change|repair|hardening|migration|upgrade)/i },
  { id: "verify", label: "Verify", match: /\b(verif|validat|final (working )?state|final state|test|audit|qa\b|pass\b|known-good)/i },
  { id: "document", label: "Document", match: /(if this happens again|lesson|cleanup|clean-up|rollback|follow-up|credit|provenance|recovery check|blocker|risk|next step)/i },
] as const;

export type PhaseId = (typeof PHASES)[number]["id"];

const FENCE = /^\s*(```|~~~)/;

/** Returns ATX headings outside fenced code blocks. */
export function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) headings.push({ depth: m[1].length, text: m[2].trim() });
  }
  return headings;
}

/** Shallowest heading depth below the H1 (defaults to 2). */
export function sectionDepth(headings: Heading[]): number {
  const depths = headings.filter((h) => h.depth > 1).map((h) => h.depth);
  return depths.length ? Math.min(...depths) : 2;
}

export function cleanHeading(text: string): string {
  return text
    .replace(/^\d+(\.\d+)*[.)]?\s+/, "")
    .replace(/[*_`]/g, "")
    .trim();
}

/** Splits the document into top-level sections with their raw Markdown bodies. */
export function splitSections(markdown: string): Section[] {
  const depth = sectionDepth(extractHeadings(markdown));
  const sections: Section[] = [];
  let current: Section | null = null;
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (FENCE.test(line)) inFence = !inFence;
    const m = !inFence && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m && m[1].length <= depth && m[1].length > 1) {
      current = { title: m[2].trim(), key: cleanHeading(m[2]), body: "" };
      sections.push(current);
      continue;
    }
    if (m && m[1].length === 1) {
      current = null;
      continue;
    }
    if (current) current.body += line + "\n";
  }
  return sections;
}

/** Which engineering-loop phases the runbook's own sections cover. Never inferred from prose. */
export function phasesPresent(sections: Section[]): Record<PhaseId, string[]> {
  const result = Object.fromEntries(PHASES.map((p) => [p.id, [] as string[]])) as Record<PhaseId, string[]>;
  for (const section of sections) {
    const phase = PHASES.find((p) => p.match.test(section.key));
    if (phase) result[phase.id].push(section.key);
  }
  return result;
}
