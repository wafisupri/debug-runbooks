import { defineCollection } from "astro:content";
import type { Loader } from "astro/loaders";
import { discoverRunbooks, routeForSlug } from "./lib/runbooks.ts";
import { prepareMarkdown } from "./lib/prepare.ts";

/**
 * Loads runbooks directly from the repository folders (../macos, …).
 * Source Markdown is read-only; presentation changes happen in prepareMarkdown().
 */
const runbookLoader: Loader = {
  name: "debug-runbooks",
  async load({ store, renderMarkdown, logger, generateDigest }) {
    const result = discoverRunbooks();
    if (result.secretFindings.length) {
      for (const f of result.secretFindings) logger.error(`possible secret: ${f.file}:${f.line} (${f.pattern}) — value not shown`);
      throw new Error(`Refusing to build: ${result.secretFindings.length} possible secret(s) in runbook sources.`);
    }
    if (!result.gitAvailable) logger.warn("git history unavailable: file history metadata omitted");

    const routes = new Map(result.runbooks.map((r) => [r.repoPath, routeForSlug(r.slug)]));
    store.clear();
    for (const runbook of result.runbooks) {
      for (const w of runbook.warnings) logger.warn(`${runbook.repoPath}: ${w}`);
      const body = prepareMarkdown(runbook.markdown, {
        repoPath: runbook.repoPath,
        routeFor: (p) => routes.get(p),
        headerLines: runbook.headerLines,
      });
      const { markdown: _source, ...data } = runbook;
      store.set({
        id: runbook.slug,
        data: data as unknown as Record<string, unknown>,
        body,
        digest: generateDigest(body),
        rendered: await renderMarkdown(body),
      });
    }
  },
};

export const collections = {
  runbooks: defineCollection({ loader: runbookLoader }),
};
