import { inflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAttendanceSheet, placeSheet, SHEET_PAGE, type AttendanceSheetLabels, type SheetStaff } from "./attendance-sheet";
import { buildAttendancePdf, measureWithSheetFonts, type SheetFontBytes } from "./attendance-sheet-pdf";

const fonts: SheetFontBytes = {
  latin: readFileSync("public/fonts/attendance/NotoSans-Regular.ttf"),
  thai: readFileSync("public/fonts/attendance/NotoSansThai-Regular.ttf"),
  kr: readFileSync("public/fonts/attendance/NotoSansKR-Regular.woff"),
  jp: readFileSync("public/fonts/attendance/NotoSansJP-Regular.woff"),
};

const person = (over: Partial<SheetStaff> & Pick<SheetStaff, "id" | "name">): SheetStaff => ({
  nickname: "",
  branchId: "b1",
  branchName: "Silom",
  startDate: "",
  endDate: "",
  ...over,
});

function labelsFor(title: string, short: AttendanceSheetLabels["short"], subtitle: string, leaveTitle: string): AttendanceSheetLabels {
  return {
    title,
    employee: "Staff",
    subtitle,
    daySpan: (from, to) => `${from}–${to}`,
    short,
    unmarked: "·",
    legend: Object.values(short).map((mark) => mark),
    pageLabel: (n, total) => `${n} / ${total}`,
    leaveTitle,
    leaveLines: [],
  };
}

/** Inflated PDF bytes, and the Unicode destinations of the ToUnicode tables. */
function pdfText(pdf: Uint8Array): { raw: string; chars: Set<number> } {
  const bytes = Buffer.from(pdf);
  const parts: Buffer[] = [bytes];
  let i = 0;
  while (i < bytes.length) {
    const start = bytes.indexOf("stream", i);
    if (start < 0) break;
    let p = start + 6;
    if (bytes[p] === 0x0d) p++;
    if (bytes[p] === 0x0a) p++;
    const end = bytes.indexOf("endstream", p);
    if (end < 0) break;
    let raw = bytes.subarray(p, end);
    if (raw[raw.length - 1] === 0x0a) raw = raw.subarray(0, -1);
    try {
      parts.push(inflateSync(raw));
    } catch {
      /* not a flate stream */
    }
    i = end + 9;
  }
  const raw = Buffer.concat(parts).toString("latin1");
  const chars = new Set<number>();
  for (const match of raw.matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4})>/g)) chars.add(Number.parseInt(match[2], 16));
  return { raw, chars };
}

function hasWord(chars: Set<number>, word: string) {
  return [...word].every((ch) => chars.has(ch.codePointAt(0) ?? 0));
}

function pageCount(pdf: Uint8Array): number {
  return Buffer.from(pdf).toString("latin1").match(/\/Type \/Page(?!s)/g)?.length ?? 0;
}

