// Sales by weekday (owner's choice 2026-10-01): over the last few weeks, the average day's sales (without VAT) for
// each weekday — only days that had sales, so closing days don't pull the average down. Helps with staffing,
// ordering and choosing a closing day. Today is left out (its sales come in tonight). Satang integers out.

import { toSatang } from "./money";
import type { Sale } from "./sales";

export interface WeekdayAverage {
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  /** Average day, satang (0 when no day had sales) */
  avg: number;
  /** Days with sales on this weekday in the period */
  days: number;
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function weekdayAverages(sales: Pick<Sale, "date" | "gross" | "vat">[], today: string, weeks: number): WeekdayAverage[] {
  const from = addDays(today, -weeks * 7);
  const byDate = new Map<string, number>();
  for (const s of sales) {
    if (!s.date || s.date < from || s.date >= today) continue;
    byDate.set(s.date, (byDate.get(s.date) ?? 0) + toSatang(s.gross) - toSatang(s.vat));
  }
  const sum = Array(7).fill(0);
  const days = Array(7).fill(0);
  for (const [date, v] of byDate) {
    if (v <= 0) continue;
    const w = new Date(`${date}T00:00:00Z`).getUTCDay();
    sum[w] += v;
    days[w] += 1;
  }
  return sum.map((s, w) => ({ weekday: w, avg: days[w] ? Math.round(s / days[w]) : 0, days: days[w] }));
}
