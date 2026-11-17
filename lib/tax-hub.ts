// 세금 신고 모아보기 (owner 2026-11-18, from the for-sale version): every monthly return of one tax month on one screen —
// ภ.พ.30 (VAT), ภ.ง.ด.53 / ภ.ง.ด.3 (tax withheld from suppliers), ภ.ง.ด.1 + social security (payroll). This file only knows
// the dates, the status words and the sums; the screen (components/ledger/TaxesHub) brings the numbers from the stores.
// The "filed" ticks are the tax calendar's own keys (vat:YYYY-MM, monthly:YYYY-MM), the same the filing helper sets.

import { daysTo } from "./company-calendar";
import { filingDeadlines, filingMonth } from "./filing";
import { payrollDeadlines } from "./payroll";

export type ReturnKind = "pp30" | "pnd53" | "pnd3" | "pnd1";
/** none = nothing to file · open = to do · filed · late */
export type ReturnStatus = "none" | "open" | "filed" | "late";

export interface Deadline {
  paper: string;
  /** e-Filing (the one that counts for late and days left) */
  online: string;
}

/** The month's deadlines, moved to working days: VAT 15th / 23rd, withholding and ภ.ง.ด.1 + SSO 7th / 15th */
export function monthDeadlines(month: string): Record<ReturnKind, Deadline> {
  const f = filingDeadlines(month);
  const p = payrollDeadlines(month);
  const wht = { paper: f.wht.due, online: f.wht.online };
  return { pp30: { paper: f.vat.due, online: f.vat.online }, pnd53: wht, pnd3: wht, pnd1: { paper: p.pnd1Paper, online: p.due } };
}

/** The month the screen opens on (the filing helper's: last month until its VAT e-filing date has passed) */
export const hubMonth = (v: unknown, today: string): string => (typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : filingMonth(today));

/** Filed wins; nothing to file → none; past the e-filing date → late; else open */
export function returnStatus(o: { filed: boolean; nothing: boolean; deadline: string; today: string }): ReturnStatus {
  if (o.filed) return "filed";
  if (o.nothing) return "none";
  return o.today > o.deadline ? "late" : "open";
}

export const daysLeft = (today: string, deadline: string) => daysTo(today, deadline);

/** The calendar's tick for a month's VAT return, and for its withholding + payroll filing */
export const vatDoneKey = (month: string) => `vat:${month}`;
export const monthlyDoneKey = (month: string) => `monthly:${month}`;

/** Payroll's part of the month (satang): tax withheld from pay (ภ.ง.ด.1) and both sides of social security */
export function payrollTaxes(lines: readonly { wht: number; ssEmployee: number; ssEmployer: number }[]): { pnd1: number; sso: number; people: number } {
  const s = (n: number) => Math.round((n || 0) * 100);
  return {
    pnd1: lines.reduce((a, l) => a + s(l.wht), 0),
    sso: lines.reduce((a, l) => a + s(l.ssEmployee) + s(l.ssEmployer), 0),
    people: lines.length,
  };
}
