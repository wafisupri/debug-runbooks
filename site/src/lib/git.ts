import { execFileSync } from "node:child_process";
import { REPO_ROOT } from "./paths.ts";

export interface FileChange {
  /** A, M, D, R (rename), C (copy) … */
  status: string;
  path: string;
  oldPath?: string;
}

export interface Commit {
  hash: string;
  short: string;
  /** Author date as ISO 8601 with the author's own UTC offset. */
  date: string;
  /** Calendar day in the author's local time (YYYY-MM-DD). */
  day: string;
  subject: string;
  files: FileChange[];
}

function git(args: string[]): string {
  return execFileSync("git", ["-c", "core.quotePath=false", "-C", REPO_ROOT, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

export function isShallow(): boolean {
  try {
    return git(["rev-parse", "--is-shallow-repository"]).trim() === "true";
  } catch {
    return false;
  }
}

export function tryUnshallow(): boolean {
  try {
    git(["fetch", "--unshallow", "--quiet"]);
    return !isShallow();
  } catch {
    return false;
  }
}

/**
 * Reads commit history. Deliberately excludes author name and email:
 * author metadata can contain machine hostnames and is never published.
 * Returns null when git history is unavailable.
 */
export function readCommits(): Commit[] | null {
  let out: string;
  try {
    out = git(["log", "--no-merges", "-M", "--format=%x1e%H%x1f%h%x1f%aI%x1f%s", "--name-status"]);
  } catch {
    return null;
  }
  const commits: Commit[] = [];
  for (const record of out.split("\x1e")) {
    if (!record.trim()) continue;
    const [header, ...rest] = record.split("\n");
    const [hash, short, date, subject] = header.split("\x1f");
    const files: FileChange[] = [];
    for (const line of rest) {
      if (!line.trim()) continue;
      const parts = line.split("\t");
      const status = parts[0][0];
      if ((status === "R" || status === "C") && parts.length >= 3) files.push({ status, oldPath: parts[1], path: parts[2] });
      else files.push({ status, path: parts[1] });
    }
    commits.push({ hash, short, date, day: date.slice(0, 10), subject, files });
  }
  return commits;
}

export interface FileHistory {
  created?: string;
  updated?: string;
  commits: number;
}

/** First/last commit day for every current path, following renames. */
export function fileHistories(commits: Commit[]): Map<string, FileHistory> {
  const byPath = new Map<string, FileHistory>();
  // Walk oldest → newest so renames can carry history forward.
  for (const commit of [...commits].reverse()) {
    for (const f of commit.files) {
      let h = byPath.get(f.path);
      if (!h && f.oldPath) {
        h = byPath.get(f.oldPath);
        if (h) byPath.delete(f.oldPath);
      }
      h ??= { commits: 0 };
      h.created ??= commit.day;
      h.updated = commit.day;
      h.commits++;
      byPath.set(f.path, h);
    }
  }
  return byPath;
}
