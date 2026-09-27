// Monthly archive: documents grouped by the month they belong to ("September 2026 documents"),
// the same periods the monthly VAT return (PP30) uses. Totals are summed in satang.

import { fromSatang, toSatang } from "./money";
import type { LedgerDoc, Sticker } from "./types";

/**
 * Still to be paid: bought on credit, or with a due date printed, and not marked paid. Cash, transfer and card
 * receipts without a due date were paid at the till. The one rule for the ledger, its filters and the dashboard.
 */
export const isUnpaid = (d: Pick<LedgerDoc, "paid" | "payment" | "dueDate">) => !d.paid && (d.payment === "credit" || !!d.dueDate);

export const NO_DATE = "none";

/** "2026-09" from the document date; NO_DATE when the date is missing or unreadable */
/** Month of the invoice date ("YYYY-MM", or NO_DATE) */
export const invoiceMonth = (doc: Pick<LedgerDoc, "date">): string => (/^\d{4}-\d{2}/.test(doc.date) ? doc.date.slice(0, 7) : NO_DATE);

/**
 * Month a document is booked in: its tax (claim) month when one is set — a late-received invoice claimed in a
 * later month — otherwise the invoice month. Month groups, reports, the dashboard and month close all use it.
 */
export const monthKey = (doc: Pick<LedgerDoc, "date"> & Partial<Pick<LedgerDoc, "taxMonth">>): string => doc.taxMonth || invoiceMonth(doc);

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
        unpaid: sorted.filter((x) => isUnpaid(x.doc)).length,
      };
    });
}

export interface ArchiveFilter {
  stickers: Sticker[];
  unpaidOnly: boolean;
}

/** A document passes when it has any of the chosen stickers (or none are chosen). */
export const matches = (doc: LedgerDoc, f: ArchiveFilter): boolean =>
  (!f.stickers.length || f.stickers.some((s) => doc.stickers.includes(s))) && (!f.unpaidOnly || isUnpaid(doc));

const fold = (s: string) => s.normalize("NFKC").toLowerCase();
const tri = (t: { th: string; en: string; ja: string }) => `${t.th} ${t.en} ${t.ja}`;
const amounts = (n: number) => `${n.toFixed(2)} ${Math.round(n)}`;

/**
 * Ledger search: every word must appear somewhere in the seller (any language), document number,
 * tax ID, item names or amounts. "64,200" and "64200" both find ฿ 64,200.00.
 */
export function search(doc: LedgerDoc, query: string): boolean {
  const words = fold(query).replace(/(\d),(?=\d)/g, "$1").split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(
    [
      tri(doc.seller.name),
      doc.docNo,
      doc.seller.taxId,
      doc.seller.taxId.replace(/\D/g, ""),
      tri(doc.customer.name),
      ...doc.items.map((i) => `${tri(i.desc)} ${i.code}`),
      amounts(doc.totals.net),
      amounts(doc.totals.vat),
      amounts(doc.totals.taxable),
    ].join(" "),
  );
  return words.every((w) => hay.includes(w));
}
