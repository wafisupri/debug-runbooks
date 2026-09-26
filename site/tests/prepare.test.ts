import { describe, expect, it } from "vitest";
import { prepareMarkdown } from "../src/lib/prepare.ts";

const routeFor = (p: string) => (p === "macos/b.md" ? "/runbooks/b/" : undefined);

describe("prepareMarkdown", () => {
  it("normalises section depth and drops decorative rules and the H1", () => {
    const md = "# Title\n---\n\n### Summary\n---\nText\n\n#### Detail\n\nMore\n\n---\n\nAfter rule\n";
    const out = prepareMarkdown(md, { repoPath: "macos/a.md", routeFor, headerLines: [] });
    expect(out).not.toContain("# Title");
    expect(out).toContain("## Summary\nText");
    expect(out).toContain("### Detail");
    expect(out).toContain("---\n\nAfter rule"); // content rules are kept
  });
  it("removes header metadata lines and template '</> Bash' labels only", () => {
    const md = "# T\n\n**Date:** 2026-01-01  \n\n## Commands\n\n```\n</> Bash\n\nls\n```\n\n```text\n</> not a label here\n```\n";
    const out = prepareMarkdown(md, { repoPath: "macos/a.md", routeFor, headerLines: ["**Date:** 2026-01-01  "] });
    expect(out).not.toContain("**Date:**");
    expect(out).toContain("```\n\nls\n```");
    expect(out).toContain("</> not a label here");
  });
  it("rewrites relative links to site routes or GitHub, leaving code untouched", () => {
    const md = "# T\n\nSee [b](b.md#x), [readme](../README.md) and [web](https://example.com).\n\n```\n[b](b.md)\n```\n";
    const out = prepareMarkdown(md, { repoPath: "macos/a.md", routeFor, headerLines: [] });
    expect(out).toContain("[b](/runbooks/b/#x)");
    expect(out).toContain("[readme](https://github.com/wafisupri/debug-runbooks/blob/main/README.md)");
    expect(out).toContain("[web](https://example.com)");
    expect(out).toContain("```\n[b](b.md)\n```");
  });
});

describe("review regressions", () => {
  it("only closes a fence on the same character and length (nested fences stay code)", () => {
    const md = "# T\n\n## A\n\n````md\n```bash\n# inside\n```\n````\n\n~~~\n```\n# also inside\n~~~\n";
    const out = prepareMarkdown(md, { repoPath: "macos/a.md", routeFor, headerLines: [] });
    expect(out).toContain("\n# inside\n");
    expect(out).toContain("\n# also inside\n");
  });
  it("removes header metadata lines from the preamble only, once", () => {
    const md = "# T\n\n**Status:** Fixed\n\n## Notes\n\n**Status:** Fixed\n";
    const out = prepareMarkdown(md, { repoPath: "macos/a.md", routeFor, headerLines: ["**Status:** Fixed"] });
    expect(out.match(/\*\*Status:\*\* Fixed/g)).toHaveLength(1);
    expect(out.indexOf("**Status:**")).toBeGreaterThan(out.indexOf("## Notes"));
  });
  it("does not rewrite links inside inline code, handles reference links and malformed escapes", () => {
    const md = "# T\n\nUse `[y](b.md)` literally; see [b][ref] and [bad](x%E0.md).\n\n[ref]: ./b.md\n";
    const out = prepareMarkdown(md, { repoPath: "macos/a.md", routeFor, headerLines: [] });
    expect(out).toContain("`[y](b.md)`");
    expect(out).toContain("[ref]: /runbooks/b/");
    expect(out).toContain("[bad](x%E0.md)");
  });
});
