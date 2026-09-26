/**
 * Post-build guard over dist/: known-format secrets and unredacted home paths.
 * Reports file, line and rule only — never the matched value.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { SITE_ROOT } from "../src/lib/paths.ts";
import { scanForSecrets } from "../src/lib/secret-scan.ts";

const dist = resolve(SITE_ROOT, "dist");
const PRIVATE = [
  { name: "unredacted macOS home path", re: /\/Users\/wfspr\b/ },
  { name: "unredacted Windows profile path", re: /C:(\\\\|\\|\/)Users\1(?!%)[A-Za-z0-9]/ },
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
if (problems) {
  console.error(`[scan-output] ${problems} problem(s) in ${scanned} files (values not shown)`);
  process.exit(1);
}
console.log(`[scan-output] ${scanned} files scanned: no known-format secrets or unredacted private paths`);
