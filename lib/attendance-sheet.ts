// The attendance sheet (급여 → 근태) as a file: the same saved marks the grid shows, for the branch and
// month already on screen, and optionally one person from that roster. Nothing here is pay, tax, bank or
// contact data, and nothing is written back. Dates are the Bangkok civil dates stored on the sheet
// (YYYY-MM-DD). The weekday is taken from that date in UTC, the same way the grid does it, so a Sunday
// stays a Sunday wherever the phone's clock is set.

import { ATTENDANCE_KINDS, type AttendanceKind, type AttendanceRow, daysOfMonth, type LeaveBalance, leaveBalance } from "./attendance";
import { THAI_HOLIDAYS } from "./thai-holidays";

export interface SheetStaff {
  id: string;
  name: string;
  nickname: string;
  branchId: string;
  /** Already translated. Shown under the name only when the roster mixes branches. */
  branchName: string;
  startDate: string;
  endDate: string;
}

export interface SheetBranchScope {
  /** "all" or one branch id. People from any other branch are left out. */
  id: string;
  label: string;
}

export interface SheetDay {
  date: string;
  /** 1…31 */
  day: number;
  weekday: string;
  weekend: boolean;
  holiday: boolean;
  today: boolean;
}

export interface SheetCell {
  kind: AttendanceKind | null;
  otHours: number;
  /** Not employed that day, and nothing was saved: the grid leaves it blank. */
  outside: boolean;
}

export interface SheetPerson {
  id: string;
  /** What the grid shows: nickname, or the name when there is no nickname. */
  label: string;
  /** What the leave list shows: the name. */
  leaveLabel: string;
  branchName: string;
  cells: SheetCell[];
  leave: LeaveBalance;
}

export interface AttendanceSheet {
  month: string;
  branchLabel: string;
  allBranches: boolean;
  /** Name rows carry the branch when the visible roster is more than one branch. */
  showBranch: boolean;
  days: SheetDay[];
  people: SheetPerson[];
}

const MONTH = /^\d{4}-\d{2}$/;

/** Narrow weekday of a sheet date. `locale` is the screen language (ja, th, en, ko). */
export function sheetWeekday(day: string, locale: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" }).format(date);
}

const employedOn = (person: Pick<SheetStaff, "startDate" | "endDate">, day: string) =>
  (!person.startDate || day >= person.startDate) && (!person.endDate || day <= person.endDate);

const kindOf = (value: unknown): AttendanceKind | null => (ATTENDANCE_KINDS.includes(value as AttendanceKind) ? (value as AttendanceKind) : null);

const labelOf = (person: Pick<SheetStaff, "name" | "nickname">) => person.nickname.trim() || person.name.trim() || "—";
const leaveLabelOf = (person: Pick<SheetStaff, "name" | "nickname">) => person.name.trim() || person.nickname.trim() || "—";

/**
 * The sheet the screen is showing. `staff` must already be the visible roster (this branch, employed
 * this month). A person id that is not in that roster does not pull anyone else in. Rows for other
 * people, other months, or an unknown mark are ignored. Later rows win when the same day is repeated.
 */
