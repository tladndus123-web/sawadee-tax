// The month-end LINE report and what hangs off it (owner, 2026-10-26): on the 1st, last month's result — what was left
// (the same profit as the P&L screen), sales, costs, labour, VAT to pay, withholding — plus "📤 send to the accountant"
// (a link that shows that month without signing in, lib accountant_shares) and "📊 set next month's target".

import crypto from "node:crypto";
import { cashCostLines, type CashMove } from "./petty-cash";
import { monthLabor, type LaborLine } from "./cost-control";
import { fixedForMonth, type FixedLine } from "./fixed-costs";
import { ledger, shiftMonth, sumOf, type Admin } from "./line-ask-server";
import { CHANNELS, type Channel, monthResult, type MonthResult, type Sale } from "./sales";
import { stockChange, type StockCount } from "./stock";
import { buildWhtList } from "./wht";
import { type Category, isCategoryKey } from "./types";

type Row = Record<string, unknown>;

/** Everything the P&L needs, read with the service role (the same tables the screens read) */
async function costInputs(admin: Admin) {
  const [sales, labor, fixed, cash, stock] = await Promise.all([
    admin.from("sales").select("id, branch_id, sale_date, channel, gross, vat, exempt, bills"),
    admin.from("labor_costs").select("branch_id, month, wages, social_security, other, note"),
    admin.from("fixed_costs").select("id, branch_id, category, name, amount, from_month, to_month, note"),
    admin.from("cash_moves").select("id, branch_id, day, kind, amount, category, receipt, memo, created_by, created_at"),
    admin.from("stock_counts").select("branch_id, month, amount, note"),
  ]);
  for (const r of [sales, labor, fixed, cash, stock]) if (r.error) throw r.error;
  const cat = (v: unknown) => (isCategoryKey(String(v)) ? String(v) : "other") as Category;
  return {
    sales: ((sales.data ?? []) as Row[]).map(
      (r): Sale => ({
        id: String(r.id),
        branchId: (r.branch_id as string | null) ?? "",
        date: String(r.sale_date),
        channel: ((CHANNELS as readonly string[]).includes(String(r.channel)) ? r.channel : "other") as Channel,
        docFrom: "",
        docTo: "",
        bills: Number(r.bills) || 0,
        gross: Number(r.gross) || 0,
        vat: Number(r.vat) || 0,
        exempt: Number(r.exempt) || 0,
        note: "",
        photoPath: null,
        source: "manual",
      }),
    ),
    labor: ((labor.data ?? []) as Row[]).map(
      (r): LaborLine => ({ branchId: String(r.branch_id ?? ""), month: String(r.month), wages: Number(r.wages) || 0, socialSecurity: Number(r.social_security) || 0, other: Number(r.other) || 0, note: String(r.note ?? "") }),
    ),
    fixed: ((fixed.data ?? []) as Row[]).map(
      (r): FixedLine => ({ id: String(r.id), branchId: String(r.branch_id ?? ""), category: cat(r.category), name: String(r.name ?? ""), amount: Number(r.amount) || 0, fromMonth: String(r.from_month), toMonth: (r.to_month as string | null) ?? null, note: String(r.note ?? "") }),
    ),
    cash: ((cash.data ?? []) as Row[]).map(
      (r): CashMove => ({
        id: String(r.id),
        branchId: String(r.branch_id ?? ""),
        day: String(r.day),
        kind: r.kind as CashMove["kind"],
        amount: Number(r.amount) || 0,
        category: r.category ? cat(r.category) : null,
        receipt: !!r.receipt,
        memo: String(r.memo ?? ""),
        createdBy: (r.created_by as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }),
    ),
    stock: ((stock.data ?? []) as Row[]).map((r): StockCount => ({ branchId: String(r.branch_id ?? ""), month: String(r.month), amount: Number(r.amount) || 0, note: String(r.note ?? "") })),
  };
}

export interface MonthBooks {
  month: string;
  company: string;
  result: MonthResult;
  previous: MonthResult;
  /** All branches' monthly sales target, without VAT (0 = none) */
  target: number;
  /** Withholding on suppliers (ภ.ง.ด.53 + ภ.ง.ด.3) and on payroll (ภ.ง.ด.1), and social security */
  whtSuppliers: number;
  whtPayroll: number;
  socialSecurity: number;
  documents: number;
  hasSales: boolean;
}

export async function monthBooks(admin: Admin, month: string): Promise<MonthBooks> {
  const [{ saved, taxId, company }, inputs, branches, payroll] = await Promise.all([
    ledger(admin),
    costInputs(admin),
    admin.from("branches").select("sales_target"),
    admin.from("payroll_lines").select("wht, ss_employee, ss_employer").eq("month", month),
  ]);
  const docs = saved.map((d) => d.doc);
  const costLines = [...inputs.fixed, ...cashCostLines(inputs.cash)];
  const resultOf = (m: string) => monthResult(inputs.sales, docs, m, taxId, monthLabor(inputs.labor, m), fixedForMonth(costLines, m), stockChange(inputs.stock, m).change);
  const wht = buildWhtList(saved, month);
  return {
    month,
    company,
    result: resultOf(month),
    previous: resultOf(shiftMonth(month, -1)),
    target: sumOf(branches.data ?? [], "sales_target"),
    whtSuppliers: Math.round((wht.totals.pnd53.tax + wht.totals.pnd3.tax) * 100) / 100,
    whtPayroll: sumOf(payroll.data ?? [], "wht"),
    socialSecurity: Math.round((sumOf(payroll.data ?? [], "ss_employee") + sumOf(payroll.data ?? [], "ss_employer")) * 100) / 100,
    documents: saved.filter((d) => d.doc.date.startsWith(month) || d.doc.taxMonth === month).length,
    hasSales: inputs.sales.some((s) => s.date.startsWith(month)),
  };
}

// ── Accountant links ──────────────────────────────────────────────────────────────────────────────────────────────

/** Days an accountant link works */
export const SHARE_DAYS = 30;

export async function createShare(admin: Admin, userId: string, month: string): Promise<{ token: string; expiresAt: string }> {
  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + SHARE_DAYS * 86_400_000).toISOString();
  const { error } = await admin.from("accountant_shares").insert({ token, month, created_by: userId, expires_at: expiresAt });
  if (error) throw error;
  return { token, expiresAt };
}

