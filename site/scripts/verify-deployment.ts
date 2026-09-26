/**
 * Verifies a deployed copy of the site (preview or production).
 * Usage: node scripts/verify-deployment.ts https://<host> [--expect-site-url https://<canonical-origin>]
 *
 * Checks what a successful deploy must prove, not just that it answers:
 * home page, security headers, activity source, runbook pages, 404 handling,
 * robots/sitemap/canonical behaviour, hashed assets, and privacy.
 */
import { discoverRunbooks } from "../src/lib/runbooks.ts";

const base = process.argv[2]?.replace(/\/$/, "");
const siteArg = process.argv.indexOf("--expect-site-url");
const expectedSite = siteArg > 0 ? process.argv[siteArg + 1]?.replace(/\/$/, "") : undefined;
if (!base || !/^https?:\/\//.test(base)) {
  console.error("usage: node scripts/verify-deployment.ts https://<host> [--expect-site-url https://<origin>]");
  process.exit(2);
}

let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "✔" : "✖"} ${label}${detail ? ` — ${detail}` : ""}`);
};

async function get(path: string, redirect: RequestRedirect = "follow") {
  const res = await fetch(base + path, { redirect, headers: { "user-agent": "debug-runbooks-verify" } });
  return { res, body: res.headers.get("content-type")?.includes("text") ? await res.text() : "" };
}

const home = await get("/");
check(home.res.status === 200, "home page returns 200", String(home.res.status));
const h = home.res.headers;
check(h.get("x-content-type-options") === "nosniff", "X-Content-Type-Options: nosniff", h.get("x-content-type-options") ?? "missing");
check(h.get("referrer-policy") === "strict-origin-when-cross-origin", "Referrer-Policy", h.get("referrer-policy") ?? "missing");
check(Boolean(h.get("permissions-policy")), "Permissions-Policy present", h.get("permissions-policy") ?? "missing");
check(h.get("x-frame-options") === "DENY", "X-Frame-Options: DENY", h.get("x-frame-options") ?? "missing");

const source = /From git history|Snapshot as of/.exec(home.body)?.[0];
check(source === "From git history", "activity trace built from git history (not the snapshot fallback)", source ?? "trace not found");

const canonical = /<link rel="canonical" href="([^"]+)"/.exec(home.body)?.[1];
if (expectedSite) check(canonical === `${expectedSite}/`, "canonical URL uses SITE_URL", canonical ?? "missing");
else check(canonical === undefined, "no canonical emitted (SITE_URL unset)", canonical ?? "none");

const robots = await get("/robots.txt");
check(robots.res.status === 200 && robots.body.includes("User-agent: *"), "robots.txt served", String(robots.res.status));
const sitemap = await get("/sitemap-index.xml");
if (expectedSite) {
  check(sitemap.res.status === 200, "sitemap-index.xml served", String(sitemap.res.status));
  check(robots.body.includes(`Sitemap: ${expectedSite}/sitemap-index.xml`), "robots.txt points at the sitemap");
} else {
  check(sitemap.res.status === 404, "no sitemap without SITE_URL", String(sitemap.res.status));
}

const missing = await get("/this-page-does-not-exist/");
check(missing.res.status === 404, "unknown path returns HTTP 404", String(missing.res.status));
check(missing.body.includes("No runbook at this address"), "404 uses the site's 404 page");

const noSlash = await get("/runbooks", "manual");
check([301, 302, 307, 308].includes(noSlash.res.status), "/runbooks redirects to /runbooks/", `${noSlash.res.status} → ${noSlash.res.headers.get("location") ?? ""}`);

const runbooks = discoverRunbooks().runbooks;
let pagesOk = 0;
let privacy = 0;
for (const r of runbooks) {
  const page = await get(`/runbooks/${r.slug}/`);
  if (page.res.status === 200 && page.body.includes("</article>")) pagesOk++;
  if (/\\?\/Users\\?\/wfspr\b/.test(page.body) || /C:(\\\\|\\|\/)Users\1(?!USERNAME\b)[A-Za-z0-9]/i.test(page.body)) privacy++;
}
check(pagesOk === runbooks.length, "every runbook page returns 200", `${pagesOk}/${runbooks.length}`);
check(privacy === 0, "no unredacted home paths in served runbook pages", `${privacy} page(s)`);

for (const path of ["/runbooks/", "/systems/", "/about/"]) {
  const p = await get(path);
  check(p.res.status === 200, `${path} returns 200`, String(p.res.status));
}
const about = await get("/about/");
check(about.body.includes('href="mailto:wafi.supri@outlook.com"') && !about.body.includes("data-placeholder"), "About page links present, no placeholders");

const asset = /\/_astro\/[^"')\s]+\.(?:css|woff2)/.exec(home.body)?.[0];
if (asset) {
  const a = await fetch(base + asset);
  check(a.status === 200, "hashed asset served", `${asset} ${a.status}`);
  check((a.headers.get("cache-control") ?? "").includes("immutable"), "hashed asset cached immutably", a.headers.get("cache-control") ?? "missing");
} else check(false, "hashed asset referenced from home page");

console.log(failures ? `\n${failures} check(s) failed` : "\nall deployment checks passed");
process.exit(failures ? 1 : 0);
