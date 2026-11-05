import { describe, expect, it } from "vitest";
import { daysOfMonth } from "./attendance";
import { approxTextWidth, attendanceFileName, buildAttendanceSheet, otMark, placeSheet, SHEET_PAGE, sheetWeekday, wrapText, type AttendanceSheetLabels, type SheetGlyph, type SheetStaff, type TextMeasure } from "./attendance-sheet";

const staff = (over: Partial<SheetStaff> & Pick<SheetStaff, "id" | "name">): SheetStaff => ({
  nickname: "",
  branchId: "b1",
  branchName: "สีลม",
  startDate: "",
  endDate: "",
  ...over,
});

const labels = (people: number): AttendanceSheetLabels => ({
  title: "출근표",
  employee: "직원",
  subtitle: `สีลม · 2026년 1월 · ${people}명`,
  daySpan: (from, to) => `${from}–${to}일`,
  short: { work: "출", off: "휴", absent: "결", annual: "연", sick: "병" },
  unmarked: "·",
  legend: ["출 출근", "휴 휴무", "결 무급 결근", "연 연차", "병 병가", "· 표시 없음", "빨간 날짜는 공휴일"],
  pageLabel: (n, total) => `${n} / ${total}`,
  leaveTitle: "2026년 휴가",
  leaveLines: [],
});

const thaiLabels = (base: AttendanceSheetLabels): AttendanceSheetLabels => ({
  ...base,
  title: "ตารางลงเวลา",
  employee: "พนักงาน",
  short: { work: "มา", off: "หยุด", absent: "ขาด", annual: "พัก", sick: "ป่วย" },
  unmarked: "·",
});

function placed(sheetPeople: SheetStaff[], opts: { month?: string; rows?: { employeeId: string; day: string; kind: "work" | "off" | "absent" | "annual" | "sick"; otHours?: number; note?: string }[]; personId?: string | null; branchId?: string; locale?: string; measure?: TextMeasure; copy?: (n: number) => AttendanceSheetLabels; yearRows?: { employeeId: string; day: string; kind: "annual" | "sick" }[] } = {}) {
  const month = opts.month ?? "2026-01";
  const sheet = buildAttendanceSheet({
    month,
    staff: sheetPeople,
    rows: opts.rows ?? [],
    yearRows: opts.yearRows,
    personId: opts.personId,
    branch: { id: opts.branchId ?? "b1", label: opts.branchId === "all" ? "전체 지점" : "สีลม" },
    locale: opts.locale ?? "ko",
    today: "2026-01-05",
  });
  const copy = (opts.copy ?? labels)(sheet.people.length);
  copy.leaveLines = sheet.people.map((person) => `${person.leaveLabel} — 연차 ${person.leave.annualUsed}`);
  const measure = opts.measure ?? approxTextWidth;
  return { sheet, layout: placeSheet(sheet, copy, measure) };
}

function textOf(glyphs: SheetGlyph[], role: SheetGlyph["role"]) {
  return glyphs.filter((glyph) => glyph.role === role).map((glyph) => glyph.text);
}

function fits(glyphs: SheetGlyph[], measure: TextMeasure) {
  for (const glyph of glyphs) {
    const width = measure(glyph.text, glyph.size);
    expect(glyph.x, glyph.text).toBeGreaterThanOrEqual(-0.2);
    expect(glyph.y, glyph.text).toBeGreaterThanOrEqual(-0.2);
    expect(glyph.x + width, glyph.text).toBeLessThanOrEqual(SHEET_PAGE.width + 0.8);
    expect(glyph.y + glyph.size, glyph.text).toBeLessThanOrEqual(SHEET_PAGE.height + 0.8);
    expect(width, glyph.text).toBeLessThanOrEqual(glyph.box.w + 0.8);
    expect(glyph.x, glyph.text).toBeGreaterThanOrEqual(glyph.box.x - 0.8);
    expect(glyph.x + width, glyph.text).toBeLessThanOrEqual(glyph.box.x + glyph.box.w + 0.8);
  }
}

