/**
 * Prints every published runbook's derived metadata with its source, plus
 * warnings. Review this before publishing. Exits non-zero on secret findings.
 * Usage: npm run check:content [-- --json]
 */
import { discoverRunbooks } from "../src/lib/runbooks.ts";
import { STATUS_LABELS } from "../src/lib/status.ts";

const result = discoverRunbooks();
const json = process.argv.includes("--json");

if (json) {
  console.log(JSON.stringify(result.runbooks.map(({ markdown, ...r }) => r), null, 2));
} else {
  for (const r of result.runbooks) {
    const phases = Object.entries(r.phases).map(([p, s]) => (s.length ? p[0].toUpperCase() : "·")).join("");
    console.log(`\n■ ${r.repoPath}`);
    console.log(`  title    ${r.title}`);
    console.log(`  date     ${r.date.value ?? "—"}  [${r.date.source}]${r.date.note ? `  note: ${r.date.note}` : ""}`);
    console.log(`  status   ${STATUS_LABELS[r.status]}  ← "${r.statusRaw.value ?? "—"}"  [${r.statusRaw.source}]`);
    console.log(`  platform ${r.platformLabel}${r.platformDetail ? `  (${r.platformDetail})` : ""}`);
    console.log(`  systems  ${r.systems.join(", ") || "—"}`);
    console.log(`  phases   ${phases}  (O H I R V D)   sections: ${r.sections.length}   ≈${r.readingMinutes} min   ${r.words} words`);
    console.log(`  summary  ${r.description}`);
    if (r.provenance) console.log(`  credits  "${r.provenance.sectionTitles.join(" + ")}" → ${r.provenance.tools.join(", ") || "(no AI tool names found)"}`);
    if (Object.keys(r.redactions).length) console.log(`  redacted ${Object.entries(r.redactions).map(([k, v]) => `${k}×${v}`).join(", ")}`);
    if (!r.indexed) console.log(`  ! not listed in root README index`);
    for (const w of r.warnings) console.log(`  ! ${w}`);
  }
  const byStatus = Object.fromEntries(Object.keys(STATUS_LABELS).map((k) => [k, result.runbooks.filter((r) => r.status === k).length]));
  console.log(`\n${result.runbooks.length} published · ${result.excluded.length} excluded · ${result.privateFiles.length} private · git ${result.gitAvailable ? "available" : "UNAVAILABLE"}`);
  console.log(`status: ${JSON.stringify(byStatus)}`);
}

if (result.secretFindings.length) {
  console.error(`\n✖ ${result.secretFindings.length} possible secret(s) in source (values not shown):`);
  for (const f of result.secretFindings) console.error(`  ${f.file}:${f.line}  ${f.pattern}`);
  process.exit(1);
}
