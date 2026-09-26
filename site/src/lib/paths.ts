import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Absolute path of the `site/` directory, located by its marker file.
 * Walks up from this module (scripts, tests) and from the working directory
 * (Astro bundles pages into dist/, where the module location differs).
 */
function findSiteRoot(): string {
  for (const start of [dirname(fileURLToPath(import.meta.url)), process.cwd()]) {
    let dir = start;
    for (;;) {
      if (existsSync(resolve(dir, "content-policy.yaml")) && existsSync(resolve(dir, "astro.config.mjs"))) return dir;
      if (existsSync(resolve(dir, "site", "content-policy.yaml"))) return resolve(dir, "site");
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error("Cannot locate the site/ directory (content-policy.yaml not found)");
}

export const SITE_ROOT = findSiteRoot();

/** Absolute path of the repository root (the runbooks live here). */
export const REPO_ROOT = resolve(SITE_ROOT, "..");

/** Platform folders, in display order. The folder is the authoritative platform. */
export const PLATFORMS = [
  { id: "macos", label: "macOS" },
  { id: "windows", label: "Windows" },
  { id: "linux", label: "Linux" },
  { id: "cross-platform", label: "Cross-platform" },
] as const;

export type PlatformId = (typeof PLATFORMS)[number]["id"];

export const REPO_URL = "https://github.com/wafisupri/debug-runbooks";
export const REPO_BRANCH = "main";

export function githubBlobUrl(repoPath: string): string {
  return `${REPO_URL}/blob/${REPO_BRANCH}/${repoPath.split("/").map(encodeURIComponent).join("/")}`;
}

export function githubCommitUrl(hash: string): string {
  return `${REPO_URL}/commit/${hash}`;
}