export function buildAttendanceSheet(input: {
  month: string;
  staff: readonly SheetStaff[];
  /** Saved rows. Extra fields (notes, pay) are ignored. */
  rows: readonly (Pick<AttendanceRow, "employeeId" | "day" | "kind"> & Partial<AttendanceRow>)[];
  yearRows?: readonly (Pick<AttendanceRow, "employeeId" | "day" | "kind"> & Partial<AttendanceRow>)[];
  personId?: string | null;
  branch: SheetBranchScope;
  locale: string;
  today?: string;
}): AttendanceSheet {
  const month = MONTH.test(input.month) ? input.month : "";
  const dates = month ? daysOfMonth(month) : [];
  const inBranch = input.staff.filter((person) => input.branch.id === "all" || person.branchId === input.branch.id);
  const picked = input.personId ? inBranch.filter((person) => person.id === input.personId) : inBranch;
  const ids = new Set(picked.map((person) => person.id));
  const cells = new Map<string, { kind: AttendanceKind; otHours: number }>();
  for (const row of input.rows) {
    const kind = kindOf(row.kind);
    if (!month || !kind || !row.day.startsWith(`${month}-`) || !ids.has(row.employeeId)) continue;
    const ot = Number(row.otHours);
    cells.set(`${row.employeeId}|${row.day}`, { kind, otHours: Number.isFinite(ot) && ot > 0 ? ot : 0 });
  }
  const year = month ? Number(month.slice(0, 4)) : 0;
  const yearRows = input.yearRows ?? [];
  const days: SheetDay[] = dates.map((date) => {
    const week = new Date(`${date}T00:00:00Z`).getUTCDay();
    return {
      date,
      day: Number(date.slice(8)),
      weekday: sheetWeekday(date, input.locale),
      weekend: week === 0 || week === 6,
      holiday: THAI_HOLIDAYS.has(date),
      today: input.today === date,
    };
  });
  const people: SheetPerson[] = picked.map((person) => ({
    id: person.id,
    label: labelOf(person),
    leaveLabel: leaveLabelOf(person),
    branchName: person.branchName.trim(),
    cells: dates.map((date) => {
      const saved = cells.get(`${person.id}|${date}`);
      if (saved) return { kind: saved.kind, otHours: saved.otHours, outside: false };
      return { kind: null, otHours: 0, outside: !employedOn(person, date) };
    }),
    leave: leaveBalance(
      { startDate: person.startDate },
      yearRows.filter((row) => row.employeeId === person.id).map((row) => ({ employeeId: person.id, day: row.day, kind: row.kind, otHours: 0, note: "" })),
      year,
    ),
  }));
  const branches = new Set(people.map((person) => person.branchName).filter(Boolean));
  return {
    month,
    branchLabel: input.branch.label,
    allBranches: input.branch.id === "all",
    showBranch: input.branch.id === "all" && branches.size > 1,
    days,
    people,
  };
}

/** Saved overtime the way the grid writes it: +2, +1.5. Empty when there is none. */
export function otMark(hours: number): string {
  if (!(hours > 0) || !Number.isFinite(hours)) return "";
  const rounded = Math.round(hours * 100) / 100;
  return `+${rounded}`;
}

export function attendanceFileName(month: string, kind: "pdf" | "png", page?: number, pages?: number): string {
  const base = MONTH.test(month) ? `attendance-${month}` : "attendance";
  if (kind === "pdf") return `${base}.pdf`;
  if (!pages || pages < 2) return `${base}.png`;
  return `${base}-${page ?? 1}.png`;
}

export type TextMeasure = (text: string, size: number) => number;

/** Width used for tests and for guessing the page count before the fonts are open. CJK is square,
 *  Thai a bit narrower, Latin about half. The PDF measures with the real fonts and lays out again. */
export function approxTextWidth(text: string, size: number): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === " ") width += size * 0.33;
    else if (code >= 0x0e00 && code <= 0x0e7f) width += size * 0.62;
    else if (code > 0x2e80) width += size * 1.02;
    else width += size * 0.56;
  }
  return width;
}

/** Break a line so each piece fits `maxWidth`. Long words and CJK names break by character. */
export function wrapText(text: string, maxWidth: number, size: number, measure: TextMeasure): string[] {
  const src = text.trim();
  if (!src) return [];
  if (measure(src, size) <= maxWidth) return [src];
  const pieces: string[] = [];
  for (const token of src.split(/(\s+)/)) {
    if (!token) continue;
    if (measure(token, size) <= maxWidth) {
      pieces.push(token);
      continue;
    }
    let buf = "";
    for (const ch of token) {
      if (buf && measure(buf + ch, size) > maxWidth) {
        pieces.push(buf);
        buf = ch;
      } else buf += ch;
    }
    if (buf) pieces.push(buf);
  }
  const lines: string[] = [];
  let line = "";
  for (const piece of pieces) {
    const next = line + piece;
    if (line && measure(next, size) > maxWidth) {
      lines.push(line.replace(/\s+$/, ""));
      line = piece.trimStart();
    } else line = next;
  }
  if (line.trim()) lines.push(line.replace(/\s+$/, ""));
  return lines.length ? lines : [src];
}

export const SHEET_PAGE = { width: 841.89, height: 595.28 };

