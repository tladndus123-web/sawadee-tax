// The sales screen's AI (owner, 2026-11-06: "매출에도 AI 넣어줘 소넷"): the month's sales turned into a few plain
// lines for the model — per branch the month so far against the same days of last month, the average day, the
// customers and average bill, the weekday pattern of the last 8 weeks, days without sales entered, and the channel
// split. Pure (tested in sales-insight.test.ts); lib/insights-server sends it to Sonnet.

import { type Sale, saleValue } from "./sales";

const DAY = 86_400_000;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const shiftMonth = (m: string, n: number) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);
const r0 = (n: number) => Math.round(n).toLocaleString("en-US");

export interface SalesFacts {
  /** Lines for the model (amounts in baht without VAT) */
  lines: string[];
  /** Days of the month already past (up to today) */
  elapsed: number;
}

/**
 * `branches` in their usual order; `month` = YYYY-MM; `today` = Bangkok date. The month so far runs from the 1st to
 * yesterday — today too once something is entered for it — (or the month's end for a past month); last month is
 * compared over the same number of days.
 */
export function salesFacts(sales: Sale[], branches: { id: string; name: string }[], month: string, today: string): SalesFacts {
  const first = `${month}-01`;
  const monthEnd = add(`${shiftMonth(month, 1)}-01`, -1);
  // Today counts once something is entered for it (the day closes in the evening); until then the month runs to yesterday
  const upTo = sales.some((s) => s.date === today) ? today : add(today, -1);
  const last = upTo < monthEnd ? upTo : monthEnd;
  const elapsed = last >= first ? Number(last.slice(8)) : 0;
  const prev = shiftMonth(month, -1);
  const prevLast = `${prev}-${String(Math.min(elapsed, Number(add(`${month}-01`, -1).slice(8)))).padStart(2, "0")}`;
  const lines: string[] = [];
  const name = new Map(branches.map((b) => [b.id, b.name || "?"]));
  const ids = branches.map((b) => b.id).filter((id) => sales.some((s) => s.branchId === id));
  if (sales.some((s) => !name.has(s.branchId))) ids.push("");
  const sum = (xs: Sale[]) => xs.reduce((a, s) => a + saleValue(s), 0);
  for (const id of ids) {
    const mine = sales.filter((s) => (id ? s.branchId === id : !name.has(s.branchId)));
    const now = mine.filter((s) => s.date >= first && s.date <= last);
    const before = mine.filter((s) => s.date >= `${prev}-01` && s.date <= prevLast);
    const total = sum(now);
    const was = sum(before);
    const days = new Set(now.map((s) => s.date));
    const bills = now.reduce((a, s) => a + s.bills, 0);
    const missing: string[] = [];
    for (let d = first; d <= last; d = add(d, 1)) if (!days.has(d)) missing.push(d.slice(8));
    const change = was ? `${total >= was ? "+" : ""}${Math.round(((total - was) / was) * 100)}% vs same days last month (${r0(was)})` : "no sales last month on the same days";
    lines.push(
      `[${id ? name.get(id) : "no branch"}] ${month} 1–${elapsed}: ${r0(total)} THB, ${change}; ${days.size} days entered, avg ${r0(days.size ? total / days.size : 0)}/day` +
        (bills ? `; ${bills} bills, avg bill ${r0(total / bills)}` : "") +
        (missing.length ? `; NO SALES ENTERED on day ${missing.join(", ")}` : ""),
    );
    // Weekday pattern over the last 8 weeks (average day per weekday)
    const from = add(last, -55);
    const perDay = new Map<string, number>();
    for (const s of mine) if (s.date >= from && s.date <= last) perDay.set(s.date, (perDay.get(s.date) ?? 0) + saleValue(s));
    const wd = WEEKDAY.map((w, i) => {
      const v = [...perDay].filter(([d]) => new Date(`${d}T00:00:00Z`).getUTCDay() === i).map(([, v]) => v);
      return v.length ? `${w} ${r0(v.reduce((a, b) => a + b, 0) / v.length)}` : "";
    }).filter(Boolean);
    if (wd.length) lines.push(`  weekday avg (8 weeks): ${wd.join(" · ")}`);
    // Channels this month
    const ch = new Map<string, number>();
    for (const s of now) ch.set(s.channel, (ch.get(s.channel) ?? 0) + saleValue(s));
    if (ch.size > 1 && total > 0) lines.push(`  channels: ${[...ch].sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c} ${Math.round((v / total) * 100)}%`).join(" · ")}`);
    // The last 7 days, day by day
    const week = [...perDay].filter(([d]) => d > add(last, -7)).sort((a, b) => a[0].localeCompare(b[0]));
    if (week.length) lines.push(`  last 7 days: ${week.map(([d, v]) => `${d.slice(5)} ${WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${r0(v)}`).join(" · ")}`);
  }
  return { lines: elapsed ? lines : [], elapsed };
}
