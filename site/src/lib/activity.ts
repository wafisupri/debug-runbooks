/**
 * Repository activity, aggregated per calendar day from git history.
 * Author names and emails are never read or stored.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Commit } from "./git.ts";
import { SITE_ROOT } from "./paths.ts";

export interface ActivityRunbookRef {
  slug: string;
  title: string;
}

export interface ActivityDay {
  day: string;
  commits: number;
  added: ActivityRunbookRef[];
  updated: ActivityRunbookRef[];
  /** Files changed that are not published runbooks (indexes, docs, site code). */
  otherFiles: number;
  log: Array<{ short: string; hash: string; subject: string }>;
}

export interface Activity {
  generatedAt: string;
  source: "git" | "snapshot";
  firstDay: string;
  lastDay: string;
  totalCommits: number;
  activeDays: number;
  days: ActivityDay[];
}

/** Every calendar day from first to last (inclusive), so gaps are explicit. */
export function dayRange(first: string, last: string): string[] {
  const out: string[] = [];
  const d = new Date(`${first}T00:00:00Z`);
  const end = new Date(`${last}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * `runbooks` maps current repository paths to refs; `created` is the day the
 * file's history began (renames followed), which decides "added" vs "updated".
 */
export function aggregateActivity(
  commits: Commit[],
  runbooks: Map<string, ActivityRunbookRef & { created?: string }>,
  today: string,
): Activity {
  const byDay = new Map<string, ActivityDay>();
  for (const c of commits) {
    let day = byDay.get(c.day);
    if (!day) {
      day = { day: c.day, commits: 0, added: [], updated: [], otherFiles: 0, log: [] };
      byDay.set(c.day, day);
    }
    day.commits++;
    day.log.push({ short: c.short, hash: c.hash, subject: c.subject });
    for (const f of c.files) {
      const ref = runbooks.get(f.path);
      if (!ref) {
        day.otherFiles++;
        continue;
      }
      const list = ref.created === c.day ? day.added : day.updated;
      if (!list.some((r) => r.slug === ref.slug)) list.push({ slug: ref.slug, title: ref.title });
    }
  }
  // A runbook added and updated on the same day is reported once, as added.
  for (const d of byDay.values()) d.updated = d.updated.filter((u) => !d.added.some((a) => a.slug === u.slug));

  const active = [...byDay.keys()].sort();
  const firstDay = active[0] ?? today;
  const lastActive = active.at(-1) ?? today;
  const lastDay = today > lastActive ? today : lastActive;
  const days = dayRange(firstDay, lastDay).map(
    (day) => byDay.get(day) ?? { day, commits: 0, added: [], updated: [], otherFiles: 0, log: [] },
  );
  return {
    generatedAt: today,
    source: "git",
    firstDay,
    lastDay,
    totalCommits: commits.length,
    activeDays: active.length,
    days,
  };
}

/**
 * Reads build-time activity data: the freshly generated activity.json, or the
 * committed snapshot when git history was unavailable. Throws if neither
 * exists — silently dropping the visualisation would hide a broken build.
 */
export function loadActivity(): Activity {
  for (const name of ["activity.json", "activity.snapshot.json"]) {
    const file = resolve(SITE_ROOT, "src/data", name);
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as Activity;
  }
  throw new Error(`No activity data in ${resolve(SITE_ROOT, "src/data")}; run \`npm run activity\``);
}

/** JSON safe to embed inside a <script> element (no "</script>" break-out). */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
