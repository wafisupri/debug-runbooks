/**
 * Post-build guard over dist/: known-format secrets and unredacted home paths.
 * Reports file, line and rule only — never the matched value.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { SITE_ROOT } from "../src/lib/paths.ts";
import { scanForSecrets } from "../src/lib/secret-scan.ts";
import { discoverRunbooks } from "../src/lib/runbooks.ts";

const dist = resolve(SITE_ROOT, "dist");
const PRIVATE = [
  { name: "unredacted macOS home path", re: /\\?\/Users\\?\/wfspr\b/ },
  { name: "unredacted Windows profile path", re: /C:(\\\\|\\|\/)Users\1(?!USERNAME\b)[A-Za-z0-9]/ },
  { name: "machine hostname email", re: /@[A-Za-z0-9-]+\.local\b/ },
];

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(html|xml|txt|json|js|css|webmanifest)$/.test(name)) yield p;
  }
}

let problems = 0;
let scanned = 0;
for (const file of files(dist)) {
  scanned++;
  const content = readFileSync(file, "utf8");
  for (const f of scanForSecrets(content)) {
    problems++;
    console.error(`✖ ${relative(dist, file)}:${f.line}  ${f.pattern}`);
  }
  content.split("\n").forEach((line, i) => {
    for (const rule of PRIVATE) {
      if (rule.re.test(line)) {
        problems++;
        console.error(`✖ ${relative(dist, file)}:${i + 1}  ${rule.name}`);
      }
    }
  });
}
// Structural checks: silent degradation should fail the build, not ship.
const home = readFileSync(join(dist, "index.html"), "utf8");
if (!home.includes('id="trace-title"')) {
  problems++;
  console.error("✖ index.html: repository activity trace missing");
}
for (const r of discoverRunbooks().runbooks) {
  if (!existsSync(join(dist, "runbooks", r.slug, "index.html"))) {
    problems++;
    console.error(`✖ missing page for ${r.repoPath}`);
  }
}

// Redaction must leave an explicit literal placeholder in the output.
const terminal = readFileSync(join(dist, "runbooks", "terminal-crash-recovery-runbook", "index.html"), "utf8");
if (!terminal.includes("/Users/USERNAME")) {
  problems++;
  console.error("✖ expected /Users/USERNAME placeholder in a redacted runbook page");
}

const about = readFileSync(join(dist, "about", "index.html"), "utf8");
if (about.includes("data-placeholder")) {
  console.warn("⚠ about/index.html still contains author placeholders — fill them in src/pages/about.astro before publishing");
}

if (problems) {
  console.error(`[scan-output] ${problems} problem(s) in ${scanned} files (values not shown)`);
  process.exit(1);
}
console.log(`[scan-output] ${scanned} files scanned: no known-format secrets or unredacted private paths`);
