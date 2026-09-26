import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { SITE_ROOT } from "./paths.ts";

export interface RedactionRule {
  id: string;
  description?: string;
  pattern: string;
  replacement: string;
  /** Extra RegExp flags, e.g. "i". "g" is always applied. */
  flags?: string;
}

export interface RunbookOverride {
  status?: string;
  reason?: string;
}

export interface ContentPolicy {
  exclude: string[];
  private: string[];
  redactions: RedactionRule[];
  overrides: Record<string, RunbookOverride>;
}

/** Loads and validates content-policy.yaml. Invalid policy fails the build. */
export function loadPolicy(path = resolve(SITE_ROOT, "content-policy.yaml")): ContentPolicy {
  const raw = (parse(readFileSync(path, "utf8")) ?? {}) as Partial<ContentPolicy>;
  const policy: ContentPolicy = {
    exclude: raw.exclude ?? [],
    private: raw.private ?? [],
    redactions: raw.redactions ?? [],
    overrides: raw.overrides ?? {},
  };
  for (const rule of policy.redactions) {
    if (!rule.id || typeof rule.pattern !== "string" || typeof rule.replacement !== "string") {
      throw new Error(`content-policy.yaml: redaction rule is missing id/pattern/replacement: ${JSON.stringify(rule)}`);
    }
    new RegExp(rule.pattern, "g" + (rule.flags ?? "")); // throws on an invalid expression
  }
  for (const [path, override] of Object.entries(policy.overrides)) {
    if (!override?.reason) {
      throw new Error(`content-policy.yaml: override for ${path} must record a reason`);
    }
  }
  return policy;
}