// Four Noto faces are subset and embedded: 3–4 s on this PC, more under load, so these two get 30 s (the default 5 s
// failed once in a full run, 2026-11-06)
describe("attendance PDF", () => {
  it("embeds Korean, Thai, Japanese and English and leaves secrets out", async () => {
    const staff: SheetStaff[] = [
      person({ id: "ko", name: "김민수예시", nickname: "민수", branchName: "สีลม" }),
      person({ id: "th", name: "สมชาย ใจดี", branchId: "b2", branchName: "อโศก" }),
      person({ id: "ja", name: "山田太郎", branchId: "b2", branchName: "อโศก" }),
      person({ id: "en", name: "Christopher William Alexander-Montgomery", branchName: "Silom" }),
    ];
    const sheet = buildAttendanceSheet({
      month: "2026-01",
      staff: staff.map((item) => ({ ...item, nationalId: "1103700999991", rate: 98765.43, address: "SECRET-ADDRESS" })),
      rows: [
        { employeeId: "ko", day: "2026-01-05", kind: "work", otHours: 2, note: "NOTE-SECRET-99" },
        { employeeId: "th", day: "2026-01-06", kind: "off", otHours: 0, note: "" },
        { employeeId: "ja", day: "2026-01-07", kind: "annual", otHours: 0, note: "" },
        { employeeId: "en", day: "2026-01-08", kind: "sick", otHours: 1.5, note: "" },
      ],
      branch: { id: "all", label: "All branches" },
      locale: "en",
      today: "2026-01-05",
    });
    const labels = labelsFor("출근표", { work: "출", off: "휴", absent: "결", annual: "연", sick: "병" }, "All branches · January 2026 · 4 people", "Leave 2026");
    labels.short = { work: "มา", off: "หยุด", absent: "ขาด", annual: "พัก", sick: "ป่วย" };
    labels.leaveLines = sheet.people.map((item) => item.leaveLabel);
    const measure = await measureWithSheetFonts(fonts);
    const layout = placeSheet(sheet, labels, measure);
    for (const glyph of layout.glyphs) {
      const width = measure(glyph.text, glyph.size);
      expect(glyph.x + width, glyph.text).toBeLessThanOrEqual(SHEET_PAGE.width + 0.8);
      expect(glyph.y + glyph.size, glyph.text).toBeLessThanOrEqual(SHEET_PAGE.height + 0.8);
      expect(width, glyph.text).toBeLessThanOrEqual(glyph.box.w + 0.8);
    }
    expect(layout.pageCount).toBe(1);
    expect(layout.glyphs.some((glyph) => glyph.role === "leave" && glyph.page === 0)).toBe(true);
    expect(layout.pageHeights[0]).toBeLessThan(SHEET_PAGE.height * 0.85);
    expect(new Set(layout.glyphs.filter((glyph) => glyph.role === "col-day").map((glyph) => glyph.text)).size).toBe(31);
    const bytes = await buildAttendancePdf(sheet, labels, fonts);
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    expect(pageCount(bytes)).toBe(layout.pageCount);
    const text = pdfText(bytes);
    for (const word of ["출근표", "민수", "สมชาย", "山田太郎", "Christopher", "All branches", "หยุด", "ป่วย"]) expect(hasWord(text.chars, word), word).toBe(true);
    for (const secret of ["1103700999991", "SECRET-ADDRESS", "NOTE-SECRET-99"]) expect(text.raw).not.toContain(secret);
  }, 30_000);

  it("paginates many people and keeps 29 February", async () => {
    const many = Array.from({ length: 28 }, (_, i) => person({ id: `p${i}`, name: i === 0 ? "첫번째긴이름김철수" : i === 27 ? "สุดท้ายสมหญิง" : `Staff ${i + 1}` }));
    const sheet = buildAttendanceSheet({
      month: "2024-02",
      staff: many,
      rows: [{ employeeId: "p0", day: "2024-02-29", kind: "work", otHours: 0, note: "" }],
      branch: { id: "b1", label: "Silom" },
      locale: "th",
    });
    const labels = labelsFor("ตารางลงเวลา", { work: "มา", off: "หยุด", absent: "ขาด", annual: "พัก", sick: "ป่วย" }, "สาขาสีลม · 2024", "วันลา");
    labels.leaveLines = sheet.people.map((item) => item.leaveLabel);
    const measure = await measureWithSheetFonts(fonts);
    const layout = placeSheet(sheet, labels, measure);
    for (const glyph of layout.glyphs) {
      const width = measure(glyph.text, glyph.size);
      expect(width, glyph.text).toBeLessThanOrEqual(glyph.box.w + 0.8);
    }
    expect(layout.pageCount).toBeGreaterThan(1);
    expect(new Set(layout.glyphs.filter((glyph) => glyph.role === "col-day").map((glyph) => glyph.text)).size).toBe(29);
    expect(layout.glyphs.some((glyph) => glyph.role === "col-day" && glyph.text === "30")).toBe(false);
    const text = pdfText(await buildAttendancePdf(sheet, labels, fonts));
    expect(hasWord(text.chars, "ตารางลงเวลา")).toBe(true);
    expect(hasWord(text.chars, "첫번째긴이름김철수")).toBe(true);
    expect(hasWord(text.chars, "สุดท้ายสมหญิง")).toBe(true);
  }, 30_000);
});
