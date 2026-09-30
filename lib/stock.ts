// Month-end stock (owner's choice 2026-10-01): one total per branch and month of the food and supplies left.
// The food cost of a month is then what was used — purchases + last month's stock − this month's — so buying a
// lot on the 30th no longer makes the month look expensive. It counts for a branch only when both months are in.
// Satang integers out.

import { toSatang } from "./money";

export interface StockCount {
  branchId: string;
  month: string;
  /** Baht */
  amount: number;
  note: string;
}

export const prevMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export interface StockChange {
  /** Satang added to the month's food cost: last month's stock − this month's (negative = stock grew) */
  change: number;
  /** Totals of the branches that counted (satang) */
  opening: number;
  closing: number;
  /** Branches with both counts (the change applies), and with only one of them (it does not yet) */
  applied: number;
  partial: number;
}

/** The month's stock change over the given counts (already narrowed to a branch or all) */
export function stockChange(counts: readonly StockCount[], month: string): StockChange {
  const prev = prevMonth(month);
  const at = (b: string, m: string) => counts.find((c) => c.branchId === b && c.month === m);
  const branches = [...new Set(counts.filter((c) => c.month === month || c.month === prev).map((c) => c.branchId))];
  const out: StockChange = { change: 0, opening: 0, closing: 0, applied: 0, partial: 0 };
  for (const b of branches) {
    const open = at(b, prev);
    const close = at(b, month);
    if (!open || !close) {
      out.partial += 1;
      continue;
    }
    out.applied += 1;
    out.opening += toSatang(open.amount);
    out.closing += toSatang(close.amount);
  }
  out.change = out.opening - out.closing;
  return out;
}
