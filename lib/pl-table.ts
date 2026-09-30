// Profit and loss by category, several months side by side (the table accountants like). Same money rules as
// the month's result (lib/sales monthResult): sales without VAT; a purchase costs its total minus the input VAT
// that can be claimed, in the month of its invoice. Satang integers throughout.

import { type LaborLine, monthLabor } from "./cost-control";
import { monthCosts } from "./cost-split";
import { type FixedLine, fixedForMonth } from "./fixed-costs";
import { fromSatang, toSatang } from "./money";
import { type StockCount, stockChange } from "./stock";
import { type Channel, CHANNELS, saleMonth, type Sale } from "./sales";
import { type Category, CATEGORIES, type LedgerDoc } from "./types";

export interface PlRow<K> {
  key: K;
  values: number[];
  total: number;
}

export interface PlTable {
  /** Oldest first, ending with the chosen month */
  months: string[];
  sales: PlRow<Channel>[];
  salesTotal: PlRow<"total">;
  /** By category, biggest first; "depreciation" = equipment written off this month (lib/cost-split) */
  costs: PlRow<Category | "depreciation" | "disposal" | "labor" | "stock">[];
  costTotal: PlRow<"total">;
  profit: PlRow<"total">;
}

/** n months ending with endMonth (YYYY-MM), oldest first */
export function monthsEnding(endMonth: string, n: number): string[] {
  const [y, m] = endMonth.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function plTable(
  sales: Pick<Sale, "date" | "channel" | "gross" | "vat">[],
  purchases: LedgerDoc[],
  endMonth: string,
  n: number,
  companyTaxId: string,
  labor: LaborLine[] = [],
  fixed: FixedLine[] = [],
  stock: StockCount[] = [],
): PlTable {
  const months = monthsEnding(endMonth, n);
  const at = new Map(months.map((m, i) => [m, i]));
  const byCh = new Map<Channel, number[]>();
  const byCat = new Map<Category | "depreciation" | "disposal" | "labor" | "stock", number[]>();
  const add = <K>(map: Map<K, number[]>, k: K, i: number, v: number) => {
    const row = map.get(k) ?? months.map(() => 0);
    row[i] += v;
    map.set(k, row);
  };
  for (const s of sales) {
    const i = at.get(saleMonth(s));
    if (i !== undefined) add(byCh, s.channel, i, toSatang(s.gross) - toSatang(s.vat));
  }
  for (const [i, m] of months.entries()) {
    const c = monthCosts(purchases, m, companyTaxId, fixedForMonth(fixed, m), stockChange(stock, m).change);
    for (const [cat, v] of c.byCategory) add(byCat, cat, i, v);
    if (c.depreciation) add(byCat, "depreciation", i, c.depreciation);
    if (c.disposal) add(byCat, "disposal", i, c.disposal);
    if (c.stock) add(byCat, "stock", i, c.stock);
    const l = monthLabor(labor, m);
    if (l) add(byCat, "labor", i, l);
  }
  const row = <K>(key: K, sat: number[]): PlRow<K> => ({ key, values: sat.map(fromSatang), total: fromSatang(sat.reduce((a, b) => a + b, 0)) });
  const sum = (rows: number[][]) => months.map((_, i) => rows.reduce((a, r) => a + r[i], 0));
  const salesSat = sum([...byCh.values()]);
  const costSat = sum([...byCat.values()]);
  return {
    months,
    sales: CHANNELS.filter((c) => byCh.has(c)).map((c) => row(c, byCh.get(c)!)),
    salesTotal: row("total", salesSat),
    // Biggest cost first (over the whole period), so the table reads top-down by weight
    costs: [...CATEGORIES, ...[...byCat.keys()].filter((k) => k.startsWith("c_")), "labor" as const, "depreciation" as const, "disposal" as const, "stock" as const]
      .filter((c, i, all) => byCat.has(c) && all.indexOf(c) === i)
      .map((c) => row(c, byCat.get(c)!))
      .sort((a, b) => b.total - a.total),
    costTotal: row("total", costSat),
    profit: row("total", months.map((_, i) => salesSat[i] - costSat[i])),
  };
}

/** A value as a share of that column's sales, in percent with one decimal; null when the column has no sales */
export function shareOfSales(value: number, sales: number): number | null {
  if (!sales || sales <= 0) return null;
  return Math.round((value / sales) * 1000) / 10;
}

/** A row's shares, month by month and for the whole period (against the sales of the same column) */
export function rowShares(r: PlRow<unknown>, salesTotal: PlRow<unknown>): { values: (number | null)[]; total: number | null } {
  return { values: r.values.map((v, i) => shareOfSales(v, salesTotal.values[i])), total: shareOfSales(r.total, salesTotal.total) };
}
