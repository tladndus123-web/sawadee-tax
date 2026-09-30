// The last days of sales for the dashboard (owner's choice 2026-10-01): each day's sales without VAT (channels added
// up), ending yesterday — today's closing report comes in tonight — and yesterday against the same weekday a week
// earlier. Satang integers out.

import { toSatang } from "./money";
import type { Sale } from "./sales";

export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export interface RecentDay {
  date: string;
  /** Satang; 0 = no sales entered */
  value: number;
}

export interface RecentSales {
  /** Oldest first, ending yesterday */
  days: RecentDay[];
  total: number;
  /** Yesterday, and the same weekday one week before it (satang) */
  yesterday: number;
  weekAgo: number;
  /** Yesterday against a week earlier (−1…); null when either day has no sales */
  change: number | null;
}

export function recentSales(sales: Pick<Sale, "date" | "gross" | "vat">[], today: string, n = 7): RecentSales {
  const byDate = new Map<string, number>();
  const from = addDays(today, -Math.max(n, 8));
  for (const s of sales) {
    if (!s.date || s.date < from || s.date >= today) continue;
    byDate.set(s.date, (byDate.get(s.date) ?? 0) + toSatang(s.gross) - toSatang(s.vat));
  }
  const days = Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i - n);
    return { date, value: byDate.get(date) ?? 0 };
  });
  const yesterday = byDate.get(addDays(today, -1)) ?? 0;
  const weekAgo = byDate.get(addDays(today, -8)) ?? 0;
  return {
    days,
    total: days.reduce((a, d) => a + d.value, 0),
    yesterday,
    weekAgo,
    change: yesterday > 0 && weekAgo > 0 ? yesterday / weekAgo - 1 : null,
  };
}