describe("attendance sheet scope", () => {
  const people = [
    staff({ id: "a", name: "김민수", nickname: "민수", branchId: "b1", branchName: "สีลม" }),
    staff({ id: "b", name: "สมชาย ใจดี", branchId: "b1", branchName: "สีลม" }),
    staff({ id: "c", name: "山田太郎", branchId: "b2", branchName: "อโศก", startDate: "2026-01-10", endDate: "2026-01-20" }),
  ];

  it("keeps the visible branch and drops pay, tax, bank and contact fields", () => {
    const withSecrets = people.map((person) => ({
      ...person,
      nationalId: "1103700999991",
      rate: 98765.43,
      address: "SECRET-ADDRESS",
      lineUserId: "Udeadbeef",
      documents: [{ name: "SECRET-VISA", expires: "2026-12-01" }],
    }));
    const { sheet } = placed(withSecrets, {
      rows: [
        { employeeId: "a", day: "2026-01-02", kind: "work", otHours: 1.5, note: "NOTE-SECRET-99" },
        { employeeId: "c", day: "2026-01-12", kind: "annual", note: "NOTE-SECRET-99" },
        { employeeId: "nope", day: "2026-01-03", kind: "absent" },
        { employeeId: "a", day: "2026-02-01", kind: "sick" },
      ],
    });
    const dumped = JSON.stringify(sheet);
    for (const secret of ["1103700999991", "98765.43", "SECRET-ADDRESS", "Udeadbeef", "SECRET-VISA", "NOTE-SECRET-99"]) {
      expect(dumped).not.toContain(secret);
    }
    expect(sheet.people.map((person) => person.id)).toEqual(["a", "b"]);
    expect(sheet.days).toHaveLength(31);
    expect(sheet.people[0].label).toBe("민수");
    expect(sheet.people[0].leaveLabel).toBe("김민수");
    expect(sheet.people[0].cells[1]).toMatchObject({ kind: "work", otHours: 1.5, outside: false });
    expect(sheet.people[0].cells[0]).toMatchObject({ kind: null, outside: false });
    expect(sheet.showBranch).toBe(false);
  });

  it("a person who is not on this roster is not looked up", () => {
    const { sheet } = placed(people, { personId: "missing", rows: [{ employeeId: "a", day: "2026-01-02", kind: "work" }] });
    expect(sheet.people).toEqual([]);
  });

  it("one person, and all branches only when that is the scope already on screen", () => {
    const one = placed(people, { personId: "b", branchId: "all" }).sheet;
    expect(one.people.map((person) => person.label)).toEqual(["สมชาย ใจดี"]);
    expect(one.allBranches).toBe(true);
    const all = placed(people, { branchId: "all" }).sheet;
    expect(all.people.map((person) => person.id)).toEqual(["a", "b", "c"]);
    expect(all.showBranch).toBe(true);
    expect(all.people[2].cells[0].outside).toBe(true);
    expect(all.people[2].cells[11].outside).toBe(false);
    expect(all.people[2].cells[20].outside).toBe(true);
  });

  it("uses Bangkok calendar dates: weekday, weekend, holiday, and 28 to 31 day months", () => {
    expect(sheetWeekday("2026-01-01", "en")).toBe("T");
    expect(new Date("2026-01-01T00:00:00Z").getUTCDay()).toBe(4);
    const jan = placed(people.slice(0, 1)).sheet;
    expect(jan.days[0]).toMatchObject({ date: "2026-01-01", holiday: true, weekend: false, today: false });
    expect(jan.days[2].weekend).toBe(true);
    expect(jan.days[4].today).toBe(true);
    expect(placed(people.slice(0, 1), { month: "2024-02" }).sheet.days).toHaveLength(29);
    expect(placed(people.slice(0, 1), { month: "2026-02" }).sheet.days).toHaveLength(28);
    expect(placed(people.slice(0, 1), { month: "2026-04" }).sheet.days).toHaveLength(30);
    expect(placed(people.slice(0, 1), { month: "2026-01" }).sheet.days.map((day) => day.date)).toEqual(daysOfMonth("2026-01"));
  });

  it("counts leave already on the screen and ignores a bad mark", () => {
    const { sheet } = placed([staff({ id: "a", name: "김민수", startDate: "2020-01-01" })], {
      rows: [{ employeeId: "a", day: "2026-01-04", kind: "work", otHours: 2 }],
      yearRows: [
        { employeeId: "a", day: "2026-03-01", kind: "annual" },
        { employeeId: "a", day: "2026-05-02", kind: "sick" },
        { employeeId: "other", day: "2026-05-03", kind: "annual" },
      ],
    });
    expect(sheet.people[0].leave).toMatchObject({ annualEntitled: 6, annualUsed: 1, sickUsed: 1 });
    const bad = buildAttendanceSheet({
      month: "2026-01",
      staff: [staff({ id: "a", name: "김민수" })],
      rows: [{ employeeId: "a", day: "2026-01-01", kind: "nope" as "work", otHours: 4 }],
      branch: { id: "b1", label: "สีลม" },
      locale: "ko",
    });
    expect(bad.people[0].cells[0]).toMatchObject({ kind: null, otHours: 0 });
  });
});

