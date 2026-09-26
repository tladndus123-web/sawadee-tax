// Withholding tax (ภาษีหัก ณ ที่จ่าย) our company makes when it pays a supplier: the 50 ทวิ certificate for the
// supplier and the monthly ภ.ง.ด.53 (companies) / ภ.ง.ด.3 (people) lists. Money in satang, like the rest.
// A withholding belongs to the month it was paid in, not the invoice month.

import { fromSatang, toSatang } from "./money";
import { branchNo, digitsOnly } from "./thai-tax";
import type { LedgerDoc, Tri, WhtType } from "./types";

/** Amount the tax is taken from: the price before VAT (taxable + exempt) */
export const whtBase = (t: Pick<LedgerDoc["totals"], "taxable" | "exempt">): number => fromSatang(toSatang(t.taxable) + toSatang(t.exempt));

/** base × rate %, rounded to the satang */
export const whtAmount = (t: Pick<LedgerDoc["totals"], "taxable" | "exempt">, ratePct: number): number =>
  fromSatang(Math.round(((toSatang(t.taxable) + toSatang(t.exempt)) * ratePct) / 100));

/** Juristic persons' tax IDs start with 0 → ภ.ง.ด.53; a person's (national ID, 1–8) → ภ.ง.ด.3 */
export const payeeForm = (taxId: string): "53" | "3" => (digitsOnly(taxId).startsWith("0") ? "53" : "3");

/** The document carries a withholding */
export const hasWht = (d: Pick<LedgerDoc, "whtRate" | "totals">): boolean => d.whtRate > 0 || d.totals.wht > 0;

/** Month the withholding is filed in: the month it was paid ("" while unpaid) */
export const whtMonth = (d: Pick<LedgerDoc, "paid" | "paidDate">): string => (d.paid && /^\d{4}-\d{2}/.test(d.paidDate) ? d.paidDate.slice(0, 7) : "");

/** Tax withheld: the amount on the document, else base × rate */
export const whtTax = (d: Pick<LedgerDoc, "whtRate" | "totals">): number => (d.totals.wht > 0 ? d.totals.wht : whtAmount(d.totals, d.whtRate));

/** Rate shown on the lists: the set rate, else worked back from the amount (rounded to 0.5 %) */
export function whtRateOf(d: Pick<LedgerDoc, "whtRate" | "totals">): number {
  if (d.whtRate > 0) return d.whtRate;
  const base = toSatang(whtBase(d.totals));
  return base ? Math.round(((toSatang(d.totals.wht) / base) * 100) * 2) / 2 : 0;
}

export interface WhtRow {
  id: string;
  /** Payment date (ISO) */
  paidDate: string;
  taxId: string;
  /** "00000" head office, 5-digit branch, "" unknown */
  branchNo: string;
  name: Tri;
  address: Tri;
  type: WhtType | "";
  rate: number;
  /** Amount paid (before VAT), the base of the tax */
  paid: number;
  tax: number;
}

export interface WhtList {
  pnd53: WhtRow[];
  pnd3: WhtRow[];
  totals: { pnd53: { paid: number; tax: number }; pnd3: { paid: number; tax: number } };
}

/** The withholdings paid in a month, split by form, in payment order */
export function buildWhtList(docs: { id: string; doc: LedgerDoc }[], month: string): WhtList {
  const rows = docs
    .filter(({ doc }) => hasWht(doc) && whtMonth(doc) === month)
    .map(
      ({ id, doc }): WhtRow => ({
        id,
        paidDate: doc.paidDate,
        taxId: digitsOnly(doc.seller.taxId),
        branchNo: branchNo(doc.seller.branch),
        name: doc.seller.name,
        address: doc.seller.address,
        type: doc.whtType,
        rate: whtRateOf(doc),
        paid: whtBase(doc.totals),
        tax: whtTax(doc),
      }),
    )
    .sort((a, b) => a.paidDate.localeCompare(b.paidDate) || a.taxId.localeCompare(b.taxId));
  const sum = (list: WhtRow[]) => ({
    paid: fromSatang(list.reduce((a, r) => a + toSatang(r.paid), 0)),
    tax: fromSatang(list.reduce((a, r) => a + toSatang(r.tax), 0)),
  });
  const pnd53 = rows.filter((r) => payeeForm(r.taxId) === "53");
  const pnd3 = rows.filter((r) => payeeForm(r.taxId) === "3");
  return { pnd53, pnd3, totals: { pnd53: sum(pnd53), pnd3: sum(pnd3) } };
}
