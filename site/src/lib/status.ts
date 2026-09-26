/**
 * Status handling.
 *
 * The raw status text written in a runbook is always displayed verbatim.
 * The normalised value exists only so readers can filter the index; it must
 * never claim more than the raw text does.
 */
export const STATUS_KINDS = ["resolved", "followup", "partial", "unstated"] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];

export const STATUS_LABELS: Record<StatusKind, string> = {
  resolved: "Resolved",
  followup: "Resolved · follow-up",
  partial: "Partial",
  unstated: "Status not stated",
};

export interface NormalisedStatus {
  kind: StatusKind;
  /** True when the raw text was present but did not match any rule. */
  unrecognised: boolean;
}

/**
 * Maps free-text status (e.g. "Fixed / Verified (PASS / CLOSED)",
 * "Completed; credential rotation … remain follow-up work",
 * "Partial / v0.5.2 policy-guard hardening verified",
 * "PASS WITH ACCEPTED EXCEPTIONS") to a StatusKind.
 *
 * Contract:
 *  - raw === undefined            → { kind: "unstated", unrecognised: false }
 *  - text that matches no rule    → { kind: "unstated", unrecognised: true } (build warns)
 *  - never upgrade: anything mentioning remaining work / debt / exceptions must
 *    not be reported as plain "resolved".
 */
export function normaliseStatus(raw: string | undefined): NormalisedStatus {
  if (!raw) return { kind: "unstated", unrecognised: false };
  const s = raw.toLowerCase();

  // Negated or failed outcomes are never mapped: surface them for a human.
  if (/\b(not|never|un(?:resolved|fixed|verified)|failed|failing|broken)\b/.test(s)) return { kind: "unstated", unrecognised: true };
  // Most cautious outcome first: an explicitly partial result stays partial
  // even when part of the work is described as verified.
  if (/\b(partial|investigating|in progress|blocked)\b/.test(s)) return { kind: "partial", unrecognised: false };
  // Remaining work, debt or accepted exceptions must never read as plain "resolved".
  if (/\b(remains?|remaining|debt|exceptions?|follow-?up|outstanding|pending|workaround)\b/.test(s)) {
    return { kind: "followup", unrecognised: false };
  }
  if (/\b(fixed|resolved|completed|closed|pass|verified|healthy)\b/.test(s)) return { kind: "resolved", unrecognised: false };

  return { kind: "unstated", unrecognised: true };
}
