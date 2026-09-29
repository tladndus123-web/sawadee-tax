// Which days of a month a branch's shop (POS) sales are in, missing, or not expected. Only the "store" channel
// counts: delivery apps don't sell every day. Nothing is missing before the branch's first store sale (a new
// branch, or a book started mid-year), on its regular closing weekdays, or from today on (today's closing report
// comes in tonight).

import type { Sale } from "./sales";

export type DayState = "sold" | "missing" | "closed" | "later" | "before";

export interface SaleDay {
  date: string;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  state: DayState;
  /** The store sale of that day, when there is one */
  sale?: Sale;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function saleDays(sales: Sale[], branchId: string, month: string, today: string, closedDays: number[] = []): SaleDay[] {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return [];
  const store = sales.filter((s) => s.channel === "store" && s.branchId === branchId);
  const byDate = new Map(store.map((s) => [s.date, s]));
  const first = store.reduce((min, s) => (s.date && (!min || s.date < min) ? s.date : min), "");
  const closed = new Set(closedDays);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: SaleDay[] = [];
  for (let d = 1; d <= last; d++) {
    const date = `${month}-${pad(d)}`;
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const sale = byDate.get(date);
    const state: DayState = sale
      ? "sold"
      : date >= today
        ? "later"
        : !first || date < first
          ? "before"
          : closed.has(weekday)
            ? "closed"
            : "missing";
    out.push({ date, weekday, state, ...(sale ? { sale } : {}) });
  }
  return out;
}

export const missingDays = (days: SaleDay[]) => days.filter((d) => d.state === "missing");
