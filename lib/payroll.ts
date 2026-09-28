// Thai payroll (owner's decisions 2026-09-28): monthly or daily pay, paid twice a month (1–15 and 16–end); social
// security and withholding tax are worked out for the month and taken from the month-end payment.
// - Hourly rate: monthly pay ÷ 30 ÷ 8, or daily pay ÷ 8 (Labour Protection Act).
// - Overtime on a working day ×1.5; work on a holiday ×1 extra for monthly staff (the day is already paid) or ×2 for
//   daily staff; overtime on a holiday ×3.
// - Social security (ประกันสังคม มาตรา 33): the same rate from employee and employer on wages between a floor and a
//   ceiling — 5 % of 1,650–17,500 in 2026 (at most 875 each). Settings, because the ceiling is being raised in steps.
// - Withholding tax (ภ.ง.ด.1), the Revenue Department's monthly method: this month's regular pay ×12 as the year's
//   income; minus 50 % expenses (at most 100,000), 60,000 personal allowance, the year's social security and the
//   employee's other allowances; the progressive rates; ÷12. A bonus adds the tax it causes in the month it is paid.
//   A monthly amount set by hand replaces the app's.
// - Filing (the month after pay): ภ.ง.ด.1 on paper by the 7th, online and สปส.1-10 by the 15th; a weekend or Thai
//   holiday moves the date to the next working day.
// Satang integers inside; baht (2 decimals) out.

import type { EmployeeDocument } from "./attendance";
import { nextWorkingDay } from "./thai-holidays";

export type PayType = "monthly" | "daily";

export interface Employee {
  id: string;
  branchId: string;
  name: string;
  nickname: string;
  position: string;
  payType: PayType;
  /** Monthly salary, or pay per day */
  rate: number;
  startDate: string;
  endDate: string;
  ssEnrolled: boolean;
  nationalId: string;
  address: string;
  /** Other yearly tax allowances (spouse, children, parents, insurance …) */
  extraAllowance: number;
  /** A monthly withholding amount set by hand (replaces the app's); null = worked out */
  whtFixed: number | null;
  note: string;
  /** Work permit, visa, health certificate … with their expiry dates (lib/attendance) */
  documents: EmployeeDocument[];
}

export interface PeriodInput {
  /** Daily staff: days worked in the period */
  daysWorked: number;
  /** Monthly staff: unpaid days off in the period */
  absentDays: number;
  otHours: number;
  holidayHours: number;
  holidayOtHours: number;
  bonus: number;
  allowance: number;
  otherDeduction: number;
}

export const EMPTY_PERIOD: PeriodInput = { daysWorked: 0, absentDays: 0, otHours: 0, holidayHours: 0, holidayOtHours: 0, bonus: 0, allowance: 0, otherDeduction: 0 };

export interface PayrollSettings {
  /** Percent, each side */
  ssRate: number;
  ssFloor: number;
  ssCeiling: number;
  /** The employer's social security account number (เลขที่บัญชีนายจ้าง, 10 digits) for สปส.1-10 */
  ssAccount: string;
}
export const DEFAULT_PAYROLL: PayrollSettings = { ssRate: 5, ssFloor: 1650, ssCeiling: 17500, ssAccount: "" };

export function payrollSettingsOf(raw: unknown): PayrollSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (k: "ssRate" | "ssFloor" | "ssCeiling", max: number) => (typeof r[k] === "number" && (r[k] as number) >= 0 && (r[k] as number) <= max ? (r[k] as number) : DEFAULT_PAYROLL[k]);
  const account = typeof r.ssAccount === "string" ? r.ssAccount.replace(/\D/g, "").slice(0, 10) : "";
  return { ssRate: num("ssRate", 20), ssFloor: num("ssFloor", 1_000_000), ssCeiling: num("ssCeiling", 1_000_000), ssAccount: account };
}

/** An ID number for lists and payslips: only the last 4 digits */
export const maskId = (id: string) => (id.length === 13 ? `•••••••••${id.slice(9)}` : "");

/**
 * A monthly employee who starts or leaves during the month: the days of each half not employed, as unpaid days off
 * (the second half counts at most 15, like the pay: salary ÷ 30 a day).
 */
export function daysNotEmployed(e: Pick<Employee, "startDate" | "endDate">, month: string): { first: number; second: number } {
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const out = { first: 0, second: 0 };
  for (let d = 1; d <= last; d++) {
    const day = `${month}-${String(d).padStart(2, "0")}`;
    if ((e.startDate && day < e.startDate) || (e.endDate && day > e.endDate)) out[d <= 15 ? "first" : "second"] += 1;
  }
  out.second = Math.min(out.second, 15);
  return out;
}

const sat = (baht: number) => Math.round((Number(baht) || 0) * 100);
const baht = (satang: number) => Math.round(satang) / 100;

/** Pay per hour in satang (not rounded: it is multiplied again) */
export const hourlySat = (e: Pick<Employee, "payType" | "rate">) => (e.payType === "monthly" ? sat(e.rate) / 30 / 8 : sat(e.rate) / 8);

export interface PeriodPay {
  /** Base pay of the period (half a month, or days × day rate) */
  base: number;
  overtime: number;
  holiday: number;
  holidayOvertime: number;
  /** base + all overtime: the wages social security is counted on */
  wages: number;
  bonus: number;
  allowance: number;
  /** wages + bonus + allowance */
  gross: number;
}