/** The month a link shows, or null when it is unknown, revoked or expired */
export async function shareMonth(admin: Admin, token: string): Promise<{ month: string; expiresAt: string } | null> {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null;
  const { data } = await admin.from("accountant_shares").select("month, expires_at, revoked_at").eq("token", token).maybeSingle();
  if (!data || data.revoked_at || Date.parse(data.expires_at as string) <= Date.now()) return null;
  return { month: data.month as string, expiresAt: data.expires_at as string };
}

// ── Next month's target ──────────────────────────────────────────────────────────────────────────────────────────

export interface GoalLine {
  branchId: string;
  no: string;
  name: string;
  /** What the branch did: the better of last month and the 3-month average, sales without VAT */
  base: number;
  target: number;
}

/** A target per branch: its recent sales (without VAT) raised by `raisePct`, rounded up to ฿10,000 */
export function suggestGoals(branches: { id: string; no: string; name: string }[], sales: Sale[], month: string, raisePct: number): GoalLine[] {
  const months = [1, 2, 3].map((n) => shiftMonth(month, -n));
  const value = (b: string, m: string) => sales.filter((s) => (s.branchId || "") === b && s.date.startsWith(m)).reduce((a, s) => a + Math.round((s.gross - s.vat) * 100), 0) / 100;
  // Sales saved without a branch belong to the head office
  const head = branches.find((b) => b.no === "00000")?.id ?? branches[0]?.id ?? "";
  return branches.map((b) => {
    const per = months.map((m) => value(b.id, m) + (b.id === head ? value("", m) : 0));
    const base = Math.max(per[0], per.reduce((a, v) => a + v, 0) / months.length);
    const target = base > 0 ? Math.ceil((base * (1 + raisePct / 100)) / 10_000) * 10_000 : 0;
    return { branchId: b.id, no: b.no, name: b.name, base: Math.round(base), target };
  });
}

export async function goalSuggestion(admin: Admin, month: string, raisePct: number): Promise<GoalLine[]> {
  const [{ data: branches }, inputs] = await Promise.all([admin.from("branches").select("id, no, name").order("sort"), costInputs(admin)]);
  return suggestGoals((branches ?? []) as { id: string; no: string; name: string }[], inputs.sales, month, raisePct);
}

/** Save the suggested targets (the branches' monthly sales target, as on the settings screen) */
export async function setGoals(admin: Admin, lines: GoalLine[]) {
  for (const l of lines) {
    const { error } = await admin.from("branches").update({ sales_target: l.target }).eq("id", l.branchId);
    if (error) throw error;
  }
}
