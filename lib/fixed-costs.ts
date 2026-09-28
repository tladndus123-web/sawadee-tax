// Fixed costs without an invoice (owner's decision 2026-09-29): rent from a landlord who issues no tax invoice,
// internet, insurance … Entered once with a category and the months they apply to; every month in the range counts
// the amount as a cost of that category, next to the purchases read from documents (lib/cost-split monthCosts).
// No VAT is claimed on them (there is no tax invoice). Amounts in baht in the lines; satang out.

import { toSatang } from "./money";
import type { Category } from "./types";

export interface FixedLine {
  id: string;
  branchId: string;
  category: Category;
  name: string;
  /** Per month, baht */
  amount: number;
  /** YYYY-MM, inclusive */
  fromMonth: string;
  /** YYYY-MM, inclusive; null = still running */
  toMonth: string | null;
  note: string;
}

export const fixedActive = (l: Pick<FixedLine, "fromMonth" | "toMonth">, month: string) => l.fromMonth <= month && (!l.toMonth || month <= l.toMonth);

/** The month's fixed costs by category, in satang (lines already narrowed to a branch or all) */
export function fixedForMonth(lines: readonly FixedLine[], month: string): Map<Category, number> {
  const out = new Map<Category, number>();
  for (const l of lines) {
    if (!fixedActive(l, month)) continue;
    out.set(l.category, (out.get(l.category) ?? 0) + toSatang(l.amount));
  }
  return out;
}

/** Sum of a month's fixed costs, satang */
export const fixedTotal = (lines: readonly FixedLine[], month: string) => [...fixedForMonth(lines, month).values()].reduce((a, b) => a + b, 0);

const shift = (ym: string, by: number) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + by, 1)).toISOString().slice(0, 7);
/** The month before */
export const prevMonth = (ym: string) => shift(ym, -1);
