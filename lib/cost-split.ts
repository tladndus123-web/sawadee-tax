// What a document costs, by category and by month (owner's request 2026-09-28):
// - a document's cost is its total minus the input VAT that comes back (as in lib/sales monthResult);
// - a line can carry its own category (a mixed receipt: ingredients and office supplies), and the cost is then
//   shared out by the line amounts — lines without one follow the document;
// - equipment ("asset") with a depreciation period is not a cost in the month it is bought: its cost is spread
//   evenly over that many years from the invoice month (straight line, as the Revenue Department allows: 5 years
//   for machines, furniture and vehicles, 3 for computers, 20 for buildings). Its VAT still comes back at once.
// - equipment sold or thrown away (disposedOn): depreciation stops, and what was not yet written off is a cost of
//   the month it went (the usual write-off of the remaining book value).
// Satang integers throughout.

import { invoiceMonth, NO_DATE } from "./archive";
import { claimable } from "./checks";
import { toSatang } from "./money";
import { type Category, type LedgerDoc } from "./types";

/** Usual depreciation periods (years) and what they are for */
export const DEP_CHOICES = [3, 5, 10, 20] as const;

/** A document's cost in satang: total minus the VAT that can be claimed */
export const docCost = (doc: LedgerDoc, companyTaxId: string) => toSatang(doc.totals.net) - (claimable(doc, companyTaxId) ? toSatang(doc.totals.vat) : 0);

/** Equipment written off over years rather than expensed when bought */
export const isDepreciated = (doc: Pick<LedgerDoc, "category" | "depYears">) => doc.category === "asset" && doc.depYears > 0;

/** Lines that name a category other than the document's */
export const isMixed = (doc: Pick<LedgerDoc, "category" | "items">) => doc.items.some((i) => i.category && i.category !== doc.category);

/**
 * The document's cost shared out by category: each line's share follows its amount (lines without a category
 * belong to the document's); rounding goes to the biggest share, so the parts add up exactly.
 */
export function costByCategory(doc: LedgerDoc, companyTaxId: string): Map<Category, number> {
  const cost = docCost(doc, companyTaxId);
  const out = new Map<Category, number>();
  const weights = new Map<Category, number>();
  for (const i of doc.items) {
    const w = toSatang(i.amount);
    if (w <= 0) continue;
    const c = (i.category || doc.category) as Category;
    weights.set(c, (weights.get(c) ?? 0) + w);
  }
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  if (!isMixed(doc) || total <= 0) return out.set(doc.category, cost);
  let given = 0;
  let biggest: Category = doc.category;
  for (const [c, w] of weights) {
    const share = Math.round((cost * w) / total);
    out.set(c, share);
    given += share;
    if (w > (weights.get(biggest) ?? -1)) biggest = c;
  }
  out.set(biggest, (out.get(biggest) ?? 0) + (cost - given));
  return out;
}

const monthIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;

/** Written off after `k` months of an asset's period (the last month takes the remainder, so n months = the cost) */
const writtenOff = (cost: number, n: number, k: number) => (k <= 0 ? 0 : k >= n ? cost : Math.floor(cost / n) * k);

/** This month's depreciation of one asset in satang (0 outside its period, and from the month it was disposed of) */
export function depreciationFor(doc: LedgerDoc, month: string, companyTaxId: string): number {
  if (!isDepreciated(doc)) return 0;
  const start = invoiceMonth(doc);
  if (start === NO_DATE) return 0;
  if (doc.disposedOn && month >= doc.disposedOn.slice(0, 7)) return 0;
  const n = doc.depYears * 12;
  const k = monthIndex(month) - monthIndex(start);
  if (k < 0 || k >= n) return 0;
  const cost = docCost(doc, companyTaxId);
  return writtenOff(cost, n, k + 1) - writtenOff(cost, n, k);
}

/** Disposed of this month: what was not yet written off, as a cost of this month (0 otherwise) */
export function disposalFor(doc: LedgerDoc, month: string, companyTaxId: string): number {
  if (!isDepreciated(doc) || !doc.disposedOn || doc.disposedOn.slice(0, 7) !== month) return 0;
  const start = invoiceMonth(doc);
  if (start === NO_DATE) return 0;
  const cost = docCost(doc, companyTaxId);
  return cost - writtenOff(cost, doc.depYears * 12, monthIndex(month) - monthIndex(start));
}

export interface AssetRow {
  doc: LedgerDoc;
  /** Satang */
  cost: number;
  /** Written off up to and including `month` (all of it once disposed of) */
  writtenOff: number;
  /** cost minus writtenOff */
  bookValue: number;
  monthly: number;
  /** Last month of the period (YYYY-MM) */
  endsIn: string;
  state: "active" | "done" | "disposed";
}

/** Every piece of equipment being written off, as of `month`: cost, written off so far, what is left */
export function assetRegister(docs: LedgerDoc[], month: string, companyTaxId: string): AssetRow[] {
  return docs
    .filter((d) => isDepreciated(d) && invoiceMonth(d) !== NO_DATE && invoiceMonth(d) <= month)
    .map((doc) => {
      const cost = docCost(doc, companyTaxId);
      const n = doc.depYears * 12;
      const start = monthIndex(invoiceMonth(doc));
      const end = start + n - 1;
      const disposed = !!doc.disposedOn && doc.disposedOn.slice(0, 7) <= month;
      const off = disposed ? cost : writtenOff(cost, n, monthIndex(month) - start + 1);
      const state: AssetRow["state"] = disposed ? "disposed" : off >= cost ? "done" : "active";
      return {
        doc,
        cost,
        writtenOff: off,
        bookValue: cost - off,
        monthly: Math.floor(cost / n),
        endsIn: `${Math.floor(end / 12)}-${String((end % 12) + 1).padStart(2, "0")}`,
        state,
      };
    })
    .sort((a, b) => a.doc.date.localeCompare(b.doc.date));
}

export interface MonthCosts {
  /** Costs of the month by category (assets being depreciated are left out) */
  byCategory: Map<Category, number>;
  /** Depreciation of every asset that is in its period this month */
  depreciation: number;
  /** Equipment disposed of this month: the part not yet written off */
  disposal: number;
  /** Sum of both: what the month cost */
  cost: number;
}

/** The month's costs from every saved document: purchases of the month by category, plus depreciation */
export function monthCosts(docs: LedgerDoc[], month: string, companyTaxId: string): MonthCosts {
  const byCategory = new Map<Category, number>();
  let depreciation = 0;
  let disposal = 0;
  for (const d of docs) {
    if (isDepreciated(d)) {
      depreciation += depreciationFor(d, month, companyTaxId);
      disposal += disposalFor(d, month, companyTaxId);
      continue;
    }
    if (invoiceMonth(d) !== month) continue;
    for (const [c, v] of costByCategory(d, companyTaxId)) byCategory.set(c, (byCategory.get(c) ?? 0) + v);
  }
  const cost = [...byCategory.values()].reduce((a, b) => a + b, 0) + depreciation + disposal;
  return { byCategory, depreciation, disposal, cost };
}
