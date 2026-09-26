/**
 * Detects well-known credential formats. Findings report the pattern name and
 * line number only — never the matched value — so build logs stay clean.
 * A clean scan is not proof of absence; it catches common, high-signal formats.
 */
export const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "openai-style key", re: /\bsk-(?:proj-|or-v1-|ant-)?[A-Za-z0-9_-]{20,}/ },
  { name: "github token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/ },
  { name: "aws access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "google api key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "jwt", re: /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "bearer token", re: /\bBearer\s+[A-Za-z0-9._~+/-]{30,}=*/ },
  { name: "groq key", re: /\bgsk_[A-Za-z0-9]{30,}/ },
  { name: "nvidia key", re: /\bnvapi-[A-Za-z0-9_-]{30,}/ },
  { name: "huggingface token", re: /\bhf_[A-Za-z0-9]{30,}/ },
  { name: "npm token", re: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { name: "gitlab token", re: /\bglpat-[A-Za-z0-9_-]{20,}/ },
  { name: "stripe live key", re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}/ },
  { name: "vercel key", re: /\bvck_[A-Za-z0-9]{20,}/ },
  { name: "private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----/ },
];

export interface SecretFinding {
  line: number;
  pattern: string;
}

export function scanForSecrets(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    for (const { name, re } of SECRET_PATTERNS) {
      if (re.test(line)) findings.push({ line: i + 1, pattern: name });
    }
  });
  return findings;
}
