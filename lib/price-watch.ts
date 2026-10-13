// Food prices creeping up (owner, 2026-10-13): each item bought this month against the last time the same vendor
// sold the same item. A rise of 5 % or more (and at least half a baht) is worth a look — it is where the food
// cost goes. Items are matched by vendor tax ID and the item's name (Thai, else English), spaces and case ignored.
// Money in satang.

import { toSatang } from "./money";
import { digitsOnly } from "./thai-tax";
import type { LedgerDoc } from "./types";

export const RISE_MIN_PCT = 5;
const RISE_MIN_SATANG = 50;

export interface PriceRise {
  /** The document with the dearer price */
  docId: string;
  date: string;
  vendorTaxId: string;
  vendorName: LedgerDoc["seller"]["name"];
  item: string;
  unit: string;
  /** Satang per unit */
  before: number;
  now: number;
  /** Whole percent */
  pct: number;
  /** When it was last bought at the old price */
  beforeDate: string;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Satang per unit: the printed unit price, else amount ÷ quantity; null when there is nothing to compare */
function unitPrice(i: LedgerDoc["items"][number]): number | null {
  if (i.price > 0) return toSatang(i.price);
  if (i.qty > 0 && i.amount > 0) return Math.round(toSatang(i.amount) / i.qty);
  return null;
}

/** Rises in `month` (YYYY-MM), biggest first; one line per vendor and item (its latest purchase) */
export function priceRises(docs: readonly LedgerDoc[], month: string, minPct = RISE_MIN_PCT): PriceRise[] {
  // Every priced item, in date order, per vendor + item name
  type Seen = { docId: string; date: string; docNo: string; price: number; unit: string; name: LedgerDoc["seller"]["name"]; item: string };
  const byKey = new Map<string, Seen[]>();
  for (const d of docs) {
    const vendor = digitsOnly(d.seller.taxId);
    if (!vendor || !d.date) continue;
    for (const i of d.items) {
      const item = norm(i.desc.th || i.desc.en || i.desc.ja);
      const price = unitPrice(i);
      if (!item || price === null) continue;
      const k = `${vendor}|${item}`;
      byKey.set(k, [...(byKey.get(k) ?? []), { docId: d.id ?? "", date: d.date, docNo: d.docNo, price, unit: norm(i.unit.th || i.unit.en || ""), name: d.seller.name, item: (i.desc.th || i.desc.en || i.desc.ja).trim() }]);
    }
  }
  const out: PriceRise[] = [];
  for (const [k, list] of byKey) {
    list.sort((a, b) => a.date.localeCompare(b.date) || a.docNo.localeCompare(b.docNo));
    // The latest purchase of the month, against the purchase just before it (any month)
    const idx = list.map((s, i) => (s.date.slice(0, 7) === month ? i : -1)).filter((i) => i >= 0).pop();
    if (idx === undefined || idx === 0) continue;
    const now = list[idx];
    const before = list[idx - 1];
    if (before.unit && now.unit && before.unit !== now.unit) continue;
    const diff = now.price - before.price;
    if (diff < RISE_MIN_SATANG) continue;
    const pct = Math.round((diff / before.price) * 100);
    if (pct < minPct) continue;
    const vendorTaxId = k.split("|")[0];
    out.push({ docId: now.docId, date: now.date, vendorTaxId, vendorName: now.name, item: now.item, unit: now.unit, before: before.price, now: now.price, pct, beforeDate: before.date });
  }
  return out.sort((a, b) => b.pct - a.pct || a.item.localeCompare(b.item));
}