export const SHEET_COLORS = {
  header: "#0071e3",
  headerText: "#ffffff",
  headerSub: "#e7f2fd",
  ink: "#1d1d1f",
  muted: "#6e6e73",
  holiday: "#c4000f",
  paper: "#ffffff",
  nameBg: "#f7f7f9",
  line: "#e4e4e8",
  unmarked: "#b0b0b5",
  outside: "#f3f3f5",
  empty: "#f7f7f9",
  workBg: "#e3f5e8",
  workFg: "#1f7a34",
  offBg: "#efeff3",
  offFg: "#6e6e73",
  absentBg: "#ffe5e7",
  absentFg: "#c4000f",
  annualBg: "#e8f1fd",
  annualFg: "#0071e3",
  sickBg: "#fff1dd",
  sickFg: "#a14a00",
} as const;

const KIND_BG: Record<AttendanceKind, string> = {
  work: SHEET_COLORS.workBg,
  off: SHEET_COLORS.offBg,
  absent: SHEET_COLORS.absentBg,
  annual: SHEET_COLORS.annualBg,
  sick: SHEET_COLORS.sickBg,
};
const KIND_FG: Record<AttendanceKind, string> = {
  work: SHEET_COLORS.workFg,
  off: SHEET_COLORS.offFg,
  absent: SHEET_COLORS.absentFg,
  annual: SHEET_COLORS.annualFg,
  sick: SHEET_COLORS.sickFg,
};

export interface AttendanceSheetLabels {
  title: string;
  employee: string;
  /** Branch, month and how many people, already in the screen language. */
  subtitle: string;
  /** Inclusive calendar days when one page cannot hold the whole month, e.g. "1–16". */
  daySpan: (from: number, to: number) => string;
  short: Record<AttendanceKind, string>;
  unmarked: string;
  /** Footer, already translated, in order. */
  legend: string[];
  pageLabel: (n: number, total: number) => string;
  leaveTitle: string;
  /** One line per person, same order as `sheet.people`. */
  leaveLines: string[];
}

export interface SheetBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SheetGlyph {
  page: number;
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  box: SheetBox;
  role: "title" | "sub" | "page" | "col-name" | "col-day" | "col-wd" | "name" | "branch" | "mark" | "ot" | "legend" | "leave";
}

