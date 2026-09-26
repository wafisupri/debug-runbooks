/**
 * Runbook discovery: the single entry point used by the Astro content loader,
 * the content report and the tests.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PLATFORMS, REPO_ROOT, type PlatformId } from "./paths.ts";
import { loadPolicy, type ContentPolicy } from "./policy.ts";
import { parseReadmeIndex } from "./readme-index.ts";
import { deriveMeta, findMetaLine, type DerivedMeta } from "./metadata.ts";
import { normaliseStatus, type StatusKind } from "./status.ts";
import { redact } from "./redact.ts";
import { scanForSecrets, type SecretFinding } from "./secret-scan.ts";
import { fileHistories, isShallow, readCommits, type FileHistory } from "./git.ts";

export interface Runbook extends DerivedMeta {
  slug: string;
  repoPath: string;
  platform: PlatformId;
  platformLabel: string;
  status: StatusKind;
  statusUnrecognised: boolean;
  indexed: boolean;
  history?: FileHistory;
  redactions: Record<string, number>;
  /** Source Markdown after redaction (used for rendering and search). */
  markdown: string;
  /** Metadata lines rendered in the page header, removed from the body. */
  headerLines: string[];
}

export interface DiscoveryResult {
  runbooks: Runbook[];
  excluded: string[];
  privateFiles: string[];
  secretFindings: Array<SecretFinding & { file: string }>;
  gitAvailable: boolean;
}

export function discoverRunbooks(policy: ContentPolicy = loadPolicy()): DiscoveryResult {
  const readmePath = join(REPO_ROOT, "README.md");
  const index = existsSync(readmePath) ? parseReadmeIndex(readFileSync(readmePath, "utf8")) : new Map();
  // A shallow clone's history would make every file look created/changed at HEAD.
  const commits = isShallow() ? null : readCommits();
  const histories = commits ? fileHistories(commits) : new Map<string, FileHistory>();

  const runbooks: Runbook[] = [];
  const excluded: string[] = [];
  const privateFiles: string[] = [];
  const secretFindings: DiscoveryResult["secretFindings"] = [];
  const slugs = new Map<string, string>();

  for (const platform of PLATFORMS) {
    const dir = join(REPO_ROOT, platform.id);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md").sort();
    for (const filename of files) {
      const repoPath = `${platform.id}/${filename}`;
      if (policy.exclude.includes(repoPath)) {
        excluded.push(repoPath);
        continue;
      }
      if (policy.private.includes(repoPath)) {
        privateFiles.push(repoPath);
        continue;
      }
      const source = readFileSync(join(dir, filename), "utf8");

      for (const finding of scanForSecrets(source)) secretFindings.push({ ...finding, file: repoPath });

      const { text: markdown, counts } = redact(source, policy.redactions);
      const history = histories.get(repoPath);
      const override = policy.overrides[repoPath];
      const meta = deriveMeta(markdown, {
        filename,
        index: index.get(repoPath),
        gitCreated: history?.created,
        statusOverride: override?.status,
      });
      const status = normaliseStatus(meta.statusRaw.value);
      if (status.unrecognised) meta.warnings.push(`status text not recognised by normaliseStatus(): "${meta.statusRaw.value}"`);

      const slug = filename.replace(/\.md$/, "");
      if (slugs.has(slug)) throw new Error(`Duplicate runbook slug "${slug}": ${slugs.get(slug)} and ${repoPath}`);
      slugs.set(slug, repoPath);

      const headerLines = ["Date", "Status", "Platform", "Scope"]
        .map((k) => findMetaLine(markdown, k)?.line)
        .filter((l): l is string => Boolean(l));

      runbooks.push({
        ...meta,
        slug,
        repoPath,
        platform: platform.id,
        platformLabel: platform.label,
        status: status.kind,
        statusUnrecognised: status.unrecognised,
        indexed: index.has(repoPath),
        history,
        redactions: counts,
        markdown,
        headerLines,
      });
    }
  }

  runbooks.sort((a, b) => (b.date.value ?? "").localeCompare(a.date.value ?? "") || a.title.localeCompare(b.title));
  return { runbooks, excluded, privateFiles, secretFindings, gitAvailable: commits !== null };
}

export function routeForSlug(slug: string): string {
  return `/runbooks/${slug}/`;
}
