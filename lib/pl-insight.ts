// The P&L table at a glance (owner 2026-11-18: "색깔 등으로 한눈에 결론"): each cost cell coloured against its target
// (food / labour / rent from the cost card's targets, lib/cost-control levelOf), the change against the month before in
// percentage points, months whose costs are not all in yet ("비용 입력 전"), and empty months to fold. Pure.

import { type CostTargets, type Level, levelOf } from "./cost-control";
import { type PlRow, type PlTable, rowShares } from "./pl-table";

export type CostKey = PlTable["costs"][number]["key"];

/** Which target a cost row is held to (null = none) */
export function targetOf(key: CostKey, foodKeys: ReadonlySet<string>, t: CostTargets): number | null {
  if (key === "labor") return t.labor;
  if (key === "rent") return t.rent;
  if (foodKeys.has(key as string) || key === "stock") return t.food;
  return null;
}

/** A cost cell's colour level against its target (none when the row has no target or no sales) */
export const cellLevel = (pct: number | null, target: number | null): Level => (target === null ? "none" : levelOf(pct, target));

/** Change of a row's share of sales against the month before, in percentage points (null for the first month, no data, or none of it the month before) */
export function shareChanges(r: PlRow<unknown>, sales: PlRow<unknown>): (number | null)[] {
  const s = rowShares(r, sales).values;
  // Against a month without this cost (0) there is nothing to compare: "▲2.0p" from nothing would only look alarming
  return s.map((p, i) => (i === 0 || p === null || s[i - 1] === null || r.values[i - 1] === 0 ? null : Math.round((p - (s[i - 1] as number)) * 10) / 10));
}

export type Incomplete = "running" | "labor" | "purchases";

/**
 * Months whose figures are not all in, so the profit looks better than it will be: the month still running, a month
 * with sales but no labour while other months have it, or purchases far below the other months' share (under half).
 */
export function incompleteMonths(table: PlTable, thisMonth: string, foodKeys: ReadonlySet<string>): Map<string, Incomplete[]> {
  const out = new Map<string, Incomplete[]>();
  const labor = table.costs.find((c) => c.key === "labor");
  const food = table.costs.filter((c) => foodKeys.has(c.key as string));
  const foodAt = (i: number) => food.reduce((a, r) => a + r.values[i], 0);
  const sales = table.salesTotal.values;
  const shareOf = (i: number) => (sales[i] > 0 ? foodAt(i) / sales[i] : null);
  const others = (i: number) => table.months.map((_, j) => j).filter((j) => j !== i && sales[j] > 0);
  table.months.forEach((m, i) => {
    if (!(sales[i] > 0)) return;
    const why: Incomplete[] = [];
    if (m === thisMonth) why.push("running");
    if (labor && labor.values[i] === 0 && others(i).some((j) => labor.values[j] > 0)) why.push("labor");
    const mine = shareOf(i);
    const rest = others(i).map(shareOf).filter((x): x is number => x !== null && x > 0);
    if (mine !== null && rest.length) {
      const avg = rest.reduce((a, b) => a + b, 0) / rest.length;
      if (mine < avg / 2) why.push("purchases");
    }
    if (why.length) out.set(m, why);
  });
  return out;
}

/** Months with neither sales nor costs (folded away by default) */
export function emptyMonths(table: PlTable): Set<string> {
  return new Set(table.months.filter((_, i) => table.salesTotal.values[i] === 0 && table.costTotal.values[i] === 0));
}

// ── The AI's one-line conclusion: the facts it may word ──────────────────────────────────────────────────────────

export interface PlSheet {
  months: { month: string; sales: number; costs: number; profit: number; profitPct: number | null; incomplete: string[] }[];
  /** The biggest cost rows: share of sales per month (%) */
  rows: { name: string; target: number | null; shares: (number | null)[] }[];
}

export function plSheet(table: PlTable, names: (key: CostKey) => string, foodKeys: ReadonlySet<string>, t: CostTargets, incomplete: Map<string, Incomplete[]>, empty: Set<string>): PlSheet {
  const idx = table.months.map((m, i) => ({ m, i })).filter(({ m }) => !empty.has(m));
  // The table's rows are already in baht (lib/pl-table row → fromSatang); whole baht for the AI
  const baht = (s: number) => Math.round(s);
  const profitShares = rowShares(table.profit, table.salesTotal).values;
  return {
    months: idx.map(({ m, i }) => ({
      month: m,
      sales: baht(table.salesTotal.values[i]),
      costs: baht(table.costTotal.values[i]),
      profit: baht(table.profit.values[i]),
      profitPct: profitShares[i],
      incomplete: incomplete.get(m) ?? [],
    })),
    rows: table.costs.slice(0, 8).map((r) => {
      const s = rowShares(r, table.salesTotal).values;
      return { name: names(r.key), target: targetOf(r.key, foodKeys, t), shares: idx.map(({ i }) => s[i]) };
    }),
  };
}
