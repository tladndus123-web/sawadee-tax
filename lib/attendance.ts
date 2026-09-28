// Attendance → pay inputs, leave balances, document expiry (owner's decisions 2026-09-29).
// - A day is worked, a day off, an unpaid absence, annual leave or sick leave, with overtime hours. Days not marked:
//   a monthly employee is at work (only absences cost them pay); a daily employee is not (only marked days are paid).
// - Annual and sick leave are paid days (Labour Protection Act s.30, s.32): for daily staff they count as worked.
// - Work on a Thai public holiday counts as holiday work (8 hours), its overtime as holiday overtime.
// - Leave a year: 6 days annual after a year of service, 30 days paid sick leave.
// - Documents with an expiry date (work permit, visa, health certificate …) are listed for reminders.

import { type Employee, EMPTY_PERIOD, type PeriodInput } from "./payroll";
import { THAI_HOLIDAYS } from "./thai-holidays";

export type AttendanceKind = "work" | "off" | "absent" | "annual" | "sick";
export const ATTENDANCE_KINDS: AttendanceKind[] = ["work", "off", "absent", "annual", "sick"];

export interface AttendanceRow {
  employeeId: string;
  /** YYYY-MM-DD */
  day: string;
  kind: AttendanceKind;
  otHours: number;
  note: string;
}

export const ANNUAL_LEAVE_DAYS = 6;
export const SICK_LEAVE_DAYS = 30;
const HOLIDAY_HOURS = 8;

const lastDay = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
/** The days of a month, YYYY-MM-DD */
export const daysOfMonth = (month: string) => Array.from({ length: lastDay(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
const employedOn = (e: Pick<Employee, "startDate" | "endDate">, day: string) => (!e.startDate || day >= e.startDate) && (!e.endDate || day <= e.endDate);

/**
 * The two pay periods' inputs from one employee's attendance in a month (bonus, allowance and other deductions are
 * not attendance: they stay 0 here and are typed in the pay run).
 */
export function periodFromAttendance(e: Pick<Employee, "payType" | "startDate" | "endDate">, rows: readonly AttendanceRow[], month: string): { first: PeriodInput; second: PeriodInput } {
  const byDay = new Map(rows.filter((r) => r.day.startsWith(month)).map((r) => [r.day, r]));
  const out = { first: { ...EMPTY_PERIOD }, second: { ...EMPTY_PERIOD } };
  for (const day of daysOfMonth(month)) {
    const p = Number(day.slice(8)) <= 15 ? out.first : out.second;
    const r = byDay.get(day);
    if (!employedOn(e, day)) {
      if (e.payType === "monthly") p.absentDays += 1;
      continue;
    }
    if (e.payType === "monthly") {
      if (r?.kind === "absent") p.absentDays += 1;
    } else if (r && (r.kind === "work" || r.kind === "annual" || r.kind === "sick")) p.daysWorked += 1;
    if (r?.kind === "work") {
      if (THAI_HOLIDAYS.has(day)) {
        p.holidayHours += HOLIDAY_HOURS;
        p.holidayOtHours += r.otHours;
      } else p.otHours += r.otHours;
    }
  }
  return out;
}

export interface LeaveBalance {
  /** 0 until a year of service */
  annualEntitled: number;
  annualUsed: number;
  sickUsed: number;
  sickEntitled: number;
}

/** Leave taken in a calendar year against what the law gives */
export function leaveBalance(e: Pick<Employee, "startDate">, rows: readonly AttendanceRow[], year: number): LeaveBalance {
  const mine = rows.filter((r) => r.day.startsWith(`${year}-`));
  const oneYearIn = !e.startDate || e.startDate <= `${year - 1}-12-31`;
  return {
    annualEntitled: oneYearIn ? ANNUAL_LEAVE_DAYS : 0,
    annualUsed: mine.filter((r) => r.kind === "annual").length,
    sickUsed: mine.filter((r) => r.kind === "sick").length,
    sickEntitled: SICK_LEAVE_DAYS,
  };
}

export interface EmployeeDocument {
  name: string;
  /** YYYY-MM-DD */
  expires: string;
}

/** The stored list, sane entries only */
export function parseDocuments(raw: unknown): EmployeeDocument[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d) => (d && typeof d === "object" ? (d as Record<string, unknown>) : {}))
    .filter((d) => typeof d.name === "string" && d.name.trim() && typeof d.expires === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.expires))
    .map((d) => ({ name: (d.name as string).trim().slice(0, 60), expires: d.expires as string }));
}

export interface ExpiringDocument {
  employee: Pick<Employee, "id" | "name" | "nickname">;
  doc: EmployeeDocument;
  /** Negative once expired */
  daysLeft: number;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Documents of current employees that expire within `within` days (or already have), soonest first */
export function expiringDocuments(employees: readonly Pick<Employee, "id" | "name" | "nickname" | "endDate" | "documents">[], today: string, within = 30): ExpiringDocument[] {
  const out: ExpiringDocument[] = [];
  for (const e of employees) {
    if (e.endDate && e.endDate < today) continue;
    for (const doc of e.documents) {
      const daysLeft = daysBetween(today, doc.expires);
      if (daysLeft <= within) out.push({ employee: e, doc, daysLeft });
    }
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}
