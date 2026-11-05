// A photo of a work schedule (paper, whiteboard, a spreadsheet screenshot) → the attendance sheet (owner, 2026-11-06:
// "근무표 사진으로 만들어 줄 수 있을까"). The model returns one line of day codes per person on the sheet; this file turns
// that into cells, matched to the employees. Pure (tested in schedule-read.test.ts); the reading is in
// lib/schedule-read-server.ts.

import { type AttendanceKind } from "./attendance";

/** Codes the model writes per day: W = work (W+2 = 2 hours overtime), O = day off, A = annual leave, S = sick, X = absent, "" = blank */
const CODE: Record<string, AttendanceKind> = { W: "work", O: "off", A: "annual", S: "sick", X: "absent" };

export interface SheetPerson {
  /** The employee it was matched to, or null (the person picks) */
  employeeId: string | null;
  /** The name as the sheet writes it */
  nameOnSheet: string;
  /** Marked days only (a blank cell is not listed) */
  cells: { day: string; kind: AttendanceKind; otHours: number }[];
}

export interface SheetReading {
  month: string;
  people: SheetPerson[];
  /** The sheet marks only days off / leave: its blank days are work days */
  blankIsWork: boolean;
}

const lastDay = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const norm = (s: string) => s.toLowerCase().replace(/[\s._\-()]/g, "");

/** The model's answer → cells for `fallbackMonth` (or the month the sheet shows), people matched by number or name */
export function cleanSheet(raw: unknown, fallbackMonth: string, staff: { id: string; name: string; nickname: string }[]): SheetReading {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const month = typeof o.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(o.month) ? o.month : fallbackMonth;
  const days = lastDay(month);
  const taken = new Set<string>();
  const people: SheetPerson[] = [];
  for (const p of Array.isArray(o.people) ? (o.people as Record<string, unknown>[]) : []) {
    const nameOnSheet = String(p.name ?? "").trim().slice(0, 60);
    const n = Number(p.n);
    // The model's pick from the list first, else the same name / nickname written another way
    let match = Number.isInteger(n) && n >= 1 && n <= staff.length ? staff[n - 1] : undefined;
    if (!match && nameOnSheet) {
      const k = norm(nameOnSheet);
      match = staff.find((e) => [e.nickname, e.name, e.name.split(/\s+/)[0]].some((x) => x && norm(x) === k));
    }
    const employeeId = match && !taken.has(match.id) ? match.id : null;
    if (employeeId) taken.add(employeeId);
    const codes = Array.isArray(p.days) ? (p.days as unknown[]) : [];
    const cells: SheetPerson["cells"] = [];
    codes.slice(0, days).forEach((c, i) => {
      const m = /^([WOASX])(?:\+(\d{1,2}(?:\.\d)?))?$/.exec(String(c ?? "").trim().toUpperCase());
      if (!m) return;
      const kind = CODE[m[1]];
      const ot = kind === "work" && m[2] ? Math.min(24, Number(m[2])) : 0;
      cells.push({ day: `${month}-${String(i + 1).padStart(2, "0")}`, kind, otHours: ot });
    });
    if (nameOnSheet || cells.length) people.push({ employeeId, nameOnSheet: nameOnSheet || "?", cells });
  }
  return { month, people: people.slice(0, 40), blankIsWork: o.blankIsWork === true };
}

/** Several photos of the same month (e.g. two halves): one line per person, later photos adding their days */
export function mergeSheets(sheets: SheetReading[]): SheetReading | null {
  if (!sheets.length) return null;
  const month = sheets[0].month;
  const out = new Map<string, SheetPerson>();
  for (const s of sheets.filter((x) => x.month === month)) {
    for (const p of s.people) {
      const key = p.employeeId ?? `?${norm(p.nameOnSheet)}`;
      const had = out.get(key);
      if (!had) out.set(key, { ...p, cells: [...p.cells] });
      else {
        const days = new Map(had.cells.map((c) => [c.day, c]));
        for (const c of p.cells) days.set(c.day, c);
        had.cells = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
      }
    }
  }
  return { month, people: [...out.values()], blankIsWork: sheets.some((s) => s.blankIsWork) };
}

/**
 * What to save for one person: the sheet's cells, plus (with `blankIsWork`) every other day of the month as worked;
 * days outside the employment (start / end date) are left out.
 */
export function cellsToSave(p: SheetPerson, month: string, blankIsWork: boolean, employment: { startDate?: string; endDate?: string }): SheetPerson["cells"] {
  const marked = new Map(p.cells.map((c) => [c.day, c]));
  const all: SheetPerson["cells"] = [];
  for (let i = 1; i <= lastDay(month); i++) {
    const day = `${month}-${String(i).padStart(2, "0")}`;
    if ((employment.startDate && day < employment.startDate) || (employment.endDate && day > employment.endDate)) continue;
    const c = marked.get(day) ?? (blankIsWork ? { day, kind: "work" as const, otHours: 0 } : null);
    if (c) all.push(c);
  }
  return all;
}
