import { describe, expect, it } from "vitest";
import { redact } from "../src/lib/redact.ts";
import { scanForSecrets } from "../src/lib/secret-scan.ts";
import { loadPolicy } from "../src/lib/policy.ts";

const { redactions } = loadPolicy();

describe("redaction policy", () => {
  it("replaces the macOS home directory but not similar names", () => {
    expect(redact("cd /Users/wfspr/GitHub/x && ls /Users/wfspr", redactions).text).toBe("cd ~/GitHub/x && ls ~");
    expect(redact("/Users/wfsprx/y", redactions).text).toBe("/Users/wfsprx/y");
  });
  it("replaces Windows profile paths in plain and JSON-escaped form", () => {
    expect(redact(String.raw`C:\Users\1\.config`, redactions).text).toBe(String.raw`%USERPROFILE%\.config`);
    expect(redact(String.raw`"C:\\Users\\1\\AppData"`, redactions).text).toBe(String.raw`"%USERPROFILE%\\AppData"`);
  });
  it("counts replacements per rule", () => {
    expect(redact("/Users/wfspr/a /Users/wfspr/b", redactions).counts).toEqual({ "macos-home": 2 });
  });
});

describe("secret scan", () => {
  it("flags well-known credential formats by name and line only", () => {
    const fake = ["ok", "key=sk-or-v1-" + "0".repeat(48), "ghp_" + "A".repeat(36)].join("\n");
    const findings = scanForSecrets(fake);
    expect(findings).toEqual([
      { line: 2, pattern: "openai-style key" },
      { line: 3, pattern: "github token" },
    ]);
    expect(JSON.stringify(findings)).not.toContain("0000");
  });
  it("does not flag placeholders", () => {
    expect(scanForSecrets('"apiKey": "<OPENROUTER_API_KEY>"\nBearer $TOKEN')).toEqual([]);
  });
});
