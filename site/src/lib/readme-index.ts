/**
 * Parses the root README.md index tables (HTML <table> rows of
 * Date | Runbook link | Status). Used only as a *fallback* source for date and
 * status when a runbook does not state them itself.
 */
export interface IndexEntry {
  path: string;
  date?: string;
  status?: string;
}

const ROW = /<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g;

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseReadmeIndex(readme: string): Map<string, IndexEntry> {
  const map = new Map<string, IndexEntry>();
  for (const m of readme.matchAll(ROW)) {
    const href = /href="([^"]+\.md)"/.exec(m[2])?.[1];
    if (!href) continue;
    const date = stripTags(m[1]);
    const status = stripTags(m[3]);
    map.set(href, {
      path: href,
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
      status: status && status !== "—" ? status : undefined,
    });
  }
  return map;
}
