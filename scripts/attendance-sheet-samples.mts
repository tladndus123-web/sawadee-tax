import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildAttendanceSheet, type AttendanceSheetLabels, type SheetStaff } from "../lib/attendance-sheet";
import { buildAttendancePdf, type SheetFontBytes } from "../lib/attendance-sheet-pdf";

const fonts: SheetFontBytes = {
  latin: readFileSync("public/fonts/attendance/NotoSans-Regular.ttf"),
  thai: readFileSync("public/fonts/attendance/NotoSansThai-Regular.ttf"),
  kr: readFileSync("public/fonts/attendance/NotoSansKR-Regular.woff"),
  jp: readFileSync("public/fonts/attendance/NotoSansJP-Regular.woff"),
};

const out = "/opt/cursor/artifacts";
mkdirSync(out, { recursive: true });

function person(over: Partial<SheetStaff> & Pick<SheetStaff, "id" | "name">): SheetStaff {
  return { nickname: "", branchId: "silom", branchName: "예시 실롬", startDate: "", endDate: "", ...over };
}

function labels(title: string, short: AttendanceSheetLabels["short"], subtitle: string, leaveTitle: string, leaveLines: string[]): AttendanceSheetLabels {
  return {
    title,
    employee: title.startsWith("출") ? "직원" : "Staff",
    subtitle,
    daySpan: (from, to) => `${from}–${to}`,
    short,
    unmarked: "·",
    legend: Object.entries(short).map(([, mark]) => mark),
    pageLabel: (n, total) => `${n} / ${total}`,
    leaveTitle,
    leaveLines,
  };
}

const koShort = { work: "출", off: "휴", absent: "결", annual: "연", sick: "병" } as const;
const thShort = { work: "มา", off: "หยุด", absent: "ขาด", annual: "พัก", sick: "ป่วย" } as const;

const staff: SheetStaff[] = [
  person({ id: "ko", name: "김예시길동이름이어래줄까지길어지는직원", nickname: "예시김" }),
  person({ id: "th", name: "สมชาย ใจดีตัวอย่าง", branchId: "asok", branchName: "예시 아속" }),
  person({ id: "ja", name: "山田太郎サンプル", branchId: "asok", branchName: "예시 아속" }),
  person({ id: "en", name: "Christopher William Alexander-Montgomery", nickname: "Chris" }),
  person({ id: "ko2", name: "박예시" }),
  person({ id: "th2", name: "สมหญิง ตัวอย่างยาวมาก", branchId: "asok", branchName: "예시 아속", startDate: "2026-01-10" }),
];

const sheet = buildAttendanceSheet({
  month: "2026-01",
  staff,
  rows: [
    { employeeId: "ko", day: "2026-01-02", kind: "work", otHours: 2, note: "" },
    { employeeId: "ko", day: "2026-01-03", kind: "off", otHours: 0, note: "" },
    { employeeId: "ko", day: "2026-01-05", kind: "annual", otHours: 0, note: "" },
    { employeeId: "th", day: "2026-01-06", kind: "sick", otHours: 0, note: "" },
    { employeeId: "th", day: "2026-01-07", kind: "absent", otHours: 0, note: "" },
    { employeeId: "ja", day: "2026-01-08", kind: "work", otHours: 1.5, note: "" },
    { employeeId: "en", day: "2026-01-12", kind: "work", otHours: 0, note: "" },
    { employeeId: "th2", day: "2026-01-15", kind: "work", otHours: 3, note: "" },
  ],
  yearRows: [{ employeeId: "ko", day: "2026-03-02", kind: "annual", otHours: 0, note: "" }],
  branch: { id: "all", label: "예시 전체 지점" },
  locale: "ko",
  today: "2026-01-08",
});
const koLabels = labels("출근표", koShort, "예시 전체 지점 · 2026년 1월 · 6명", "2026년 휴가", sheet.people.map((item) => `${item.leaveLabel} 연차 ${item.leave.annualUsed}`));
writeFileSync(`${out}/attendance-example-ko-31.pdf`, await buildAttendancePdf(sheet, koLabels, fonts));

const feb = buildAttendanceSheet({
  month: "2024-02",
  staff: staff.slice(0, 4),
  rows: [{ employeeId: "th", day: "2024-02-29", kind: "off", otHours: 0, note: "" }],
  branch: { id: "silom", label: "สาขาตัวอย่าง" },
  locale: "th",
});
writeFileSync(
  `${out}/attendance-example-th-29.pdf`,
  await buildAttendancePdf(feb, labels("ตารางลงเวลา", thShort, "สาขาตัวอย่าง · กุมภาพันธ์ 2024 · 4 คน", "วันลาปี 2024", feb.people.map((item) => item.leaveLabel)), fonts),
);

const many = Array.from({ length: 24 }, (_, i) => person({ id: `p${i}`, name: i % 4 === 0 ? `직원예시 ${i + 1} 긴이름` : i % 4 === 1 ? `サンプル${i + 1}` : i % 4 === 2 ? `Example ${i + 1}` : `ตัวอย่าง ${i + 1}` }));
const april = buildAttendanceSheet({
  month: "2026-04",
  staff: many,
  rows: many.map((item, i) => ({ employeeId: item.id, day: `2026-04-${String((i % 30) + 1).padStart(2, "0")}`, kind: (["work", "off", "annual", "sick", "absent"] as const)[i % 5], otHours: i % 5 === 0 ? 1.5 : 0, note: "" })),
  branch: { id: "silom", label: "예시 실롬" },
  locale: "ja",
});
const jaShort = { work: "出", off: "休", absent: "欠", annual: "年", sick: "病" } as const;
writeFileSync(`${out}/attendance-example-ja-30-many.pdf`, await buildAttendancePdf(april, labels("出勤表", jaShort, "예시 실롬 · 2026年4月 · 24人", "2026年の休暇", april.people.map((item) => item.leaveLabel)), fonts));

console.log("wrote sample pdfs");
