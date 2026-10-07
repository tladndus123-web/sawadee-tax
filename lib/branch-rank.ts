// Branches ranked on the combined board (owner, 2026-10-08): by sales, profit, margin, food + labour share (FL, lower
// is better) or how far towards the month's sales target. A branch with nothing to compare (no sales, no target)
// goes to the end without a rank.

export const RANK_BY = ["sales", "profit", "margin", "fl", "goal"] as const;
export type RankBy = (typeof RANK_BY)[number];

export interface RankInput {
  id: string;
  /** Sales without VAT, baht */
  sales: number;
  profit: number;
  /** profit ÷ sales */
  margin: number;
  /** Food + labour share of sales, percent; null without sales */
  fl: number | null;
  /** Monthly sales target, baht (0 = none) */
  target: number;
  /** Days with sales this month */
  days: number;
}

/** The value a branch is ranked on, or null when it has nothing to compare */
export function rankValue(r: RankInput, by: RankBy): number | null {
  if (by === "goal") return r.target > 0 ? r.sales / r.target : null;
  if (!r.days) return null;
  if (by === "sales") return r.sales;
  if (by === "profit") return r.profit;
  if (by === "margin") return r.margin;
  return r.fl;
}

/** Best first; ties share a rank; branches without a value last (rank null), in their own order */
export function rankBranches<T extends RankInput>(rows: T[], by: RankBy): { row: T; rank: number | null; value: number | null }[] {
  const lowerIsBetter = by === "fl";
  const withValue = rows.map((row, i) => ({ row, i, value: rankValue(row, by) }));
  const ranked = withValue
    .filter((x) => x.value !== null)
    .sort((a, b) => (lowerIsBetter ? a.value! - b.value! : b.value! - a.value!) || a.i - b.i);
  const out = ranked.map((x, k) => ({ row: x.row, value: x.value, rank: k + 1 }));
  for (let k = 1; k < out.length; k++) if (out[k].value === out[k - 1].value) out[k].rank = out[k - 1].rank;
  return [...out, ...withValue.filter((x) => x.value === null).map((x) => ({ row: x.row, value: null, rank: null }))];
}
