import type { RedactionRule } from "./policy.ts";

export interface RedactionResult {
  text: string;
  /** Number of replacements per rule id. */
  counts: Record<string, number>;
}

/** Applies render-time redactions. Never logs matched values. */
export function redact(text: string, rules: RedactionRule[]): RedactionResult {
  const counts: Record<string, number> = {};
  let out = text;
  for (const rule of rules) {
    const re = new RegExp(rule.pattern, "g");
    let n = 0;
    out = out.replace(re, () => {
      n++;
      return rule.replacement;
    });
    if (n) counts[rule.id] = n;
  }
  return { text: out, counts };
}
