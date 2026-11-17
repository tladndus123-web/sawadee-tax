// AI prep forecast (owner 2026-11-18, a restaurant extra — Settings → 음식점 기능, from the for-sale version): how the
// next days should sell against a usual day, and how much of the main ingredients to prepare tomorrow. The program does
// the arithmetic; the AI only words it (lib/prep-brief). Pure.
//
// - Sales: the branch's daily totals without VAT. A usual open day = the last 4 weeks' open days with each weekday's
//   pattern (last 8 weeks) taken out; a weekday the shop is closed on (its setting, or no sales on it for 8 weeks while
//   open on others) is "closed", never "missing".
// - Ingredients: there is no kitchen stock count in the books, so use is read from purchases — food-category lines of the
//   last 4 weeks per item and unit, per calendar day — and scaled by tomorrow's expected sales against an average day.

import type { Sale } from "./sales";
import type { LedgerDoc } from "./types";

const DAY = 86_400_000;
const dn = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const iso = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

export const PREP_WINDOW = 28;
export const PREP_STEP = 10;
export type PrepAdvice = "more" | "less" | "usual" | "closed";

export interface PrepDay {
  day: string;
  /** Expected sales without VAT, whole baht (0 on a closed day) */
  expected: number;
  /** Against a usual open day, whole % */
  pct: number;
  advice: PrepAdvice;
}

export interface PrepForecast {
  /** Enough history (10+ open days with sales in the last 4 weeks) */
  enough: boolean;
  usual: number;
  /** Average per calendar day over the last 4 weeks (closed days included), baht */
  daily: number;
  days: PrepDay[];
  /** The coming open days together against as many usual days, % */
  weekPct: number;
}

/** Daily totals without VAT (satang → baht), the given branches only */
export function dailySales(sales: readonly Sale[], branchIds?: readonly string[]): Map<string, number> {
  const ids = branchIds ? new Set(branchIds) : null;
  const m = new Map<string, number>();
  for (const s of sales) {
    if (ids && !ids.has(s.branchId)) continue;
    m.set(s.date, (m.get(s.date) ?? 0) + Math.round((s.gross - s.vat) * 100));
  }
  return new Map([...m].map(([d, v]) => [d, v / 100]));
}

/** Weekdays without a sale in the last 8 weeks while open on others (with 14+ open days), plus the set closing days */
export function closedWeekdays(byDay: ReadonlyMap<string, number>, today: string, setClosed: readonly number[] = []): Set<number> {
  const open = Array(7).fill(0);
  let any = 0;
  for (let n = dn(today) - 56; n < dn(today); n++) {
    if ((byDay.get(iso(n)) ?? 0) > 0) {
      open[new Date(n * DAY).getUTCDay()] += 1;
      any += 1;
    }
  }
  return new Set([...setClosed, ...(any >= 14 ? open.flatMap((c, w) => (c === 0 ? [w] : [])) : [])]);
}

/** Each weekday's average open day against the overall average open day (8 weeks); 1 when not known */
export function weekdayFactors(byDay: ReadonlyMap<string, number>, today: string): number[] {
  const sum = Array(7).fill(0);
  const cnt = Array(7).fill(0);
  for (let n = dn(today) - 56; n < dn(today); n++) {
    const v = byDay.get(iso(n)) ?? 0;
    if (v <= 0) continue;
    const w = new Date(n * DAY).getUTCDay();
    sum[w] += v;
    cnt[w] += 1;
  }
  const avgs = sum.map((s, w) => (cnt[w] ? s / cnt[w] : 0));
  const known = avgs.filter((a) => a > 0);
  const overall = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0;
  return avgs.map((a) => (a > 0 && overall > 0 ? a / overall : 1));
}

const adviceOf = (pct: number): PrepAdvice => (pct >= PREP_STEP ? "more" : pct <= -PREP_STEP ? "less" : "usual");

