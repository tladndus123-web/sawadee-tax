// The top bar's search (owner 2026-11-18, like the for-sale version's "/" search): pure parts. The typed words become a
// safe PostgREST `or` filter (characters that would break its syntax are dropped) and the menu is matched on the device.
// The queries run with the person's own session (components/layout/GlobalSearch), so the database decides what comes
// back — a branch the person is kept out of never shows.

/** The text to search for: trimmed, without PostgREST filter characters, at most 60 characters; "" under 2 characters */
export function searchTerm(q: string): string {
  const s = q
    .replace(/[,()*%:"'\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return [...s].length >= 2 ? s : "";
}

/** `col.ilike.*term*` for each column, joined for `.or(...)`; "" for an empty term */
export function ilikeAny(columns: readonly string[], term: string): string {
  if (!term) return "";
  return columns.map((c) => `${c}.ilike.*${term}*`).join(",");
}

/** Items whose text holds every typed word (any order, any case) */
export function matchMenu<T>(items: readonly T[], q: string, text: (item: T) => string): T[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return items.filter((i) => {
    const hay = text(i).toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** "/" opens the search unless the person is typing somewhere */
export function opensSearch(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: unknown }): boolean {
  if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return false;
  const el = e.target as { tagName?: string; isContentEditable?: boolean } | null;
  const tag = el?.tagName?.toLowerCase() ?? "";
  return !(tag === "input" || tag === "textarea" || tag === "select" || el?.isContentEditable);
}

/** A name in the reader's language from a {th, en, ja} object (Korean readers get English, then Thai) */
export function nameOf(n: unknown, locale: string): string {
  const o = n && typeof n === "object" ? (n as Record<string, unknown>) : {};
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
  return (locale === "ja" ? s("ja") || s("en") || s("th") : locale === "th" ? s("th") || s("en") || s("ja") : s("en") || s("th") || s("ja")) || "";
}
