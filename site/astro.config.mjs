// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { unified } from "@astrojs/markdown-remark";
import rehypeRunbook from "./src/plugins/rehype-runbook.ts";

/**
 * SITE_URL is the public origin used for canonical URLs, Open Graph URLs and
 * the sitemap (e.g. https://debug-runbooks.example.workers.dev). It is not a
 * secret. When unset, the build still succeeds but omits absolute URLs and
 * the sitemap, and prints a warning.
 */
const site = process.env.SITE_URL?.replace(/\/$/, "") || undefined;
if (!site) console.warn("[debug-runbooks] SITE_URL is not set: canonical URLs, og:url and sitemap.xml will be omitted.");

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: site ? [sitemap()] : [],
  markdown: {
    syntaxHighlight: "shiki",
    shikiConfig: { theme: "css-variables", wrap: false },
    // unified (remark/rehype) processor. SmartyPants is off so that "--flags",
    // quotes and dashes in runbook prose render exactly as written.
    processor: unified({ gfm: true, smartypants: false, rehypePlugins: [rehypeRunbook] }),
  },
  devToolbar: { enabled: false },
});