describe("attendance sheet pages", () => {
  it("fits every day and a long name without clipping, including Thai marks", () => {
    const long = "김".repeat(40) + " Christopher William Alexander-Montgomery " + "山田".repeat(10);
    const people = [staff({ id: "a", name: long, nickname: "", branchName: "สาขาสีลมที่ชื่อยาวมาก" }), staff({ id: "b", name: "สมชาย ใจดีมากจนชื่อยาว", branchId: "b2", branchName: "อโศก" })];
    const { sheet, layout } = placed(people, { branchId: "all", copy: (n) => thaiLabels(labels(n)), rows: [{ employeeId: "b", day: "2026-01-15", kind: "off", otHours: 1.5 }] });
    fits(layout.glyphs, approxTextWidth);
    const names = textOf(layout.glyphs, "name").join("");
    expect(names).toContain(long.replace(/\s+/g, " ").slice(0, 20));
    expect(names).toContain("สมชาย");
    const days = new Set(textOf(layout.glyphs, "col-day"));
    for (let day = 1; day <= 31; day++) expect(days.has(String(day)), String(day)).toBe(true);
    expect(layout.glyphs.some((glyph) => glyph.role === "mark" && glyph.text === "หยุด")).toBe(true);
    expect(layout.glyphs.some((glyph) => glyph.role === "ot" && glyph.text === "+1.5")).toBe(true);
    expect(layout.glyphs.filter((glyph) => glyph.role === "title").length).toBe(layout.pageCount);
    expect(sheet.showBranch).toBe(true);
    expect(textOf(layout.glyphs, "branch").join("")).toContain("สีลม");
  });

  it("repeats the title and the day headers when many people fill more than one page", () => {
    const people = Array.from({ length: 36 }, (_, i) => staff({ id: `e${i}`, name: `직원 ${String(i + 1).padStart(2, "0")} 아주긴이름` }));
    const { layout } = placed(people, { month: "2026-04" });
    expect(layout.pageCount).toBeGreaterThan(1);
    const titles = layout.glyphs.filter((glyph) => glyph.role === "title");
    expect(new Set(titles.map((glyph) => glyph.page)).size).toBe(layout.pageCount);
    const dayHeaders = layout.glyphs.filter((glyph) => glyph.role === "col-day");
    for (const page of new Set(dayHeaders.map((glyph) => glyph.page))) {
      const nums = dayHeaders.filter((glyph) => glyph.page === page).map((glyph) => glyph.text);
      expect(new Set(nums).size).toBe(nums.length);
      expect(nums.length).toBeGreaterThan(0);
    }
    const joined = textOf(layout.glyphs, "name").join(" ");
    expect(joined).toContain("직원 01");
    expect(joined).toContain("직원 36");
    fits(layout.glyphs, approxTextWidth);
  });

  it("February keeps 28 or 29 columns and nothing past the month", () => {
    for (const month of ["2026-02", "2024-02", "2026-04", "2026-01"] as const) {
      const { sheet, layout } = placed([staff({ id: "a", name: "A" })], { month });
      const expected = daysOfMonth(month).map((date) => String(Number(date.slice(8))));
      expect([...new Set(textOf(layout.glyphs, "col-day"))].sort((a, b) => Number(a) - Number(b))).toEqual(expected);
      expect(sheet.days).toHaveLength(expected.length);
      fits(layout.glyphs, approxTextWidth);
    }
  });
});

describe("sheet file names", () => {
  it("stays a plain attendance file name", () => {
    expect(attendanceFileName("2026-01", "pdf")).toBe("attendance-2026-01.pdf");
    expect(attendanceFileName("2026-01", "png", 1, 1)).toBe("attendance-2026-01.png");
    expect(attendanceFileName("2026-01", "png", 2, 3)).toBe("attendance-2026-01-2.png");
    expect(otMark(2)).toBe("+2");
    expect(otMark(1.5)).toBe("+1.5");
    expect(otMark(0)).toBe("");
    expect(wrapText("abc", 100, 8, approxTextWidth)).toEqual(["abc"]);
  });
});
