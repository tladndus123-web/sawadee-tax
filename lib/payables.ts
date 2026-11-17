// 줄 돈 (owner 2026-11-18, from the for-sale version's "받을 돈 · 줄 돈" — the 줄 돈 side only, this company issues no
// sales documents): every unpaid bill of the ledger in due-date buckets (late · within 7 days · within 30 days · later ·
// no due date) and per supplier, oldest first. Amounts are what is paid: the net after withholding. Pure.

import { isUnpaid } from "./archive";
import { daysTo } from "./company-calendar";
import type { LedgerDoc } from "./types";

export type Bucket = "late" | "week" | "month" | "later" | "none";
export const BUCKETS: readonly Bucket[] = ["late", "week", "month", "later", "none"];

export interface Bill {
  id: string;
  doc: LedgerDoc;
  /** Satang to pay (net after withholding) */
  amount: number;
  /** Days to the due date (negative = late); null = no due date */
  days: number | null;
  bucket: Bucket;
}

export const toPay = (d: LedgerDoc) => Math.round(((d.totals.net || 0) - (d.totals.wht || 0)) * 100);

export function bucketOf(days: number | null): Bucket {
  if (days === null) return "none";
  if (days < 0) return "late";
  if (days <= 7) return "week";
  if (days <= 30) return "month";
  return "later";
}

/** The unpaid bills, soonest due first (no due date last, oldest document first among them) */
export function unpaidBills(entries: readonly { id: string; doc: LedgerDoc }[], today: string): Bill[] {
  return entries
    .filter((e) => isUnpaid(e.doc) && toPay(e.doc) > 0)
    .map((e) => {
      const days = e.doc.dueDate ? daysTo(today, e.doc.dueDate) : null;
      return { id: e.id, doc: e.doc, amount: toPay(e.doc), days, bucket: bucketOf(days) };
    })
    .sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9) || (a.doc.date || "").localeCompare(b.doc.date || ""));
}

/** Totals per bucket (satang, count) */
export function bucketTotals(bills: readonly Bill[]): Record<Bucket, { amount: number; count: number }> {
  const out = Object.fromEntries(BUCKETS.map((b) => [b, { amount: 0, count: 0 }])) as Record<Bucket, { amount: number; count: number }>;
  for (const b of bills) {
    out[b.bucket].amount += b.amount;
    out[b.bucket].count += 1;
  }
  return out;
}

/** Per supplier (tax ID, else the name), the biggest total first */
export function bySupplier(bills: readonly Bill[]): { key: string; name: LedgerDoc["seller"]["name"]; bills: Bill[]; amount: number; late: number }[] {
  const map = new Map<string, { key: string; name: LedgerDoc["seller"]["name"]; bills: Bill[]; amount: number; late: number }>();
  for (const b of bills) {
    const key = (b.doc.seller.taxId || "").replace(/\D/g, "") || b.doc.seller.name.th || b.doc.seller.name.en || b.doc.seller.name.ja || "?";
    const g = map.get(key) ?? { key, name: b.doc.seller.name, bills: [], amount: 0, late: 0 };
    g.bills.push(b);
    g.amount += b.amount;
    if (b.bucket === "late") g.late += b.amount;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.late - a.late || b.amount - a.amount);
}
