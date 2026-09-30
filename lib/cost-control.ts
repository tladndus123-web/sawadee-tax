// A restaurant's three big costs against sales (owner's feedback 2026-09-28): food cost (the categories marked
// "food cost" in settings), labour (typed in per branch and month, lib/labor), rent (the rent category) — each as a
// share of sales without VAT; FL (food + labour, the "prime cost") and FLR (all three) are what owners watch first.
// Target shares (30 / 30 / 10 to start) colour the result; the FL and FLR targets are their sums (60 / 70).
// Satang integers in, ratios out.


export interface LaborLine {
  branchId: string;
  month: string;
  wages: number;
  socialSecurity: number;
  other: number;
  note: string;
}

export const laborTotal = (l: Pick<LaborLine, "wages" | "socialSecurity" | "other">) => Math.round(((l.wages || 0) + (l.socialSecurity || 0) + (l.other || 0)) * 100);

/** Labour of a month in satang, for the given lines (already narrowed to a branch or all) */
export const monthLabor = (lines: LaborLine[], month: string) => lines.filter((l) => l.month === month).reduce((a, l) => a + laborTotal(l), 0);

export interface CostTargets {
  food: number;
  labor: number;
  rent: number;
}
export const DEFAULT_TARGETS: CostTargets = { food: 30, labor: 30, rent: 10 };

/** The company's targets, sane ones only (percent 1–100), else the usual ones */
export function targetsOf(raw: unknown): CostTargets {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = (k: keyof CostTargets) => (typeof r[k] === "number" && (r[k] as number) > 0 && (r[k] as number) <= 100 ? (r[k] as number) : DEFAULT_TARGETS[k]);
  return { food: pick("food"), labor: pick("labor"), rent: pick("rent") };
}

/** Room to spare (≤ 80 % of the target), close to it, up to 5 points over, further over; none = no sales */
export type Level = "ok" | "watch" | "near" | "over" | "none";

/** Within the target, up to 5 points over it, or more */
export const levelOf = (pct: number | null, target: number): Level =>
  pct === null ? "none" : pct <= target * 0.8 ? "ok" : pct <= target ? "watch" : pct <= target + 5 ? "near" : "over";

export interface CostLine {
  /** Satang */
  amount: number;
  /** Percent of sales without VAT; null when there are no sales */
  pct: number | null;
  target: number;
  level: Level;
}

export interface CostControl {
  food: CostLine;
  labor: CostLine;
  rent: CostLine;
  /** Food + labour (prime cost) */
  fl: CostLine;
  /** Food + labour + rent */
  flr: CostLine;
}

export function costControl(salesValue: number, costs: { byCategory: ReadonlyMap<string, number>; stock?: number }, foodKeys: ReadonlySet<string>, labor: number, targets: CostTargets): CostControl {
  // Food used = food bought + the month-end stock change (lib/stock)
  let food = costs.stock ?? 0;
  for (const [k, v] of costs.byCategory) if (foodKeys.has(k)) food += v;
  const rent = costs.byCategory.get("rent") ?? 0;
  const pct = (v: number) => (salesValue > 0 ? Math.round((v / salesValue) * 1000) / 10 : null);
  const line = (amount: number, target: number): CostLine => ({ amount, pct: pct(amount), target, level: levelOf(pct(amount), target) });
  return {
    food: line(food, targets.food),
    labor: line(labor, targets.labor),
    rent: line(rent, targets.rent),
    fl: line(food + labor, targets.food + targets.labor),
    flr: line(food + labor + rent, targets.food + targets.labor + targets.rent),
  };
}