export function prepForecast(byDay: ReadonlyMap<string, number>, today: string, setClosed: readonly number[] = [], days = 7): PrepForecast {
  const closed = closedWeekdays(byDay, today, setClosed);
  const factor = weekdayFactors(byDay, today);
  let sales = 0;
  let weight = 0;
  let seen = 0;
  let total = 0;
  for (let n = dn(today) - PREP_WINDOW; n < dn(today); n++) {
    const d = iso(n);
    const v = byDay.get(d) ?? 0;
    total += Math.max(0, v);
    if (v <= 0 || closed.has(dow(d))) continue;
    sales += v;
    weight += factor[dow(d)];
    seen += 1;
  }
  const usual = weight > 0 ? sales / weight : 0;
  if (seen < 10 || usual <= 0) return { enough: false, usual: 0, daily: 0, days: [], weekPct: 0 };
  const out: PrepDay[] = [];
  for (let i = 1; i <= days; i++) {
    const d = iso(dn(today) + i);
    if (closed.has(dow(d))) {
      out.push({ day: d, expected: 0, pct: 0, advice: "closed" });
      continue;
    }
    const pct = Math.round((factor[dow(d)] - 1) * 100);
    out.push({ day: d, expected: Math.round(usual * factor[dow(d)]), pct, advice: adviceOf(pct) });
  }
  const open = out.filter((d) => d.advice !== "closed");
  const weekPct = open.length ? Math.round((open.reduce((a, d) => a + d.expected, 0) / (usual * open.length) - 1) * 100) : 0;
  return { enough: true, usual: Math.round(usual), daily: Math.round(total / PREP_WINDOW), days: out, weekPct };
}

// ── Ingredients, from purchases ────────────────────────────────────────────────────────────────────────────────────

export interface PrepIngredient {
  name: string;
  unit: string;
  /** Bought per calendar day over the last 4 weeks */
  perDay: number;
  tomorrow: number;
  /** Baht spent on it in the window */
  spent: number;
}

/** A quantity as a cook measures it: kg / l to 0.1, g / ml to 10, other units whole, always up */
export function prepQty(n: number, unit: string): number {
  if (!(n > 0)) return 0;
  const u = unit.toLowerCase();
  if (u === "kg" || u === "l" || u === "lt" || u === "ลิตร" || u === "กก.") return Math.ceil(n * 10 - 1e-9) / 10;
  if (u === "g" || u === "ml" || u === "กรัม") return Math.ceil(n / 10 - 1e-9) * 10;
  return Math.ceil(n - 1e-9);
}

/**
 * The food items bought in the last 4 weeks (document or line category in `foodKeys`), per name + unit, with tomorrow's
 * amount = bought per day × tomorrow's expected sales ÷ an average day. Most spent first.
 */
export function prepIngredients(docs: readonly LedgerDoc[], foodKeys: ReadonlySet<string>, today: string, f: PrepForecast, max = 8): PrepIngredient[] {
  if (!f.enough || f.daily <= 0 || !f.days.length || f.days[0].advice === "closed") return [];
  const from = iso(dn(today) - PREP_WINDOW);
  const by = new Map<string, { name: string; unit: string; qty: number; spent: number }>();
  for (const d of docs) {
    if (!d.date || d.date < from || d.date >= today) continue;
    for (const it of d.items) {
      const cat = it.category || d.category;
      if (!foodKeys.has(cat)) continue;
      const name = (it.desc.th || it.desc.en || it.desc.ja).trim();
      const unit = (it.unit.th || it.unit.en || it.unit.ja || "").trim();
      if (!name || !(it.qty > 0)) continue;
      const key = `${name.toLowerCase()}|${unit.toLowerCase()}`;
      const g = by.get(key) ?? { name, unit, qty: 0, spent: 0 };
      g.qty += it.qty;
      g.spent += it.amount || 0;
      by.set(key, g);
    }
  }
  const ratio = f.days[0].expected / f.daily;
  return [...by.values()]
    .map((g) => ({ name: g.name, unit: g.unit, perDay: g.qty / PREP_WINDOW, tomorrow: prepQty((g.qty / PREP_WINDOW) * ratio, g.unit), spent: Math.round(g.spent) }))
    .filter((i) => i.tomorrow > 0)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, max);
}
