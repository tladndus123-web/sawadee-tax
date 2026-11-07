// The numbers for this month's tax returns (owner, 2026-11-08: "신고서 숫자 도우미"): the ภ.พ.30 boxes from the sales and
// the purchase tax invoices, and the ภ.ง.ด.53 / ภ.ง.ด.3 totals from lib/wht. Money in satang, like the rest.
// Purchases count in their tax (claim) month, the same as the input tax report (รายงานภาษีซื้อ); sales in their day's
// month; withholding in the month it was paid. A help for typing the return, not the return: the accountant checks it.

import { monthKey } from "./archive";
import { claimable } from "./checks";
import { vatDeadlines } from "./dashboard";
import { fromSatang, toSatang } from "./money";
import { nextWorkingDay } from "./thai-holidays";
import { taxIdOk } from "./thai-tax";
import type { Sale } from "./sales";
import type { LedgerDoc } from "./types";
import { buildWhtList, type WhtList } from "./wht";

/** The ภ.พ.30 boxes we can fill (1–12, Thai form numbering). Box 10 (carried from last month) is the person's to type. */
export interface Pp30 {
  /** 1 ยอดขายในเดือนนี้: sales without VAT */
  sales: number;
  /** 2 ยอดขายที่เสียภาษีในอัตราร้อยละ 0 (the app keeps none: always 0) */
  zeroRated: number;
  /** 3 ยอดขายที่ได้รับยกเว้น */
  exempt: number;
  /** 4 ยอดขายที่ต้องเสียภาษี = 1 − 2 − 3 */
  taxable: number;
  /** 5 ภาษีขายเดือนนี้ (the VAT on the closing reports) */
  outputVat: number;
  /** 6 ยอดซื้อที่มีสิทธินำภาษีซื้อมาหัก: value before VAT of the claimable tax invoices */
  purchases: number;
  /** 7 ภาษีซื้อเดือนนี้ */
  inputVat: number;
  /** 8 ภาษีที่ต้องชำระเดือนนี้ (5 > 7) */
  toPay: number;
  /** 9 ภาษีที่ชำระเกินเดือนนี้ (7 > 5) */
  overpaid: number;
}

export interface Pp30Sources {
  /** Days of the month with at least one closing report */
  saleDays: number;
  /** Closing reports (lines) counted */
  saleSlips: number;
  /** Purchase tax invoices counted in 6 / 7 */
  claimDocs: number;
  /** Purchases of the month with VAT that cannot be claimed (no full tax invoice, not addressed to us …) */
  otherDocs: number;
  otherVat: number;
  /** Total of the VAT printed on the closing reports vs 7 % of box 4 — off by more than 1 baht per day */
  vatOff: boolean;
}

/** ภ.พ.30 for a month. `sales` and `purchases` are the saved lines (drafts and the trash left out by the caller). */
export function buildPp30(sales: readonly Sale[], purchases: readonly LedgerDoc[], month: string, companyTaxId: string): { pp30: Pp30; from: Pp30Sources } {
  let gross = 0;
  let vat = 0;
  let exempt = 0;
  let slips = 0;
  const days = new Set<string>();
  for (const s of sales) {
    if (s.date.slice(0, 7) !== month) continue;
    gross += toSatang(s.gross);
    vat += toSatang(s.vat);
    exempt += toSatang(s.exempt);
    slips += 1;
    days.add(s.date);
  }
  let value = 0;
  let input = 0;
  let claimDocs = 0;
  let otherDocs = 0;
  let otherVat = 0;
  for (const d of purchases) {
    if (monthKey(d) !== month) continue;
    if (claimable(d, companyTaxId)) {
      value += toSatang(d.totals.taxable);
      input += toSatang(d.totals.vat);
      claimDocs += 1;
    } else if (toSatang(d.totals.vat) > 0) {
      otherDocs += 1;
      otherVat += toSatang(d.totals.vat);
    }
  }
  const salesValue = gross - vat;
  const taxable = salesValue - exempt;
  const pp30: Pp30 = {
    sales: fromSatang(salesValue),
    zeroRated: 0,
    exempt: fromSatang(exempt),
    taxable: fromSatang(taxable),
    outputVat: fromSatang(vat),
    purchases: fromSatang(value),
    inputVat: fromSatang(input),
    toPay: fromSatang(Math.max(vat - input, 0)),
    overpaid: fromSatang(Math.max(input - vat, 0)),
  };
  const expected = Math.round((taxable * 7) / 100);
  return {
    pp30,
    from: { saleDays: days.size, saleSlips: slips, claimDocs, otherDocs, otherVat: fromSatang(otherVat), vatOff: Math.abs(expected - vat) > 100 * Math.max(days.size, 1) },
  };
}

/** Deadlines of a month's returns (a weekend or Thai holiday moves to the next working day) */
export function filingDeadlines(month: string): { vat: { due: string; online: string }; wht: { due: string; online: string } } {
  const v = vatDeadlines(month);
  const [y, m] = month.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  return { vat: { due: v.due, online: v.dueOnline }, wht: { due: nextWorkingDay(`${next}-07`), online: nextWorkingDay(`${next}-15`) } };
}

export interface WhtFiling extends WhtList {
  /** Payees whose tax ID is missing or fails the check digit (the form needs all 13 digits) */
  badIds: string[];
  /** Withholdings on documents of the month that are not marked paid yet (they go in the month they are paid) */
  unpaid: number;
}

/** ภ.ง.ด.53 / ภ.ง.ด.3 for the month paid, with what to fix first */
export function buildWhtFiling(docs: readonly { id: string; doc: LedgerDoc }[], month: string): WhtFiling {
  const list = buildWhtList([...docs], month);
  const badIds = [...list.pnd53, ...list.pnd3].filter((r) => !taxIdOk(r.taxId)).map((r) => r.id);
  const unpaid = docs.filter(({ doc }) => (doc.whtRate > 0 || doc.totals.wht > 0) && !doc.paid && monthKey(doc) === month).length;
  return { ...list, badIds, unpaid };
}

/** Everything due this month: VAT to pay plus the tax withheld (an overpaid VAT month adds nothing) */
export const totalToPay = (pp30: Pp30, wht: WhtList): number => fromSatang(toSatang(pp30.toPay) + toSatang(wht.totals.pnd53.tax) + toSatang(wht.totals.pnd3.tax));

/** Which month to prepare today: last month until its VAT e-filing date has passed, then this month */
export function filingMonth(today: string): string {
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  return today <= vatDeadlines(last).dueOnline ? last : today.slice(0, 7);
}
