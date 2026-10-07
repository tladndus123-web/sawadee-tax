// The shop's cash box (public.cash_moves): money put in, spent, and counted. The balance runs in date order; a count
// sets it to what was really there and shows the difference. Spending without a receipt is a cost of its month (no
// VAT to claim) and joins the fixed costs in every cost figure; spending with a receipt is entered as a ledger
// document, so it is left out here. Money in satang.

import type { FixedLine } from "./fixed-costs";
import { toSatang } from "./money";
import type { Category } from "./types";

export type CashKind = "in" | "out" | "count";

export interface CashMove {
  id: string;
  branchId: string;
  /** YYYY-MM-DD */
  day: string;
  kind: CashKind;
  /** Baht */
  amount: number;
  category: Category | null;
  /** Spending: there is a receipt (it goes into the ledger as a document) */
  receipt: boolean;
  memo: string;
  createdBy: string | null;
  createdAt: string;
}

export interface CashRow {
  move: CashMove;
  /** Balance after this line, satang */
  after: number;
  /** A count: counted − expected, satang (minus = short) */
  diff: number | null;
}

/** Every line in order with the balance after it; `balance` = now (satang) */
export function cashBook(moves: readonly CashMove[]): { rows: CashRow[]; balance: number } {
  const sorted = [...moves].sort((a, b) => a.day.localeCompare(b.day) || a.createdAt.localeCompare(b.createdAt));
  let bal = 0;
  const rows = sorted.map((m) => {
    const amt = toSatang(m.amount);
    let diff: number | null = null;
    if (m.kind === "in") bal += amt;
    else if (m.kind === "out") bal -= amt;
    else {
      diff = amt - bal;
      bal = amt;
    }
    return { move: m, after: bal, diff };
  });
  return { rows, balance: bal };
}

export interface CashMonth {
  in: number;
  out: number;
  /** Spent without a receipt (counts as cost, no VAT back) */
  noReceipt: number;
  /** Sum of the count differences (minus = cash missing) */
  diff: number;
}

/** A month's cash in satang */
export function cashMonth(moves: readonly CashMove[], month: string): CashMonth {
  const out: CashMonth = { in: 0, out: 0, noReceipt: 0, diff: 0 };
  for (const r of cashBook(moves).rows) {
    if (r.move.day.slice(0, 7) !== month) continue;
    const amt = toSatang(r.move.amount);
    if (r.move.kind === "in") out.in += amt;
    if (r.move.kind === "out") {
      out.out += amt;
      if (!r.move.receipt) out.noReceipt += amt;
    }
    if (r.diff) out.diff += r.diff;
  }
  return out;
}

/** Spending without a receipt as one-month cost lines, to go with the fixed costs (lib/fixed-costs fixedForMonth) */
export function cashCostLines(moves: readonly CashMove[]): FixedLine[] {
  return moves
    .filter((m) => m.kind === "out" && !m.receipt && m.category)
    .map((m) => ({
      id: `cash:${m.id}`,
      branchId: m.branchId,
      category: m.category as Category,
      name: m.memo,
      amount: m.amount,
      fromMonth: m.day.slice(0, 7),
      toMonth: m.day.slice(0, 7),
      note: "",
    }));
}