/** One pay period (half a month), in baht */
export function periodPay(e: Pick<Employee, "payType" | "rate">, p: PeriodInput): PeriodPay {
  const h = hourlySat(e);
  const base = e.payType === "monthly" ? Math.max(0, sat(e.rate) / 2 - (p.absentDays || 0) * (sat(e.rate) / 30)) : (p.daysWorked || 0) * sat(e.rate);
  const overtime = (p.otHours || 0) * 1.5 * h;
  const holiday = (p.holidayHours || 0) * (e.payType === "monthly" ? 1 : 2) * h;
  const holidayOvertime = (p.holidayOtHours || 0) * 3 * h;
  const r = (v: number) => Math.round(v);
  const wages = r(base) + r(overtime) + r(holiday) + r(holidayOvertime);
  return {
    base: baht(r(base)),
    overtime: baht(r(overtime)),
    holiday: baht(r(holiday)),
    holidayOvertime: baht(r(holidayOvertime)),
    wages: baht(wages),
    bonus: baht(sat(p.bonus)),
    allowance: baht(sat(p.allowance)),
    gross: baht(wages + sat(p.bonus) + sat(p.allowance)),
  };
}

/** Social security of a month's wages, each side, in whole baht */
export function socialSecurity(wages: number, s: PayrollSettings): number {
  if (wages <= 0) return 0;
  const base = Math.min(Math.max(wages, s.ssFloor), s.ssCeiling);
  return Math.round((base * s.ssRate) / 100);
}

/** Thai personal income tax on a year's net income (progressive rates), in baht */
export function incomeTax(netIncome: number): number {
  const bands: [number, number][] = [
    [150_000, 0],
    [300_000, 0.05],
    [500_000, 0.1],
    [750_000, 0.15],
    [1_000_000, 0.2],
    [2_000_000, 0.25],
    [5_000_000, 0.3],
    [Infinity, 0.35],
  ];
  let tax = 0;
  let low = 0;
  for (const [high, rate] of bands) {
    if (netIncome <= low) break;
    tax += (Math.min(netIncome, high) - low) * rate;
    low = high;
  }
  return Math.round(tax * 100) / 100;
}

/** The year's taxable income from a year's pay: minus expenses, personal allowance, social security, other allowances */
export function taxableIncome(yearPay: number, yearSocialSecurity: number, extraAllowance: number): number {
  const expenses = Math.min(yearPay * 0.5, 100_000);
  return Math.max(0, yearPay - expenses - 60_000 - yearSocialSecurity - (extraAllowance || 0));
}

/** Withholding for the month: the regular pay's share of the year's tax, plus the tax a bonus adds */
export function monthlyWithholding(regularMonthPay: number, bonus: number, monthSocialSecurity: number, e: Pick<Employee, "extraAllowance" | "whtFixed">): number {
  if (e.whtFixed !== null && e.whtFixed !== undefined) return Math.round(e.whtFixed * 100) / 100;
  const yearSs = monthSocialSecurity * 12;
  const regular = incomeTax(taxableIncome(regularMonthPay * 12, yearSs, e.extraAllowance)) / 12;
  const withBonus = bonus > 0 ? incomeTax(taxableIncome(regularMonthPay * 12 + bonus, yearSs, e.extraAllowance)) - incomeTax(taxableIncome(regularMonthPay * 12, yearSs, e.extraAllowance)) : 0;
  return Math.round((regular + withBonus) * 100) / 100;
}

export interface MonthPay {
  first: PeriodPay;
  second: PeriodPay;
  /** Whole month */
  wages: number;
  gross: number;
  ssEmployee: number;
  ssEmployer: number;
  wht: number;
  /** Paid on the 15th: the first half, less its other deductions */
  netFirst: number;
  /** Paid at month end: the second half, less social security, withholding and its other deductions */
  netSecond: number;
  /** What the month cost the company: pay + its social security share */
  employerCost: number;
}

export function monthPay(e: Employee, first: PeriodInput, second: PeriodInput, s: PayrollSettings): MonthPay {
  const a = periodPay(e, first);
  const b = periodPay(e, second);
  const wages = baht(sat(a.wages) + sat(b.wages));
  const gross = baht(sat(a.gross) + sat(b.gross));
  const bonus = baht(sat(a.bonus) + sat(b.bonus));
  const ss = e.ssEnrolled ? socialSecurity(wages, s) : 0;
  const wht = monthlyWithholding(baht(sat(gross) - sat(bonus)), bonus, ss, e);
  const netFirst = baht(sat(a.gross) - sat(first.otherDeduction));
  const netSecond = baht(sat(b.gross) - sat(ss) - sat(wht) - sat(second.otherDeduction));
  return { first: a, second: b, wages, gross, ssEmployee: ss, ssEmployer: ss, wht, netFirst, netSecond, employerCost: baht(sat(gross) + sat(ss)) };
}

const shiftMonth = (ym: string, by: number) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + by, 1)).toISOString().slice(0, 7);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The deadlines for a pay month's filings (ภ.ง.ด.1 paper / online, สปส.1-10) */
export function payrollDeadlines(month: string): { pnd1Paper: string; due: string } {
  const next = shiftMonth(month, 1);
  return { pnd1Paper: nextWorkingDay(`${next}-07`), due: nextWorkingDay(`${next}-15`) };
}

/** Which pay month to file today: last month's until its deadline has passed, then this month's */
export function payrollFiling(today: string): { month: string; pnd1Paper: string; due: string; daysLeft: number } {
  const last = shiftMonth(today.slice(0, 7), -1);
  const month = today <= payrollDeadlines(last).due ? last : today.slice(0, 7);
  const d = payrollDeadlines(month);
  return { month, ...d, daysLeft: daysBetween(today, d.due) };
}
