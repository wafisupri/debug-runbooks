import { describe, expect, it } from "vitest";
import { aggregateActivity, dayRange } from "../src/lib/activity.ts";
import type { Commit } from "../src/lib/git.ts";

const commit = (day: string, files: Commit["files"], subject = "docs: x"): Commit => ({
  hash: day.replaceAll("-", "") + "0".repeat(32),
  short: day.slice(5).replace("-", ""),
  date: `${day}T10:00:00+08:00`,
  day,
  subject,
  files,
});

describe("activity aggregation", () => {
  const refs = new Map([
    ["macos/a.md", { slug: "a", title: "A", created: "2026-08-01" }],
    ["macos/b.md", { slug: "b", title: "B", created: "2026-08-03" }],
  ]);
  const commits = [
    commit("2026-08-03", [{ status: "A", path: "macos/b.md" }, { status: "M", path: "README.md" }]),
    commit("2026-08-03", [{ status: "M", path: "macos/b.md" }]),
    commit("2026-08-01", [{ status: "A", path: "macos/a.md" }]),
  ];
  const activity = aggregateActivity(commits, refs, "2026-08-05");

  it("includes every calendar day, with explicit zero days", () => {
    expect(activity.days.map((d) => d.day)).toEqual(dayRange("2026-08-01", "2026-08-05"));
    expect(activity.days[1]).toMatchObject({ day: "2026-08-02", commits: 0, added: [], updated: [] });
  });
  it("counts commits and classifies runbooks as added on their first day only once", () => {
    const d3 = activity.days.find((d) => d.day === "2026-08-03")!;
    expect(d3.commits).toBe(2);
    expect(d3.added).toEqual([{ slug: "b", title: "B" }]);
    expect(d3.updated).toEqual([]);
    expect(d3.otherFiles).toBe(1);
  });
  it("reports totals without author metadata", () => {
    expect(activity).toMatchObject({ totalCommits: 3, activeDays: 2, firstDay: "2026-08-01", lastDay: "2026-08-05" });
    expect(JSON.stringify(activity)).not.toMatch(/author|@/);
  });
  it("handles an empty history", () => {
    const empty = aggregateActivity([], new Map(), "2026-08-05");
    expect(empty.days).toHaveLength(1);
    expect(empty.totalCommits).toBe(0);
  });
});

import { jsonForScript } from "../src/lib/activity.ts";

describe("jsonForScript", () => {
  it("cannot close the surrounding script element", () => {
    const out = jsonForScript({ subject: "docs: </script><script>alert(1)</script>" });
    expect(out).not.toContain("</script");
    expect(JSON.parse(out).subject).toBe("docs: </script><script>alert(1)</script>");
  });
});
