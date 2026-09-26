/**
 * Generates src/data/activity.json from local git history at build time.
 *
 * - Shallow clone (common in CI): tries `git fetch --unshallow` (public repo,
 *   no credentials). If history is still incomplete or git is unavailable,
 *   falls back to the committed src/data/activity.snapshot.json and marks the
 *   data as a snapshot so the page can say so.
 * - Run with --snapshot to refresh the committed snapshot.
 */
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SITE_ROOT } from "../src/lib/paths.ts";
import { isShallow, readCommits, tryUnshallow } from "../src/lib/git.ts";
import { aggregateActivity } from "../src/lib/activity.ts";
import { discoverRunbooks } from "../src/lib/runbooks.ts";
import { loadPolicy } from "../src/lib/policy.ts";
import { redact } from "../src/lib/redact.ts";

const out = resolve(SITE_ROOT, "src/data/activity.json");
const snapshot = resolve(SITE_ROOT, "src/data/activity.snapshot.json");

function fallback(reason: string): void {
  console.warn(`[activity] ${reason}`);
  if (!existsSync(snapshot)) throw new Error("[activity] no git history and no committed snapshot; cannot render activity");
  copyFileSync(snapshot, out);
  console.warn("[activity] using committed snapshot (the page will label it as such)");
}

if (isShallow()) {
  console.log("[activity] shallow clone detected; fetching full history…");
  if (!tryUnshallow()) fallback("could not unshallow the clone");
}

if (!isShallow()) {
  const commits = readCommits();
  if (!commits || commits.length === 0) fallback("git history unavailable");
  else {
    const refs = new Map(discoverRunbooks().runbooks.map((r) => [r.repoPath, { slug: r.slug, title: r.title, created: r.history?.created }]));
    const today = new Date().toISOString().slice(0, 10);
    const { redactions } = loadPolicy();
    const safe = commits.map((c) => ({ ...c, subject: redact(c.subject, redactions).text }));
    const activity = aggregateActivity(safe, refs, today);
    writeFileSync(out, JSON.stringify(activity, null, 2) + "\n");
    if (process.argv.includes("--snapshot")) writeFileSync(snapshot, JSON.stringify({ ...activity, source: "snapshot" }, null, 2) + "\n");
    console.log(`[activity] ${activity.totalCommits} commits over ${activity.activeDays} active days (${activity.firstDay} → ${activity.lastDay})`);
  }
}
