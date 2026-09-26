import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of the `site/` directory. */
export const SITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

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
