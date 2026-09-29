"use client";

// Employees and payroll in Supabase (admins only: public.employees, public.payroll_lines). Saving a month keeps what
// the app worked out per period (so payslips never change afterwards) and puts the month's labour cost of each branch
// into the cost control (public.labor_costs: pay and the company's social security share; "other" is left as typed).

import { useEffect, useSyncExternalStore } from "react";
import { allowanceTotal, type AllowanceRow, customNames, parseAllowances, type SavedAllowance, savedFromRows } from "./allowances";
import { parseDocuments } from "./attendance";
import { type Employee, EMPTY_PERIOD, monthPay, type PayrollSettings, type PeriodInput } from "./payroll";
import { supabaseBrowser } from "./supabase/client";

type EmpRow = {
  id: string;
  branch_id: string;
  name: string;
  nickname: string;
  position: string;
  pay_type: "monthly" | "daily";
  rate: number | string;
  start_date: string | null;
  end_date: string | null;
  ss_enrolled: boolean;
  national_id: string;
  address: string;
  extra_allowance: number | string;
  wht_fixed: number | string | null;
  note: string;
  documents?: unknown;
};

const toEmployee = (r: EmpRow): Employee => ({
  id: r.id,
  branchId: r.branch_id,
  name: r.name,
  nickname: r.nickname ?? "",
  position: r.position ?? "",
  payType: r.pay_type,
  rate: Number(r.rate) || 0,
  startDate: r.start_date ?? "",
  endDate: r.end_date ?? "",
  ssEnrolled: !!r.ss_enrolled,
  nationalId: r.national_id ?? "",
  address: r.address ?? "",
  extraAllowance: Number(r.extra_allowance) || 0,
  whtFixed: r.wht_fixed === null || r.wht_fixed === undefined ? null : Number(r.wht_fixed),
  note: r.note ?? "",
  documents: parseDocuments(r.documents),
});

let employees: Employee[] = [];
let loaded = false;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function reload() {
  const { data, error } = await supabaseBrowser().from("employees").select("*").order("name");
  if (error) throw error;
  employees = ((data ?? []) as EmpRow[]).map(toEmployee);
  loaded = true;
  emit();
}

export function useEmployees(): { employees: Employee[]; loaded: boolean } {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => employees,
    () => employees,
  );
  useEffect(() => {
    if (started) return;
    started = true;
    void reload().catch(() => (started = false));
  }, []);
  return { employees: snap, loaded };
}

export async function saveEmployee(e: Employee & { isNew?: boolean }) {
  const row = {
    ...(e.branchId ? { branch_id: e.branchId } : {}),
    name: e.name.trim(),
    nickname: e.nickname.trim(),
    position: e.position.trim(),
    pay_type: e.payType,
    rate: Math.max(0, e.rate || 0),
    start_date: e.startDate || null,
    end_date: e.endDate || null,
    ss_enrolled: e.ssEnrolled,
    national_id: e.nationalId.replace(/\D/g, ""),
    address: e.address.trim(),
    extra_allowance: Math.max(0, e.extraAllowance || 0),
    wht_fixed: e.whtFixed,
    note: e.note.trim(),
    documents: parseDocuments(e.documents),
    updated_at: new Date().toISOString(),
  };
  const q = e.isNew ? supabaseBrowser().from("employees").insert(row).select("id") : supabaseBrowser().from("employees").update(row).eq("id", e.id).select("id");
  const { data, error } = await q;
  if (error) throw error;
  if (!data?.length) throw new Error("not allowed");
  await reload();
}

/** Only an employee who was never paid (the database keeps paid ones: set an end date instead) */
export async function deleteEmployee(id: string) {
  const { error } = await supabaseBrowser().from("employees").delete().eq("id", id);
  if (error) throw error;
  await reload();
}

export interface PayrollLineRow extends PeriodInput {
  employeeId: string;
  branchId: string;
  month: string;
  period: 1 | 2;
  /** As paid (a later raise leaves the payslip alone) */
  payType: "monthly" | "daily";
  rate: number;
  gross: number;
  ssEmployee: number;
  ssEmployer: number;
  wht: number;
  net: number;
  paidOn: string;
  /** What `allowance` is made of (empty on lines saved before names existed) */
  allowances: SavedAllowance[];
}

