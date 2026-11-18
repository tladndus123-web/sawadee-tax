// Several closing reports for one day (customer feedback 2026-11-05, YUNA: breakfast · lunch · dinner). Each slip is
// its own line (supabase …003500_sales_slips.sql); the day is their sum. These rules decide, for a newly read or typed
// line, whether it adds a slip, is a slip already in (read twice), or replaces a typed / imported day total.

import { fromSatang, toSatang } from "./money";
import type { Sale } from "./sales";

type Key = Pick<Sale, "date" | "channel" | "branchId">;
type Slip = Pick<Sale, "docFrom" | "docTo" | "gross" | "vat" | "bills">;

/** The lines of the same branch, day and channel (without the line itself) */
export const sameDay = <T extends Key & { id?: string }>(sales: readonly Sale[], d: T, head = ""): Sale[] => {
  // "" = the head office (a line saved without a branch lands there)
  const b = d.branchId || head;
  return sales.filter((x) => x.date === d.date && x.channel === d.channel && (x.branchId || head) === b && x.id !== d.id);
};

const norm = (v: string) => v.trim().toUpperCase().replace(/\s+/g, "");

/**
 * The same slip read again: the same receipt numbers (first – last) or, with none printed, the very same figures.
 * Different meals of a day never share receipt numbers.
 */
export function sameSlip(a: Slip, b: Slip): boolean {
  const ra = norm(a.docFrom) + "|" + norm(a.docTo);
  const rb = norm(b.docFrom) + "|" + norm(b.docTo);
  if (norm(a.docFrom) && norm(b.docFrom)) return ra === rb;
  if (norm(a.docFrom) || norm(b.docFrom)) return false;
  return toSatang(a.gross) > 0 && toSatang(a.gross) === toSatang(b.gross) && toSatang(a.vat) === toSatang(b.vat) && (a.bills || 0) === (b.bills || 0);
}

