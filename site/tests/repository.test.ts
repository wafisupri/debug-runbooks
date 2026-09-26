/** Integration checks against the real runbooks in this repository. */
import { describe, expect, it } from "vitest";
import { discoverRunbooks } from "../src/lib/runbooks.ts";

const result = discoverRunbooks();

describe("repository content", () => {
  it("publishes runbooks and never the templates or folder indexes", () => {
    expect(result.runbooks.length).toBeGreaterThan(0);
    expect(result.runbooks.some((r) => /readme|template/i.test(r.repoPath))).toBe(false);
  });
  it("contains no known-format secrets", () => {
    expect(result.secretFindings).toEqual([]);
  });
  it("leaves no unredacted local home paths in published Markdown", () => {
    for (const r of result.runbooks) {
      expect(r.markdown, r.repoPath).not.toMatch(/\/Users\/wfspr\b/);
      expect(r.markdown, r.repoPath).not.toMatch(/C:(\\\\|\\|\/)Users\1(?!USERNAME\b)[^\\/\s"'`]+/);
    }
  });
  it("gives every runbook a date and a summary", () => {
    for (const r of result.runbooks) {
      expect(r.date.value, r.repoPath).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.summary, r.repoPath).toBeTruthy();
    }
  });
  it("recognises every status text written in the repository (normaliseStatus)", () => {
    const unrecognised = result.runbooks.filter((r) => r.statusUnrecognised).map((r) => `${r.repoPath}: ${r.statusRaw.value}`);
    expect(unrecognised).toEqual([]);
  });
});
