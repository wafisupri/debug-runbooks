import { getCollection, type CollectionEntry } from "astro:content";
import type { Runbook } from "./runbooks.ts";

export type RunbookData = Omit<Runbook, "markdown">;
export type RunbookEntry = Omit<CollectionEntry<"runbooks">, "data"> & { data: RunbookData };

/** All published runbooks, newest first. */
export async function getRunbooks(): Promise<RunbookEntry[]> {
  const entries = (await getCollection("runbooks")) as unknown as RunbookEntry[];
  return entries.sort(
    (a, b) => (b.data.date.value ?? "").localeCompare(a.data.date.value ?? "") || a.data.title.localeCompare(b.data.title),
  );
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function formatDate(iso?: string): string {
  return iso ? dateFormat.format(new Date(`${iso}T00:00:00Z`)) : "Undated";
}