export interface SheetBlock {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

export interface SheetRule {
  page: number;
  x: number;
  y: number;
  w: number;
  color: string;
}

export interface SheetPlacement {
  pageWidth: number;
  pageHeight: number;
  pageCount: number;
  glyphs: SheetGlyph[];
  blocks: SheetBlock[];
  rules: SheetRule[];
}

const MX = 16;
const MY = 14;
const NAME_W = 126;
const MARK_SIZES = [8, 7.5, 7, 6.5];

interface Chunk {
  start: number;
  end: number;
}

const innerW = SHEET_PAGE.width - MX * 2;

function dayMinWidth(markSize: number, labels: AttendanceSheetLabels, weekdays: string[], measure: TextMeasure): number {
  let width = 0;
  const grow = (text: string, size: number) => {
    width = Math.max(width, measure(text, size));
  };
  grow(labels.unmarked, markSize);
  for (const kind of ATTENDANCE_KINDS) grow(labels.short[kind], markSize);
  grow("+24.5", markSize * 0.72);
  for (const weekday of weekdays) grow(weekday, 6.5);
  for (const day of ["1", "10", "31"]) grow(day, 8);
  return width + 5;
}

function planChunks(dayCount: number, minDay: number): Chunk[] {
  const avail = innerW - NAME_W;
  const per = Math.max(1, Math.floor(avail / Math.max(minDay, 1)));
  if (!dayCount) return [];
  if (dayCount <= per) return [{ start: 0, end: dayCount }];
  const chunks: Chunk[] = [];
  for (let i = 0; i < dayCount; i += per) chunks.push({ start: i, end: Math.min(dayCount, i + per) });
  return chunks;
}

function chooseChunks(labels: AttendanceSheetLabels, weekdays: string[], dayCount: number, measure: TextMeasure): { markSize: number; chunks: Chunk[] } {
  const avail = innerW - NAME_W;
  for (const markSize of MARK_SIZES) {
    const minW = dayMinWidth(markSize, labels, weekdays, measure);
    if (dayCount * minW <= avail + 0.2) return { markSize, chunks: dayCount ? [{ start: 0, end: dayCount }] : [] };
  }
  const minW = dayMinWidth(6.5, labels, weekdays, measure);
  return { markSize: 6.5, chunks: planChunks(dayCount, minW) };
}

function rowHeight(person: SheetPerson, showBranch: boolean, chunk: Chunk, markSize: number, measure: TextMeasure): number {
  const nameLines = wrapText(person.label, NAME_W - 12, 8, measure);
  const branchLines = showBranch && person.branchName ? wrapText(person.branchName, NAME_W - 12, 6.5, measure) : [];
  const height = 8 + Math.max(1, nameLines.length) * 10.5 + branchLines.length * 8.5;
  const ot = person.cells.slice(chunk.start, chunk.end).some((cell) => cell.otHours > 0);
  const cellH = 6 + markSize + (ot ? markSize * 0.72 + 1 : 0);
  return Math.max(22, height, cellH);
}

interface GridPage {
  type: "grid";
  chunk: Chunk;
  rowStart: number;
  rowEnd: number;
  heights: number[];
}
interface LeavePage {
  type: "leave";
  title: boolean;
  lines: { index: number; text: string; h: number }[];
}
type PageDesc = GridPage | LeavePage;

/**
 * Where every label and day sits. A row is never split. When the month is too wide for one page the
 * days continue on the next page with the names and the title again. The leave lines already on the
 * attendance screen follow the grid.
 */
export function placeSheet(sheet: AttendanceSheet, labels: AttendanceSheetLabels, measure: TextMeasure): SheetPlacement {
  const weekdays = sheet.days.map((day) => day.weekday);
  const { markSize, chunks } = chooseChunks(labels, weekdays, sheet.days.length, measure);
  const legendLines = wrapText(labels.legend.join("    "), innerW, 6.5, measure);
  const footerH = Math.max(18, 8 + legendLines.length * 8.5);
  const contentBottom = SHEET_PAGE.height - MY - footerH - 4;

  const subtitleWidth = (pageLabel: string) => innerW - 20 - measure(pageLabel, 8) - 12;
  const headerHFor = (subtitle: string) => {
    const lines = wrapText(subtitle, subtitleWidth(labels.pageLabel(1, Math.max(chunks.length, 1))), 8, measure);
    return 12 + 14 + Math.max(1, lines.length) * 10;
  };

  const pages: PageDesc[] = [];
  const chunkList = chunks.length ? chunks : [{ start: 0, end: 0 }];
  for (const chunk of chunkList) {
    const heights = sheet.people.map((person) => rowHeight(person, sheet.showBranch, chunk, markSize, measure));
    const limitFor = headerHFor(chunkSubtitle(sheet, labels, chunk));
    const limit = contentBottom - (MY + limitFor + 6 + 24);
    if (!heights.length) {
      pages.push({ type: "grid", chunk, rowStart: 0, rowEnd: 0, heights: [] });
      continue;
    }
    let start = 0;
    let used = 0;
    for (let i = 0; i < heights.length; i++) {
      if (used > 0 && used + heights[i] > limit) {
        pages.push({ type: "grid", chunk, rowStart: start, rowEnd: i, heights: heights.slice(start, i) });
        start = i;
        used = 0;
      }
      used += heights[i];
    }
    pages.push({ type: "grid", chunk, rowStart: start, rowEnd: heights.length, heights: heights.slice(start) });
  }

  const leaveItems = sheet.people
    .map((_, index) => {
      const text = labels.leaveLines[index] ?? "";
      const lines = wrapText(text, innerW - 8, 8, measure);
      return { index, text, h: Math.max(13, lines.length * 11 + 2), lines };
    })
    .filter((item) => item.text);
  if (leaveItems.length) {
    const room = contentBottom - (MY + headerHFor(labels.subtitle) + 8);
    const titleH = 18;
    let cursor = 0;
    while (cursor < leaveItems.length) {
      let y = titleH;
      const take: LeavePage["lines"] = [];
      while (cursor < leaveItems.length && y + leaveItems[cursor].h <= room) {
        take.push(leaveItems[cursor]);
        y += leaveItems[cursor].h;
        cursor++;
      }
      if (!take.length) {
        take.push(leaveItems[cursor]);
        cursor++;
      }
      pages.push({ type: "leave", title: true, lines: take });
    }
  }

  const pageCount = Math.max(pages.length, 1);
  const glyphs: SheetGlyph[] = [];
  const blocks: SheetBlock[] = [];
  const rules: SheetRule[] = [];
  const drawPages = pages.length ? pages : [{ type: "grid" as const, chunk: { start: 0, end: 0 }, rowStart: 0, rowEnd: 0, heights: [] }];

  drawPages.forEach((desc, page) => {
    const subtitle = desc.type === "grid" ? chunkSubtitle(sheet, labels, desc.chunk) : labels.subtitle;
    const pageText = labels.pageLabel(page + 1, pageCount);
    const subLines = wrapText(subtitle, subtitleWidth(pageText), 8, measure);
    const headerH = 12 + 14 + Math.max(1, subLines.length) * 10;
    blocks.push({ page, x: MX, y: MY, w: innerW, h: headerH, fill: SHEET_COLORS.header });
    put(glyphs, { page, text: labels.title, x: MX + 10, y: MY + 8, size: 13, color: SHEET_COLORS.headerText, box: { x: MX + 8, y: MY + 6, w: innerW - 16, h: 16 }, role: "title" });
    subLines.forEach((line, i) => {
      put(glyphs, { page, text: line, x: MX + 10, y: MY + 24 + i * 10, size: 8, color: SHEET_COLORS.headerSub, box: { x: MX + 8, y: MY + 22 + i * 10, w: subtitleWidth(pageText), h: 10 }, role: "sub" });
    });
    const pageW = measure(pageText, 8);
    put(glyphs, {
      page,
      text: pageText,
      x: MX + innerW - 10 - pageW,
      y: MY + 10,
      size: 8,
      color: SHEET_COLORS.headerText,
      box: { x: MX + innerW - 12 - pageW, y: MY + 8, w: pageW + 4, h: 12 },
      role: "page",
    });

    if (desc.type === "grid" && sheet.days.length) {
      const colY = MY + headerH + 6;
      const colH = 24;
      const dayW = (innerW - NAME_W) / Math.max(1, desc.chunk.end - desc.chunk.start);
      blocks.push({ page, x: MX, y: colY, w: NAME_W, h: colH, fill: SHEET_COLORS.nameBg });
      put(glyphs, { page, text: labels.employee, x: MX + 6, y: colY + 7, size: 7.5, color: SHEET_COLORS.muted, box: { x: MX + 4, y: colY + 2, w: NAME_W - 8, h: colH - 4 }, role: "col-name" });
      for (let d = desc.chunk.start; d < desc.chunk.end; d++) {
        const day = sheet.days[d];
        const x = MX + NAME_W + (d - desc.chunk.start) * dayW;
        const color = day.holiday ? SHEET_COLORS.holiday : day.today ? SHEET_COLORS.header : day.weekend ? SHEET_COLORS.muted : SHEET_COLORS.ink;
        const num = String(day.day);
        const numW = measure(num, 8);
        put(glyphs, { page, text: num, x: x + (dayW - numW) / 2, y: colY + 3, size: 8, color, box: { x, y: colY, w: dayW, h: 12 }, role: "col-day" });
        if (day.today) rules.push({ page, x: x + (dayW - numW) / 2, y: colY + 13, w: numW, color });
        const wdW = measure(day.weekday, 6.5);
        put(glyphs, { page, text: day.weekday, x: x + (dayW - wdW) / 2, y: colY + 14, size: 6.5, color: SHEET_COLORS.muted, box: { x, y: colY + 12, w: dayW, h: 11 }, role: "col-wd" });
      }
      let y = colY + colH;
      for (let r = desc.rowStart; r < desc.rowEnd; r++) {
        const person = sheet.people[r];
        const h = desc.heights[r - desc.rowStart];
        blocks.push({ page, x: MX, y, w: NAME_W, h, fill: SHEET_COLORS.paper });
        rules.push({ page, x: MX, y: y + h, w: innerW, color: SHEET_COLORS.line });
        const nameLines = wrapText(person.label, NAME_W - 12, 8, measure);
        const branchLines = sheet.showBranch && person.branchName ? wrapText(person.branchName, NAME_W - 12, 6.5, measure) : [];
        const stack = nameLines.length * 10.5 + branchLines.length * 8.5;
        let textY = y + Math.max(4, (h - stack) / 2);
        for (const line of nameLines) {
          put(glyphs, { page, text: line, x: MX + 6, y: textY, size: 8, color: SHEET_COLORS.ink, box: { x: MX + 4, y, w: NAME_W - 8, h }, role: "name" });
          textY += 10.5;
        }
        for (const line of branchLines) {
          put(glyphs, { page, text: line, x: MX + 6, y: textY, size: 6.5, color: SHEET_COLORS.muted, box: { x: MX + 4, y, w: NAME_W - 8, h }, role: "branch" });
          textY += 8.5;
        }
        for (let d = desc.chunk.start; d < desc.chunk.end; d++) {
          const cell = person.cells[d];
          const x = MX + NAME_W + (d - desc.chunk.start) * dayW;
          const fill = cell.kind ? KIND_BG[cell.kind] : cell.outside ? SHEET_COLORS.outside : SHEET_COLORS.empty;
          blocks.push({ page, x: x + 0.6, y: y + 0.8, w: dayW - 1.2, h: h - 1.6, fill });
          const mark = cell.kind ? labels.short[cell.kind] : cell.outside ? "" : labels.unmarked;
          const ot = otMark(cell.otHours);
          const color = cell.kind ? KIND_FG[cell.kind] : SHEET_COLORS.unmarked;
          const stackH = (mark ? markSize : 0) + (ot ? markSize * 0.72 + 1 : 0);
          let markY = y + Math.max(2, (h - stackH) / 2);
          if (mark) {
            const mw = measure(mark, markSize);
            put(glyphs, { page, text: mark, x: x + (dayW - mw) / 2, y: markY, size: markSize, color, box: { x: x + 1, y, w: dayW - 2, h }, role: "mark" });
            markY += markSize + 1;
          }
          if (ot) {
            const ow = measure(ot, markSize * 0.72);
            put(glyphs, { page, text: ot, x: x + (dayW - ow) / 2, y: markY, size: markSize * 0.72, color, box: { x: x + 1, y, w: dayW - 2, h }, role: "ot" });
          }
        }
        y += h;
      }
    }

    if (desc.type === "leave") {
      let y = MY + headerH + 10;
      if (desc.title) {
        put(glyphs, { page, text: labels.leaveTitle, x: MX + 2, y, size: 11, color: SHEET_COLORS.ink, box: { x: MX, y, w: innerW, h: 16 }, role: "leave" });
        y += 18;
      }
      for (const line of desc.lines) {
        const parts = wrapText(line.text, innerW - 8, 8, measure);
        for (const part of parts) {
          put(glyphs, { page, text: part, x: MX + 2, y, size: 8, color: SHEET_COLORS.ink, box: { x: MX, y: y - 1, w: innerW, h: 12 }, role: "leave" });
          y += 11;
        }
        y += 2;
      }
    }

    let legendY = SHEET_PAGE.height - MY - footerH + 4;
    for (const line of legendLines) {
      put(glyphs, { page, text: line, x: MX, y: legendY, size: 6.5, color: SHEET_COLORS.muted, box: { x: MX, y: legendY - 1, w: innerW, h: 9 }, role: "legend" });
      legendY += 8.5;
    }
  });

  return { pageWidth: SHEET_PAGE.width, pageHeight: SHEET_PAGE.height, pageCount, glyphs, blocks, rules };
}

function chunkSubtitle(sheet: AttendanceSheet, labels: AttendanceSheetLabels, chunk: Chunk): string {
  if (!sheet.days.length || chunk.end - chunk.start >= sheet.days.length) return labels.subtitle;
  const from = sheet.days[chunk.start]?.day;
  const to = sheet.days[chunk.end - 1]?.day;
  if (!from || !to) return labels.subtitle;
  return `${labels.subtitle} · ${labels.daySpan(from, to)}`;
}

function put(glyphs: SheetGlyph[], glyph: SheetGlyph) {
  if (glyph.text) glyphs.push(glyph);
}
