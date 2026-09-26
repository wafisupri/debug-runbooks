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

  // TODO(you): decide the mapping rules — see the hand-off note in the
  // implementation report. Order matters: check the most cautious outcomes first.

  return { kind: "unstated", unrecognised: true };
}
