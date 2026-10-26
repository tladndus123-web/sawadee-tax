// Repeating payments found in the books (owner, 2026-10-28: "반복 지출 자동 찾기 → 달력 추천"; ported 2026-10-27): the
// same supplier paid around the same day of the month, for about the same amount, in at least 3 of the last 6 months —
// from the ledger (rent invoices, internet, a cleaning service). Each becomes a suggestion "add it to the calendar?";
// what is already a company date, or was turned down, is left out.
// Money in satang.

import { toSatang } from "./money";
import type { Category } from "./types";

export interface Recurring {
  /** Stable key, also what "no thanks" remembers */
  key: string;
  title: string;
  /** Day of the month it is usually paid */
  day: number;
  /** Typical amount (median), satang */
  amount: number;
  /** Months it was seen in (of the last 6) */
  months: number;
  /** The next such day from today */
  next: string;
  category?: Category;
  from: "ledger";
}

interface Seen {
  key: string;
  title: string;
  date: string;
  amount: number;
  category?: Category;
  from: "ledger";
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};
const norm = (s: string) => s.toUpperCase().replace(/\b(CO|LTD|COMPANY|LIMITED|บริษัท|จำกัด|มหาชน)\b|[^\p{L}\p{N}]/gu, "");
const shiftMonth = (m: string, n: number) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);
const lastDay = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();

/** The next date with this day of the month, from today (the month's last day when it is shorter) */
export function nextDay(day: number, today: string): string {
  for (let k = 0; k < 2; k++) {
    const m = shiftMonth(today.slice(0, 7), k);
    const d = `${m}-${String(Math.min(day, lastDay(m))).padStart(2, "0")}`;
    if (d >= today) return d;
  }
  return today;
}

export function findRecurring(
  input: {
    docs?: { seller: string; taxId?: string; date: string; dueDate?: string; net: number; category?: Category }[];
    /** Titles of the company dates already in the calendar */
    events?: string[];
    dismissed?: string[];
  },
  today: string,
): Recurring[] {
  const since = `${shiftMonth(today.slice(0, 7), -6)}-01`;
  const seen: Seen[] = [];
  for (const d of input.docs ?? []) {
    const key = (d.taxId ?? "").replace(/\D/g, "") || norm(d.seller);
    const date = d.dueDate || d.date;
    if (!key || !date || date < since || date > today || !(d.net > 0)) continue;
    seen.push({ key: `ledger:${key}`, title: d.seller, date, amount: toSatang(d.net), category: d.category, from: "ledger" });
  }
  const groups = new Map<string, Seen[]>();
  for (const s of seen) groups.set(s.key, [...(groups.get(s.key) ?? []), s]);
  const have = (input.events ?? []).map(norm);
  const out: Recurring[] = [];
  for (const [key, list] of groups) {
    if (input.dismissed?.includes(key)) continue;
    // One payment per month (the largest), at least 3 months
    const byMonth = new Map<string, Seen>();
    for (const s of list) {
      const m = s.date.slice(0, 7);
      if (!byMonth.has(m) || byMonth.get(m)!.amount < s.amount) byMonth.set(m, s);
    }
    const ms = [...byMonth.values()];
    if (ms.length < 3) continue;
    const amount = median(ms.map((s) => s.amount));
    const days = ms.map((s) => Number(s.date.slice(8, 10)));
    const day = median(days);
    // About the same amount (±20%) and the same part of the month (±4 days)
    if (!ms.every((s) => Math.abs(s.amount - amount) <= amount * 0.2)) continue;
    if (!days.every((d) => Math.abs(d - day) <= 4)) continue;
    const title = ms[ms.length - 1].title;
    if (have.some((h) => h && (h.includes(norm(title)) || norm(title).includes(h)))) continue;
    out.push({ key, title, day, amount, months: ms.length, next: nextDay(day, today), category: ms[ms.length - 1].category, from: ms[0].from });
  }
  return out.sort((a, b) => b.amount - a.amount).slice(0, 8);
}
