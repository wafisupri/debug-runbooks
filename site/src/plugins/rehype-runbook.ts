/**
 * Rehype plugin for runbook presentation. Dependency-free: walks the HAST tree
 * directly. Presentation only — it never changes the text of the runbook.
 *
 * - stable heading ids + visible anchor links (h2–h4)
 * - tables wrapped in a labelled, keyboard-focusable scroll region
 * - code blocks wrapped in a figure with a language label and copy button
 * - blockquote callouts: GitHub `[!NOTE]` syntax, plus ⚠️ / WARNING styling
 * - external links marked and opened safely
 */
import { REPO_URL } from "../lib/paths.ts";

type Node = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};

const el = (tagName: string, properties: Record<string, unknown>, children: Node[] = []): Node => ({ type: "element", tagName, properties, children });
const text = (value: string): Node => ({ type: "text", value });

export function textContent(node: Node): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textContent).join("");
}

/** GitHub-compatible heading slug, so fragment links written against GitHub keep working. */
export function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
      .replace(/ /g, "-") || "section"
  );
}

const LANG_LABELS: Record<string, string> = {
  bash: "bash", sh: "sh", shell: "shell", zsh: "zsh", console: "console", powershell: "PowerShell", ps1: "PowerShell",
  json: "JSON", jsonc: "JSONC", yaml: "YAML", yml: "YAML", toml: "TOML", ts: "TypeScript", typescript: "TypeScript",
  js: "JavaScript", javascript: "JavaScript", mjs: "JavaScript", python: "Python", py: "Python", xml: "XML", ini: "INI",
  diff: "diff", text: "text", plaintext: "text", txt: "text", sql: "SQL", http: "HTTP", env: ".env", dotenv: ".env",
};

const CALLOUT_KINDS: Record<string, "note" | "warning"> = {
  NOTE: "note", TIP: "note", IMPORTANT: "note", WARNING: "warning", CAUTION: "warning",
};

function transformChildren(parent: Node, ids: Map<string, number>): void {
  const children = parent.children ?? [];
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.type !== "element") continue;
    const tag = node.tagName!;

    if (/^h[2-4]$/.test(tag)) {
      const label = textContent(node).trim();
      let id = slugify(label);
      const seen = ids.get(id) ?? 0;
      ids.set(id, seen + 1);
      if (seen) id = `${id}-${seen}`;
      node.properties = { ...node.properties, id };
      node.children = [
        ...(node.children ?? []),
        // Decorative for assistive tech (the TOC provides navigation); keeps the heading's name clean.
        el("a", { className: ["heading-anchor"], href: `#${id}`, ariaHidden: "true", tabIndex: -1 }, [text("#")]),
      ];
      continue;
    }

    if (tag === "table") {
      children[i] = el("div", { className: ["table-scroll"], tabIndex: 0, role: "region", ariaLabel: "Scrollable table" }, [node]);
      continue;
    }

    if (tag === "pre") {
      const lang = String(node.properties?.dataLanguage ?? "").toLowerCase();
      const label = LANG_LABELS[lang] ?? (lang && lang !== "plaintext" ? lang : "text");
      node.properties = { ...node.properties, tabIndex: 0 };
      children[i] = el("figure", { className: ["code-block"], dataLang: lang || "text" }, [
        el("figcaption", { className: ["code-block__bar"] }, [
          el("span", { className: ["code-block__lang"] }, [text(label)]),
          el("button", { type: "button", className: ["code-block__copy"], dataCopy: "" }, [text("Copy")]),
        ]),
        node,
      ]);
      continue;
    }

    if (tag === "blockquote") {
      const first = textContent(node).trim();
      const marker = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i.exec(first);
      let kind: "note" | "warning" = "note";
      if (marker) {
        kind = CALLOUT_KINDS[marker[1].toUpperCase()];
        stripMarker(node);
        node.children = [el("p", { className: ["callout__label"] }, [text(marker[1][0].toUpperCase() + marker[1].slice(1).toLowerCase())]), ...(node.children ?? [])];
      } else if (/^(⚠️|⚠|⏳|warning\b|caution\b|\*\*warning)/i.test(first)) {
        kind = "warning";
      }
      node.properties = { ...node.properties, className: ["callout", `callout--${kind}`] };
      transformChildren(node, ids);
      continue;
    }

    if (tag === "a") {
      const href = String(node.properties?.href ?? "");
      if (/^https?:\/\//.test(href)) {
        node.properties = {
          ...node.properties,
          rel: ["noopener", "noreferrer"],
          className: [...((node.properties?.className as string[]) ?? []), href.startsWith(REPO_URL) ? "link-github" : "link-external"],
        };
      }
    }

    transformChildren(node, ids);
  }
}

function stripMarker(node: Node): void {
  const stack = [...(node.children ?? [])];
  while (stack.length) {
    const n = stack.shift()!;
    if (n.type === "text" && n.value && /\[!\w+\]/.test(n.value)) {
      n.value = n.value.replace(/\s*\[!\w+\]\s*/, "");
      return;
    }
    stack.unshift(...(n.children ?? []));
  }
}

export default function rehypeRunbook() {
  return (tree: Node) => transformChildren(tree, new Map());
}
