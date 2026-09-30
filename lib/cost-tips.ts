// "원가 체크 포인트" (owner's choice 2026-10-01): the cost card's numbers put into a few plain sentences, most
// important first, each with what to do about it. Pure: the card turns the keys into words and buttons.

import type { CostControl, CostLine } from "./cost-control";

export type TipAction = "sales" | "labor" | "stock";

export interface CostTip {
  key: "noSales" | "over" | "rentSales" | "rise" | "fall" | "noLabor" | "stock" | "allGood";
  tone: "bad" | "warn" | "ok" | "info";
  /** Which line (food / labor / rent / fl / flr) */
  line?: "food" | "labor" | "rent" | "fl" | "flr";
  /** Percentage points over the target, or change since last month */
  points?: number;
  /** Satang: sales still needed for rent to fit its target */
  amount?: number;
  action?: TipAction;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function costTips(opts: {
  now: CostControl;
  /** Last month, for the change in food cost (null = nothing to compare) */
  before: CostControl | null;
  /** Satang */
  salesValue: number;
  laborEntered: boolean;
  /** Month-end stock is counted for this month (both months in) */
  stockCounted: boolean;
  /** The month is over, or in its last days: time for the stock count */
  monthEnding: boolean;
}): CostTip[] {
  const { now, before, salesValue } = opts;
  const tips: CostTip[] = [];
  if (salesValue <= 0) {
    tips.push({ key: "noSales", tone: "info", action: "sales" });
  } else {
    // Over the target, worst first (the headline FL / FLR only when no single line explains it)
    const lines = (["food", "labor", "rent"] as const).map((k) => ({ k, l: now[k] }));
    const over = lines.filter(({ l }) => l.pct !== null && (l.level === "near" || l.level === "over")).sort((a, b) => overBy(b.l) - overBy(a.l));
    for (const { k, l } of over) {
      if (k === "rent") {
        // Rent does not move with sales: say how much more has to be sold for it to fit
        const needed = Math.max(0, Math.ceil((l.amount * 100) / l.target) - salesValue);
        tips.push({ key: "rentSales", tone: l.level === "over" ? "bad" : "warn", line: k, points: round1(overBy(l)), amount: needed });
      } else {
        tips.push({ key: "over", tone: l.level === "over" ? "bad" : "warn", line: k, points: round1(overBy(l)) });
      }
    }
    if (!over.length)
      for (const k of ["fl", "flr"] as const) {
        const l = now[k];
        if (l.pct !== null && (l.level === "near" || l.level === "over")) tips.push({ key: "over", tone: l.level === "over" ? "bad" : "warn", line: k, points: round1(overBy(l)) });
      }
    // Food cost against last month
    if (before?.food.pct != null && now.food.pct !== null) {
      const d = round1(now.food.pct - before.food.pct);
      if (d >= 2) tips.push({ key: "rise", tone: "warn", line: "food", points: d });
      else if (d <= -2) tips.push({ key: "fall", tone: "ok", line: "food", points: -d });
    }
  }
  if (!opts.laborEntered) tips.push({ key: "noLabor", tone: "info", action: "labor" });
  if (!opts.stockCounted && opts.monthEnding) tips.push({ key: "stock", tone: "info", action: "stock" });
  if (!tips.length) tips.push({ key: "allGood", tone: "ok" });
  return tips;
}

const overBy = (l: CostLine) => (l.pct ?? 0) - l.target;