/** The date with day and month swapped ("2026-05-11" ⇄ "2026-11-05"), when that is another real date */
export function swappedDate(date: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m || m[2] === m[3] || Number(m[3]) > 12) return null;
  const out = `${m[1]}-${m[3]}-${m[2]}`;
  const d = new Date(`${out}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== out ? null : out;
}

/**
 * The same report already in on another day (feedback 2026-11-18: 3 pairs went in twice because a date was read with day
 * and month swapped, and the twin check only looked at the same day): the same receipt numbers on any day, or the very
 * same figures on the swapped date. Same branch and channel.
 */
export function slipElsewhere<T extends Key & Slip & { id?: string }>(sales: readonly Sale[], d: T, head = ""): Sale | null {
  const b = d.branchId || head;
  const swapped = swappedDate(d.date);
  return (
    sales.find((x) => {
      if (x.id === d.id || x.date === d.date || x.channel !== d.channel || (x.branchId || head) !== b) return false;
      if (norm(d.docFrom) && norm(x.docFrom)) return norm(x.docFrom) === norm(d.docFrom) && norm(x.docTo) === norm(d.docTo);
      return x.date === swapped && sameSlip(x, d);
    }) ?? null
  );
}

/**
 * Lines already in twice on different days (the banner on the sales screen, owner 2026-11-18: "중복 안내"): each pair
 * once, the newer line second (usually the copy). Same rules as slipElsewhere.
 */
export function elsewherePairs(sales: readonly Sale[], head = ""): { first: Sale; second: Sale }[] {
  // Indexed so a few thousand lines stay quick: by receipt numbers, and by day + figures
  const place = (x: Sale) => `${x.branchId || head}|${x.channel}`;
  const byReceipts = new Map<string, Sale[]>();
  const byFigures = new Map<string, Sale[]>();
  const push = (m: Map<string, Sale[]>, k: string, x: Sale) => m.set(k, [...(m.get(k) ?? []), x]);
  const figures = (x: Sale, date: string) => `${place(x)}|${date}|${toSatang(x.gross)}|${toSatang(x.vat)}|${x.bills || 0}`;
  for (const x of sales) {
    if (norm(x.docFrom)) push(byReceipts, `${place(x)}|${norm(x.docFrom)}|${norm(x.docTo)}`, x);
    else if (toSatang(x.gross) > 0) push(byFigures, figures(x, x.date), x);
  }
  const out: { first: Sale; second: Sale }[] = [];
  const seen = new Set<string>();
  const add = (a: Sale, b: Sale) => {
    const key = [a.id, b.id].sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    out.push(a.date <= b.date ? { first: a, second: b } : { first: b, second: a });
  };
  for (const list of byReceipts.values()) for (const a of list) for (const b of list) if (a.id < b.id && a.date !== b.date) add(a, b);
  for (const x of sales) {
    const swapped = norm(x.docFrom) ? null : swappedDate(x.date);
    if (!swapped || !(toSatang(x.gross) > 0)) continue;
    for (const y of byFigures.get(figures(x, swapped)) ?? []) if (y.id !== x.id) add(x, y);
  }
  return out.sort((p, q) => q.second.date.localeCompare(p.second.date));
}

export type SlipPlan =
  /** Nothing that day yet */
  | { mode: "new" }
  /** Another slip of the day (the day becomes their sum) */
  | { mode: "add"; count: number; total: number }
  /** This slip is already in: it replaces that line, not counted twice */
  | { mode: "same"; target: Sale }
  /** The day was typed or imported as one total: this replaces it */
  | { mode: "replace"; target: Sale };

/** What saving `d` does next to the lines already in for its day */
export function slipPlan(day: readonly Sale[], d: Slip & Pick<Sale, "source">): SlipPlan {
  if (!day.length) return { mode: "new" };
  const twin = day.find((x) => sameSlip(x, d));
  if (twin) return { mode: "same", target: twin };
  // A typed or imported day total (not a slip photo) is replaced by what comes next, as before
  if (day.length === 1 && (day[0].source !== "photo" || d.source !== "photo")) return { mode: "replace", target: day[0] };
  return { mode: "add", count: day.length + 1, total: fromSatang(day.reduce((a, x) => a + toSatang(x.gross), 0) + toSatang(d.gross)) };
}

export interface SlipGroup {
  key: string;
  date: string;
  branchId: string;
  channel: Sale["channel"];
  slips: Sale[];
  gross: number;
  vat: number;
  bills: number;
  /** First and last receipt numbers over the slips ("" when none printed) */
  docFrom: string;
  docTo: string;
}

/** Lines → one row per branch, day and channel (the order of their first line kept) */
export function groupSlips(lines: readonly Sale[]): SlipGroup[] {
  const by = new Map<string, SlipGroup>();
  for (const s of lines) {
    const key = `${s.branchId || ""}|${s.date}|${s.channel}`;
    const g = by.get(key) ?? { key, date: s.date, branchId: s.branchId, channel: s.channel, slips: [], gross: 0, vat: 0, bills: 0, docFrom: "", docTo: "" };
    g.slips.push(s);
    by.set(key, g);
  }
  for (const g of by.values()) {
    g.slips.sort((a, b) => ((a as Sale & { part?: number }).part ?? 0) - ((b as Sale & { part?: number }).part ?? 0) || a.docFrom.localeCompare(b.docFrom));
    g.gross = fromSatang(g.slips.reduce((a, x) => a + toSatang(x.gross), 0));
    g.vat = fromSatang(g.slips.reduce((a, x) => a + toSatang(x.vat), 0));
    g.bills = g.slips.reduce((a, x) => a + (x.bills || 0), 0);
    const from = g.slips.map((x) => x.docFrom).filter(Boolean);
    const to = g.slips.map((x) => x.docTo).filter(Boolean);
    g.docFrom = from.length ? from[0] : "";
    g.docTo = to.length ? to[to.length - 1] : "";
  }
  return [...by.values()];
}