export async function loadPayroll(opts: { month?: string; year?: string } = {}): Promise<PayrollLineRow[]> {
  let q = supabaseBrowser().from("payroll_lines").select("*");
  if (opts.month) q = q.eq("month", opts.month);
  if (opts.year) q = q.like("month", `${opts.year}-%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    employeeId: r.employee_id,
    branchId: r.branch_id,
    month: r.month,
    period: r.period,
    payType: r.pay_type === "daily" ? "daily" : "monthly",
    rate: Number(r.rate) || 0,
    daysWorked: Number(r.days_worked) || 0,
    absentDays: Number(r.absent_days) || 0,
    otHours: Number(r.ot_hours) || 0,
    holidayHours: Number(r.holiday_hours) || 0,
    holidayOtHours: Number(r.holiday_ot_hours) || 0,
    bonus: Number(r.bonus) || 0,
    allowance: Number(r.allowance) || 0,
    otherDeduction: Number(r.other_deduction) || 0,
    gross: Number(r.gross) || 0,
    ssEmployee: Number(r.ss_employee) || 0,
    ssEmployer: Number(r.ss_employer) || 0,
    wht: Number(r.wht) || 0,
    net: Number(r.net) || 0,
    paidOn: r.paid_on ?? "",
    allowances: parseAllowances(r.allowances),
  }));
}

const lastDay = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);

/**
 * Save a month's payroll: two lines per employee as worked out, then each branch's labour cost for the month
 * (pay + the company's social security) into the cost control. A closed month is refused by the database.
 */
export async function savePayrollMonth(month: string, input: { employee: Employee; first: PeriodInput; second: PeriodInput; allowances?: AllowanceRow[] }[], s: PayrollSettings) {
  const sb = supabaseBrowser();
  const rows = input.flatMap(({ employee: e, first: f, second: g, allowances }) => {
    // With named allowances, their totals are the allowance of each half (the names and the pay never disagree)
    const first = allowances ? { ...f, allowance: allowanceTotal(allowances, "first") } : f;
    const second = allowances ? { ...g, allowance: allowanceTotal(allowances, "second") } : g;
    const m = monthPay(e, first, second, s);
    const line = (period: 1 | 2, p: PeriodInput) => ({
      employee_id: e.id,
      branch_id: e.branchId,
      month,
      period,
      pay_type: e.payType,
      rate: e.rate,
      days_worked: p.daysWorked,
      absent_days: p.absentDays,
      ot_hours: p.otHours,
      holiday_hours: p.holidayHours,
      holiday_ot_hours: p.holidayOtHours,
      bonus: p.bonus,
      allowance: p.allowance,
      other_deduction: p.otherDeduction,
      gross: period === 1 ? m.first.gross : m.second.gross,
      ss_employee: period === 2 ? m.ssEmployee : 0,
      ss_employer: period === 2 ? m.ssEmployer : 0,
      wht: period === 2 ? m.wht : 0,
      net: period === 1 ? m.netFirst : m.netSecond,
      paid_on: period === 1 ? `${month}-15` : lastDay(month),
      allowances: savedFromRows(allowances ?? [], period === 1 ? "first" : "second"),
    });
    return [line(1, first ?? EMPTY_PERIOD), line(2, second ?? EMPTY_PERIOD)];
  });
  if (rows.length) {
    const { error } = await sb.from("payroll_lines").upsert(rows, { onConflict: "employee_id,month,period" });
    if (error) throw error;
  }
  // Labour cost per branch: pay + the company's social security, from every line of the month
  const all = await loadPayroll({ month });
  const byBranch = new Map<string, { wages: number; ss: number }>();
  for (const l of all) {
    const b = byBranch.get(l.branchId) ?? { wages: 0, ss: 0 };
    b.wages += Math.round(l.gross * 100);
    b.ss += Math.round(l.ssEmployer * 100);
    byBranch.set(l.branchId, b);
  }
  const { data: existing } = await sb.from("labor_costs").select("branch_id, other, note").eq("month", month);
  const keep = new Map((existing ?? []).map((r) => [r.branch_id as string, r]));
  const labor = [...byBranch].map(([branchId, v]) => ({
    branch_id: branchId,
    month,
    wages: v.wages / 100,
    social_security: v.ss / 100,
    other: Number(keep.get(branchId)?.other ?? 0),
    note: (keep.get(branchId)?.note as string) || "payroll",
  }));
  if (labor.length) {
    const { error } = await sb.from("labor_costs").upsert(labor, { onConflict: "branch_id,month" });
    if (error) throw error;
  }
}

export interface PayrollCheck {
  checkedAt: number;
  /** The admin's name (or email); null if that account is gone */
  checkedBy: string | null;
}

/** Which employees' pay the office checked for the month, and who */
export async function loadPayrollChecks(month: string): Promise<Map<string, PayrollCheck>> {
  const sb = supabaseBrowser();
  const [{ data, error }, { data: members }] = await Promise.all([
    sb.from("payroll_checks").select("employee_id, checked_at, checked_by").eq("month", month),
    sb.from("members").select("user_id, name, email"),
  ]);
  if (error) throw error;
  const who = new Map((members ?? []).map((m) => [m.user_id as string, (m.name as string) || (m.email as string)]));
  return new Map(
    (data ?? []).map((r) => [r.employee_id as string, { checkedAt: Date.parse(r.checked_at as string), checkedBy: r.checked_by ? (who.get(r.checked_by as string) ?? null) : null }]),
  );
}

/** Check (or undo) one employee's saved pay for the month. Who / when are stamped by the database. */
export async function setPayrollCheck(employeeId: string, month: string, on: boolean) {
  const sb = supabaseBrowser();
  const { error } = on
    ? await sb.from("payroll_checks").upsert({ employee_id: employeeId, month }, { onConflict: "employee_id,month" })
    : await sb.from("payroll_checks").delete().eq("employee_id", employeeId).eq("month", month);
  if (error) throw error;
}

/** Allowance names typed on earlier pay runs, offered in the list next to the built-in ones */
export async function loadAllowanceNames(): Promise<string[]> {
  const { data, error } = await supabaseBrowser().from("payroll_lines").select("allowances").neq("allowances", "[]");
  if (error) throw error;
  return customNames((data ?? []).flatMap((r) => parseAllowances(r.allowances)));
}
