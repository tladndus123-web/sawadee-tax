// Break-even point for a restaurant (owner's choice 2026-10-01): the sales (without VAT) at which the month makes
// neither profit nor loss. Food cost (the "food cost" categories, after the stock change) moves with sales; every
// other cost — labour, rent and fixed costs, utilities, supplies not counted as food, depreciation — is treated as
// fixed. Break-even = fixed ÷ (1 − food cost ratio). The current month is judged on last month's costs, because
// this month's bills are not all in yet. Satang integers in and out.

export interface BreakEven {
  /** Satang; null when there is nothing to judge by (no sales in the month used) or food costs eat all sales */
  point: number | null;
  fixed: number;
  /** Food cost as a share of sales (0–1) */
  foodRatio: number;
}

export function breakEven(costs: { byCategory: ReadonlyMap<string, number>; cost: number; stock?: number }, foodKeys: ReadonlySet<string>, labor: number, salesValue: number): BreakEven {
  let food = costs.stock ?? 0;
  for (const [k, v] of costs.byCategory) if (foodKeys.has(k)) food += v;
  const fixed = costs.cost - food + labor;
  if (salesValue <= 0) return { point: null, fixed, foodRatio: 0 };
  const foodRatio = Math.max(0, food / salesValue);
  if (foodRatio >= 1) return { point: null, fixed, foodRatio };
  return { point: Math.round(fixed / (1 - foodRatio)), fixed, foodRatio };
}

export interface Progress {
  /** Sales so far against the goal (0–…) */
  ratio: number;
  /** Still needed (satang, 0 once reached) and per open day left (null when no open day is left) */
  left: number;
  perDay: number | null;
}

export function progress(sales: number, goal: number, openDaysLeft: number): Progress {
  const left = Math.max(0, goal - sales);
  return { ratio: goal > 0 ? sales / goal : 0, left, perDay: left && openDaysLeft > 0 ? Math.ceil(left / openDaysLeft) : left ? null : 0 };
}

/** Days from today to the month's end (today included) that are not regular closing weekdays */
export function openDaysLeft(month: string, today: string, closedDays: readonly number[] = []): number {
  if (today.slice(0, 7) > month) return 0;
  const [y, m] = month.split("-").map(Number);
  const closed = new Set(closedDays);
  let n = 0;
  for (let d = today.slice(0, 7) === month ? Number(today.slice(8, 10)) : 1; d <= daysIn(month); d++) if (!closed.has(new Date(Date.UTC(y, m - 1, d)).getUTCDay())) n += 1;
  return n;
}

const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
