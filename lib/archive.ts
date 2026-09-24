// Monthly archive: documents grouped by the month they belong to ("September 2026 documents"),
// the same periods the monthly VAT return (PP30) uses. Totals are summed in satang.

import { fromSatang, toSatang } from "./money";
import type { LedgerDoc, Sticker } from "./types";

export const NO_DATE = "none";

/** "2026-09" from the document date; NO_DATE when the date is missing or unreadable */
export const monthKey = (doc: Pick<LedgerDoc, "date">): string => (/^\d{4}-\d{2}/.test(doc.date) ? doc.date.slice(0, 7) : NO_DATE);

/** "2026-09" → a Date in that month (UTC, so formatting never slips a month) */
export const monthDate = (key: string): Date => new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1));

export interface MonthGroup<T> {
  key: string;
  items: T[];
  net: number;
  vat: number;
  unpaid: number;
}

/** Newest month first, undated documents last; newest document first inside a month. */
export function groupByMonth<T extends { doc: LedgerDoc }>(items: T[]): MonthGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = monthKey(it.doc);
    map.set(k, [...(map.get(k) ?? []), it]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === NO_DATE ? 1 : b === NO_DATE ? -1 : b.localeCompare(a)))
    .map(([key, list]) => {
      const sorted = [...list].sort((x, y) => y.doc.date.localeCompare(x.doc.date));
      return {
        key,
        items: sorted,
        net: fromSatang(sorted.reduce((s, x) => s + toSatang(x.doc.totals.net), 0)),
        vat: fromSatang(sorted.reduce((s, x) => s + toSatang(x.doc.totals.vat), 0)),
        unpaid: sorted.filter((x) => !x.doc.paid).length,
      };
    });
}

export interface ArchiveFilter {
  stickers: Sticker[];
  unpaidOnly: boolean;
}

/** A document passes when it has any of the chosen stickers (or none are chosen). */
export const matches = (doc: LedgerDoc, f: ArchiveFilter): boolean =>
  (!f.stickers.length || f.stickers.some((s) => doc.stickers.includes(s))) && (!f.unpaidOnly || !doc.paid);
