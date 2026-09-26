/**
 * Systems taxonomy.
 *
 * Every term below was observed in the repository's runbooks at the time of
 * writing. A term is attached to a runbook only when the runbook's title names
 * it, or its body (excluding credits/provenance sections) mentions it at least
 * MIN_MENTIONS times. Terms with zero attached runbooks are never rendered.
 */
export const MIN_MENTIONS = 3;

export const GROUPS = [
  { id: "agents", label: "Agent runtimes & AI CLIs" },
  { id: "gateways", label: "Model gateways & routers" },
  { id: "auth", label: "Authentication & secrets" },
  { id: "integration", label: "Protocols & integrations" },
  { id: "runtime", label: "Service management & runtime" },
  { id: "network", label: "Networking" },
] as const;

export type GroupId = (typeof GROUPS)[number]["id"];

export interface Term {
  id: string;
  label: string;
  group: GroupId;
  pattern: RegExp;
}

export const TERMS: Term[] = [
  { id: "claude-code", label: "Claude Code", group: "agents", pattern: /\bClaude Code\b/g },
  { id: "openclaude", label: "OpenClaude", group: "agents", pattern: /\bOpenClaude\b/gi },
  { id: "opencode", label: "OpenCode", group: "agents", pattern: /\bOpenCode\b/gi },
  { id: "kimi-code", label: "Kimi Code", group: "agents", pattern: /\bKimi Code\b/gi },
  { id: "codex", label: "Codex CLI", group: "agents", pattern: /\bCodex\b/gi },
  { id: "hermes-agent", label: "Hermes Agent", group: "agents", pattern: /\bHermes\b/gi },
  { id: "openclaw", label: "OpenClaw", group: "agents", pattern: /\bOpenClaw\b/gi },
  { id: "chatgpt-desktop", label: "ChatGPT Desktop", group: "agents", pattern: /\bChatGPT Desktop\b/gi },
  { id: "gemini-cli", label: "Gemini CLI", group: "agents", pattern: /\bGemini CLI\b/gi },
  { id: "copilot-cli", label: "GitHub Copilot CLI", group: "agents", pattern: /\bCopilot\b/gi },

  { id: "omniroute", label: "OmniRoute", group: "gateways", pattern: /\bOmniRoute\b/gi },
  { id: "9router", label: "9Router", group: "gateways", pattern: /\b9Router\b/gi },
  { id: "freellm", label: "FreeLLM", group: "gateways", pattern: /\bFreeLLM\b/gi },
  { id: "tokenrouter", label: "TokenRouter", group: "gateways", pattern: /\bTokenRouter\b/gi },
  { id: "openrouter", label: "OpenRouter", group: "gateways", pattern: /\bOpenRouter\b/gi },
  { id: "fcc", label: "Free Claude Code (FCC)", group: "gateways", pattern: /\bFCC\b/g },
  { id: "vercel-ai-gateway", label: "Vercel AI Gateway", group: "gateways", pattern: /\bVercel AI Gateway\b/gi },
  { id: "bai", label: "B.AI", group: "gateways", pattern: /\bB\.AI\b/g },
  { id: "universal-launcher", label: "Universal AI CLI Launcher", group: "gateways", pattern: /\bUniversal AI (CLI )?(Gateway )?Launcher\b/gi },
  { id: "f0d", label: "Stage F0D policy gateway", group: "gateways", pattern: /\bF0D\b/g },

  { id: "oauth", label: "OAuth", group: "auth", pattern: /\bOAuth\b/gi },
  { id: "keychain", label: "macOS Keychain", group: "auth", pattern: /\bKeychain\b/gi },
  { id: "secretref", label: "SecretRef", group: "auth", pattern: /\bSecretRefs?\b/g },

  { id: "mcp", label: "MCP", group: "integration", pattern: /\bMCP\b/g },
  { id: "composio", label: "Composio", group: "integration", pattern: /\bComposio\b/gi },

  { id: "launchd", label: "launchd / LaunchAgents", group: "runtime", pattern: /\b(launchd|LaunchAgents?|launchctl)\b/gi },
  { id: "pm2", label: "PM2", group: "runtime", pattern: /\bPM2\b/gi },
  { id: "nodejs", label: "Node.js runtime", group: "runtime", pattern: /\bNode\.js\b/gi },
  { id: "homebrew", label: "Homebrew", group: "runtime", pattern: /\bHomebrew\b/gi },

  { id: "loopback", label: "Loopback binding", group: "network", pattern: /\b(loopback|127\.0\.0\.1|0\.0\.0\.0)\b/gi },
];

/** AI tools recognised inside explicit Credits / Provenance sections only. */
export const AI_TOOLS: Array<{ label: string; pattern: RegExp }> = [
  { label: "ChatGPT", pattern: /\bChatGPT\b/i },
  { label: "Claude Code", pattern: /\bClaude Code\b/i },
  { label: "Claude", pattern: /\bClaude\b(?! Code)(?!\s*Desktop)/ },
  { label: "Codex", pattern: /\bCodex\b/i },
  { label: "Antigravity", pattern: /\bAntigravity\b/i },
  { label: "Gemini", pattern: /\bGemini\b/i },
  { label: "GitHub Copilot", pattern: /\bCopilot\b/i },
  { label: "Hermes Agent", pattern: /\bHermes\b/i },
  { label: "Kimi Code", pattern: /\bKimi Code\b/i },
  { label: "OpenClaude", pattern: /\bOpenClaude\b/i },
  { label: "OpenCode", pattern: /\bOpenCode\b/i },
  { label: "Cursor", pattern: /\bCursor\b/ },
];

export function countMentions(text: string, pattern: RegExp): number {
  return text.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g"))?.length ?? 0;
}

export function matchTerms(title: string, body: string): string[] {
  return TERMS.filter((t) => countMentions(title, t.pattern) > 0 || countMentions(body, t.pattern) >= MIN_MENTIONS).map((t) => t.id);
}

export function termById(id: string): Term | undefined {
  return TERMS.find((t) => t.id === id);
}
