// The company calendar's items for a stretch of days (owner, 2026-10-28), from what the app already knows:
// - Thai tax deadlines: the VAT return (ภ.พ.30, by the 15th; e-filing ~23rd) for VAT-registered companies; withholding
//   and social security (ภ.ง.ด.1/3/53, สปส.1-10, by the 15th) when the company pays staff or withholds; the yearly
//   staff papers (50 ทวิ, ภ.ง.ด.1ก, February); corporate income tax ภ.ง.ด.51 (31 Aug) and ภ.ง.ด.50 (30 May) for a
//   December year end — all moved to the next working day;
// - staff papers running out (work permit, visa … from the payroll screen);
// - bills to pay by their due date;
// - the company's own dates (public.calendar_events), once, monthly or yearly.
// A VAT return counts as done once its month is closed; anything can be ticked off (public.calendar_done).

import { vatDeadlines } from "./dashboard";
import { annualDeadlines, payrollDeadlines } from "./payroll";
import { nextWorkingDay } from "./thai-holidays";

export type CalKind = "vat" | "monthly" | "cert50" | "pnd1a" | "pnd51" | "pnd50" | "doc" | "bill" | "event";
export const TAX_KINDS: readonly CalKind[] = ["vat", "monthly", "cert50", "pnd1a", "pnd51", "pnd50"];

export interface CalItem {
  /** Stable id, also the "done" key */
  key: string;
  kind: CalKind;
  /** YYYY-MM-DD */
  date: string;
  /** Tax month (YYYY-MM) or year (YYYY) the filing is for */
  period?: string;
  /** The VAT return's e-filing deadline */
  online?: string;
  /** A company date's or a paper's name, a bill's supplier */
  title?: string;
  /** The employee a paper belongs to, a company date's note */
  sub?: string;
  amount?: number;
  /** A company date's id (to change or remove it) */
  eventId?: string;
  /** Days before to remind (company dates) */
  remindDays?: number;
  done: boolean;
}

export interface CalEvent {
  id: string;
  title: string;
  date: string;
  repeat: "none" | "monthly" | "yearly";
  remindDays: number;
  note: string;
  /** Satang (a rent, a licence fee …); null = none */
  amount?: number | null;
  /** Where it came from: typed, read from a document photo, a repeating payment found in the books */
  source?: "typed" | "document" | "recurring";
}

export interface CalInput {
  from: string;
  to: string;
  /** false = not VAT-registered (no ภ.พ.30); null = not known (shown) */
  vatRegistered: boolean | null;
  /** Pays staff or withholds tax (payroll / withholding screens on, or staff on file) */
  payroll: boolean;
  employees?: { id: string; name: string; endDate?: string; documents: { name: string; expires: string }[] }[];
  bills?: { id: string; seller: string; dueDate: string; net: number }[];
  events?: CalEvent[];
  done?: ReadonlySet<string>;
  /** Closed months (YYYY-MM): their VAT return counts as filed */
  locked?: ReadonlySet<string>;
}

const shiftMonth = (m: string, n: number) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7);
};
const lastDay = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
const inside = (d: string, from: string, to: string) => d >= from && d <= to;

export function calendarItems(o: CalInput): CalItem[] {
  const out: CalItem[] = [];
  const done = o.done ?? new Set<string>();
  const add = (i: Omit<CalItem, "done">, isDone = false) => {
    if (inside(i.date, o.from, o.to)) out.push({ ...i, done: isDone || done.has(i.key) });
  };

  // Monthly filings: deadlines fall in the next month, so start two months before the range
  for (let m = shiftMonth(o.from.slice(0, 7), -2); m <= o.to.slice(0, 7); m = shiftMonth(m, 1)) {
    if (o.vatRegistered !== false) {
      const d = vatDeadlines(m);
      add({ key: `vat:${m}`, kind: "vat", date: d.due, period: m, online: d.dueOnline }, o.locked?.has(m));
    }
    if (o.payroll) add({ key: `monthly:${m}`, kind: "monthly", date: payrollDeadlines(m).due, period: m });
  }

  // Yearly filings
  for (let y = Number(o.from.slice(0, 4)) - 1; y <= Number(o.to.slice(0, 4)); y++) {
    if (o.payroll) {
      const a = annualDeadlines(y);
      add({ key: `cert50:${y}`, kind: "cert50", date: a.cert50, period: String(y) });
      add({ key: `pnd1a:${y}`, kind: "pnd1a", date: a.pnd1a, period: String(y) });
    }
    add({ key: `pnd51:${y + 1}`, kind: "pnd51", date: nextWorkingDay(`${y + 1}-08-31`), period: String(y + 1) });
    add({ key: `pnd50:${y}`, kind: "pnd50", date: nextWorkingDay(`${y + 1}-05-30`), period: String(y) });
  }

  // Staff papers (current staff only)
  for (const e of o.employees ?? []) {
    if (e.endDate && e.endDate < o.from) continue;
    for (const p of e.documents) add({ key: `doc:${e.id}:${p.name}:${p.expires}`, kind: "doc", date: p.expires, title: p.name, sub: e.name });
  }

  // Bills by their due date
  for (const b of o.bills ?? []) if (b.dueDate) add({ key: `bill:${b.id}`, kind: "bill", date: b.dueDate, title: b.seller, amount: b.net });

  // The company's own dates
  for (const ev of o.events ?? []) {
    for (const date of occurrences(ev, o.from, o.to)) {
      add({ key: `event:${ev.id}:${date}`, kind: "event", date, title: ev.title, sub: ev.note || undefined, eventId: ev.id, remindDays: ev.remindDays, ...(ev.amount ? { amount: ev.amount / 100 } : {}) });
    }
  }

  const order = (k: CalKind) => ["vat", "monthly", "pnd51", "pnd50", "cert50", "pnd1a", "doc", "event", "bill"].indexOf(k);
  return out.sort((a, b) => a.date.localeCompare(b.date) || order(a.kind) - order(b.kind));
}

/** A company date's days within the range (a monthly 31st falls on the month's last day) */
export function occurrences(ev: Pick<CalEvent, "date" | "repeat">, from: string, to: string): string[] {
  if (ev.repeat === "none") return inside(ev.date, from, to) ? [ev.date] : [];
  const day = Number(ev.date.slice(8, 10));
  const out: string[] = [];
  const step = ev.repeat === "monthly" ? 1 : 12;
  for (let m = ev.date.slice(0, 7); m <= to.slice(0, 7); m = shiftMonth(m, step)) {
    const date = `${m}-${String(Math.min(day, lastDay(m))).padStart(2, "0")}`;
    if (date >= ev.date && inside(date, from, to)) out.push(date);
  }
  return out;
}

/** Whole days from today to a date (negative once past) */
export const daysTo = (today: string, date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
