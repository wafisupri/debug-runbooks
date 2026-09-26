import { describe, expect, it } from "vitest";
import { dateFromFilename, deriveMeta, extractProvenance, findMetaLine, firstParagraph, parseDate, readingMinutes } from "../src/lib/metadata.ts";

describe("inline metadata lines", () => {
  it("reads **Key:** value, **Key**: value and plain Key: value", () => {
    expect(findMetaLine("# T\n\n**Date:** 2026-09-10  \n", "Date")?.value).toBe("2026-09-10");
    expect(findMetaLine("# T\n\n**Date**: 2026-09-06\n", "Date")?.value).toBe("2026-09-06");
    expect(findMetaLine("# T\n\nDate: 2026-08-30\nPlatform: macOS\n", "Platform")?.value).toBe("macOS");
  });
  it("ignores lines inside sections and code", () => {
    expect(findMetaLine("# T\n\n## Env\n\n**Status:** nope\n", "Status")).toBeUndefined();
    expect(findMetaLine("# T\n```\nStatus: nope\n```\n", "Status")).toBeUndefined();
  });
});

describe("dates", () => {
  it("keeps qualifiers as notes instead of discarding them", () => {
    expect(parseDate("2026-09-07 (final correction: 2026-09-08)")).toEqual({ iso: "2026-09-07", note: "(final correction: 2026-09-08)" });
    expect(parseDate("7 August 2026")).toEqual({ iso: "2026-08-07" });
    expect(parseDate("sometime soon")).toBeUndefined();
  });
  it("derives dates from filenames in both naming styles", () => {
    expect(dateFromFilename("kimi-recovery-2026-08-25.md")).toBe("2026-08-25");
    expect(dateFromFilename("2026-08-23-pm2-setup.md")).toBe("2026-08-23");
    expect(dateFromFilename("localhost-hardening-20260906.md")).toBe("2026-09-06");
    expect(dateFromFilename("terminal-crash-recovery-runbook.md")).toBeUndefined();
  });
  it("falls back runbook → filename → README index → git, recording the source", () => {
    const md = "# T\n\n## Summary\n\nText.\n";
    expect(deriveMeta(md, { filename: "x-2026-08-01.md", index: { date: "2026-08-02" } }).date).toMatchObject({ value: "2026-08-01", source: "filename" });
    expect(deriveMeta(md, { filename: "x.md", index: { date: "2026-08-02" } }).date).toMatchObject({ value: "2026-08-02", source: "readme-index" });
    expect(deriveMeta(md, { filename: "x.md", gitCreated: "2026-08-03" }).date).toMatchObject({ value: "2026-08-03", source: "git" });
    expect(deriveMeta(md, { filename: "x.md" }).warnings).toContain("no date available");
  });
});

describe("status source", () => {
  it("prefers the runbook, then the README index, and never invents one", () => {
    const withStatus = "# T\n\n**Status:** Partial\n\n## Summary\n\nx\n";
    expect(deriveMeta(withStatus, { filename: "a.md", index: { status: "Fixed" } }).statusRaw).toEqual({ value: "Partial", source: "runbook" });
    expect(deriveMeta("# T\n\n## Summary\n\nx\n", { filename: "a.md", index: { status: "Fixed" } }).statusRaw).toEqual({ value: "Fixed", source: "readme-index" });
    expect(deriveMeta("# T\n\n## Summary\n\nx\n", { filename: "a.md" }).statusRaw).toEqual({ value: undefined, source: "none" });
  });
});

describe("summary", () => {
  it("takes the first paragraph of the summary section, skipping rules and callouts", () => {
    expect(firstParagraph("---\n> ⏳ note\n\nFirst **bold** [link](x).\nSecond line.\n\nNext para.")).toBe("First bold link. Second line.");
  });
});

describe("provenance", () => {
  it("only reads explicit credits/provenance sections, at any depth", () => {
    const md = "# T\n## 13. OpenRouter Paid-Credit Incident\nChatGPT was not involved here\n## Notes\n### Credits and references\n- ChatGPT (guidance)\n- Codex CLI\n## Other\nClaude Code mentioned elsewhere\n";
    expect(extractProvenance(md)).toEqual({ sectionTitles: ["Credits and references"], tools: ["ChatGPT", "Codex"] });
  });
  it("returns undefined when a runbook has no credits section", () => {
    expect(extractProvenance("# T\n## Summary\nChatGPT\n")).toBeUndefined();
  });
});

describe("reading time", () => {
  it("is computed from content and never below one minute", () => {
    expect(readingMinutes("word ".repeat(10))).toBe(1);
    expect(readingMinutes("word ".repeat(660))).toBe(3);
  });
});
