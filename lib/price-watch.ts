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

// ── The price change screen (owner 2026-11-08: "거래처별 가격 변화 화면: 같은 재료가 지난달보다 얼마나 올랐는지") ──────────

export interface PriceChange {
  /** The month's latest purchase of the item */
  docId: string;
  date: string;
  vendorTaxId: string;
  vendorName: LedgerDoc["seller"]["name"];
  item: string;
  unit: string;
  /** Satang per unit: the last purchase before the month, and the month's latest */
  before: number;
  now: number;
  beforeDate: string;
  /** Whole percent, + up / − down */
  pct: number;
  /** Quantity bought in the month */
  qty: number;
  /** Satang paid more (+) or less (−) in the month than at the old price: Σ (price − before) × qty */
  extra: number;
}

export interface VendorPrices {
  vendorTaxId: string;
  vendorName: LedgerDoc["seller"]["name"];
  items: PriceChange[];
  /** Satang, sum of the items' extra */
  extra: number;
}

export interface PriceBoard {
  vendors: VendorPrices[];
  up: number;
  down: number;
  same: number;
  /** Satang paid more because of rises / saved because of falls (positive numbers) */
  paidMore: number;
  saved: number;
  /** Items bought in the month for the first time from that vendor (nothing to compare) */
  first: number;
}

/**
 * Every item bought in `month` that was bought from the same vendor before: the month's latest unit price against the
 * last one before the month. A change under 1 % (or half a baht) counts as the same. Vendors with the most paid
 * more come first; inside a vendor, the biggest rise first, falls last.
 */
export function priceBoard(docs: readonly LedgerDoc[], month: string): PriceBoard {
  type Buy = { docId: string; date: string; docNo: string; price: number; qty: number; unit: string; name: LedgerDoc["seller"]["name"]; item: string };
  const byKey = new Map<string, Buy[]>();
  for (const d of docs) {
    const vendor = digitsOnly(d.seller.taxId);
    if (!vendor || !d.date || d.date.slice(0, 7) > month) continue;
    for (const i of d.items) {
      const item = norm(i.desc.th || i.desc.en || i.desc.ja);
      const price = unitPrice(i);
      if (!item || price === null) continue;
      const k = `${vendor}|${item}`;
      const list = byKey.get(k) ?? [];
      list.push({ docId: d.id ?? "", date: d.date, docNo: d.docNo, price, qty: i.qty > 0 ? i.qty : 1, unit: norm(i.unit.th || i.unit.en || ""), name: d.seller.name, item: (i.desc.th || i.desc.en || i.desc.ja).trim() });
      byKey.set(k, list);
    }
  }
  const board: PriceBoard = { vendors: [], up: 0, down: 0, same: 0, paidMore: 0, saved: 0, first: 0 };
  const byVendor = new Map<string, VendorPrices>();
  for (const [k, list] of byKey) {
    list.sort((a, b) => a.date.localeCompare(b.date) || a.docNo.localeCompare(b.docNo));
    const inMonth = list.filter((b) => b.date.slice(0, 7) === month);
    if (!inMonth.length) continue;
    const earlier = list.filter((b) => b.date.slice(0, 7) < month);
    const before = earlier[earlier.length - 1];
    const now = inMonth[inMonth.length - 1];
    if (!before || (before.unit && now.unit && before.unit !== now.unit)) {
      if (!before) board.first++;
      continue;
    }
    const raw = ((now.price - before.price) / before.price) * 100;
    const same = Math.abs(now.price - before.price) < RISE_MIN_SATANG || Math.abs(raw) < 1;
    const pct = same ? 0 : Math.round(raw);
    const qty = inMonth.reduce((n, b) => n + b.qty, 0);
    const extra = same ? 0 : Math.round(inMonth.reduce((n, b) => n + (b.price - before.price) * b.qty, 0));
    if (pct > 0) {
      board.up++;
      board.paidMore += Math.max(0, extra);
    } else if (pct < 0) {
      board.down++;
      board.saved += Math.max(0, -extra);
    } else board.same++;
    const vendorTaxId = k.split("|")[0];
    const v = byVendor.get(vendorTaxId) ?? { vendorTaxId, vendorName: now.name, items: [], extra: 0 };
    v.items.push({ docId: now.docId, date: now.date, vendorTaxId, vendorName: now.name, item: now.item, unit: now.unit, before: before.price, now: now.price, beforeDate: before.date, pct, qty, extra });
    v.extra += extra;
    byVendor.set(vendorTaxId, v);
  }
  board.vendors = [...byVendor.values()]
    .map((v) => ({ ...v, items: v.items.sort((a, b) => b.pct - a.pct || a.item.localeCompare(b.item)) }))
    .sort((a, b) => b.extra - a.extra || b.items.length - a.items.length);
  return board;
}
