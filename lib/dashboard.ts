// Dashboard numbers (step 8), from the saved ledger (final, not deleted). Satang math throughout.
// Like the prototype's renderSummary: "unpaid" means credit purchases not marked paid —
// cash / card / transfer receipts are paid at the till.

import { isUnpaid, monthKey } from "./archive";
import { claimable, flagsFor } from "./checks";
import { fromSatang, toSatang } from "./money";
import type { LedgerDoc } from "./types";

/** ack: warnings a person marked "문제 없음" (documents.ack_flags) */
export type Doc = { id: string; doc: LedgerDoc; ack?: readonly string[] };

export { isUnpaid } from "./archive";

export interface Summary {
  /** Net total of the month's documents */
  total: number;
  /** Input VAT that can be claimed for the month */
  claimableVat: number;
  /** Unpaid credit purchases, all months */
  unpaid: number;
  unpaidCount: number;
  overdueCount: number;
  /** Documents of the month with a failing automatic check (other than "unclear fields") */
  toCheck: number;
  count: number;
}

/**
 * Documents that need a look: any failed automatic check except "unclear" (that one only asks to glance at
 * the photo). Duplicates count too, so every document is checked against the rest of the ledger.
 */
export function needsCheck(docs: Doc[], companyTaxId: string, today: string): Set<string> {
  return new Set(openWarnings(docs, companyTaxId, today).keys());
}

/**
 * The warnings still open per document (id → check keys): failed checks other than "unclear", minus the ones a
 * person marked "문제 없음". A warning that appears after the marking (an edit) is open again.
 */
export function openWarnings(docs: Doc[], companyTaxId: string, today: string): Map<string, string[]> {
  const others = docs.map(({ id, doc }) => ({ id, docNo: doc.docNo, sellerTaxId: doc.seller.taxId }));
  const out = new Map<string, string[]>();
  for (const { id, doc, ack = [] } of docs) {
    const open = flagsFor({ ...doc, id }, { companyTaxId, today, others }).filter((f) => f !== "unclear" && !ack.includes(f));
    if (open.length) out.set(id, open);
  }
  return out;
}

export function summarize(docs: Doc[], month: string, companyTaxId: string, today: string): Summary {
  let total = 0;
  let vat = 0;
  let unpaid = 0;
  let unpaidCount = 0;
  let overdueCount = 0;
  let toCheck = 0;
  let count = 0;
  const check = needsCheck(docs, companyTaxId, today);
  for (const { id, doc } of docs) {
    if (monthKey(doc) === month) {
      count += 1;
      total += toSatang(doc.totals.net);
      if (claimable(doc, companyTaxId)) vat += toSatang(doc.totals.vat);
      if (check.has(id)) toCheck += 1;
    }
    if (isUnpaid(doc)) {
      unpaid += toSatang(doc.totals.net);
      unpaidCount += 1;
      if (doc.dueDate && doc.dueDate < today) overdueCount += 1;
    }
  }
  return { total: fromSatang(total), claimableVat: fromSatang(vat), unpaid: fromSatang(unpaid), unpaidCount, overdueCount, toCheck, count };
}

export type DueState = "overdue" | "soon" | "later" | "none";

/** Whole days from today to the due date (negative = overdue) */
export const daysUntil = (due: string, today: string) => Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

export interface DueItem extends Doc {
  state: DueState;
  days: number | null;
}

/** Unpaid credit purchases, most urgent first; within a week counts as "soon", no due date last. */
export function upcoming(docs: Doc[], today: string): DueItem[] {
  return docs
    .filter(({ doc }) => isUnpaid(doc))
    .map((d): DueItem => {
      if (!d.doc.dueDate) return { ...d, state: "none", days: null };
      const days = daysUntil(d.doc.dueDate, today);
      return { ...d, days, state: days < 0 ? "overdue" : days <= 7 ? "soon" : "later" };
    })
    .sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity) || a.doc.date.localeCompare(b.doc.date));
}

export interface TrendPoint {
  month: string;
  net: number;
  vat: number;
  count: number;
}

/** The last `n` months up to and including `endMonth` ("2026-09"), empty months as 0 */
export function trend(docs: Doc[], endMonth: string, n = 6): TrendPoint[] {
  const [y, m] = endMonth.split("-").map(Number);
  const months = Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const acc = new Map(months.map((k) => [k, { net: 0, vat: 0, count: 0 }]));
  for (const { doc } of docs) {
    const a = acc.get(monthKey(doc));
    if (!a) continue;
    a.net += toSatang(doc.totals.net);
    a.vat += toSatang(doc.totals.vat);
    a.count += 1;
  }
  return months.map((k) => {
    const a = acc.get(k)!;
    return { month: k, net: fromSatang(a.net), vat: fromSatang(a.vat), count: a.count };
  });
}

export interface VatFiling {
  /** Tax month whose return (ภ.พ.30) is being prepared, "YYYY-MM" */
  month: string;
  /** Paper filing deadline: the 15th of the next month */
  due: string;
  /** e-Filing usually has until about the 23rd (the Revenue Department extends it each year) */
  dueOnline: string;
  /** Days to the next of those two deadlines (negative once both have passed) */
  daysLeft: number;
  /** The paper date has passed; only e-filing time is left */
  onlineOnly: boolean;
}

const shiftMonth = (ym: string, by: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

/** Which VAT return to prepare today: last month's until its e-filing date has passed, then this month's */
export function vatFiling(today: string): VatFiling {
  const thisMonth = today.slice(0, 7);
  const month = Number(today.slice(8, 10)) <= 23 ? shiftMonth(thisMonth, -1) : thisMonth;
  const next = shiftMonth(month, 1);
  const due = `${next}-15`;
  const dueOnline = `${next}-23`;
  const onlineOnly = today > due;
  return { month, due, dueOnline, daysLeft: daysUntil(onlineOnly ? dueOnline : due, today), onlineOnly };
}
