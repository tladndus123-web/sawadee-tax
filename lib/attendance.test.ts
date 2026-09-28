import { describe, expect, it } from "vitest";
import { type AttendanceRow, daysOfMonth, expiringDocuments, leaveBalance, parseDocuments, periodFromAttendance } from "./attendance";

const row = (day: string, kind: AttendanceRow["kind"], otHours = 0): AttendanceRow => ({ employeeId: "e", day, kind, otHours, note: "" });
const monthly = { payType: "monthly" as const, startDate: "", endDate: "" };
const daily = { payType: "daily" as const, startDate: "", endDate: "" };

describe("attendance → pay inputs", () => {
  it("monthly staff: only unpaid absences count; overtime adds up per half", () => {
    const rows = [row("2026-09-03", "absent"), row("2026-09-20", "absent"), row("2026-09-21", "off"), row("2026-09-10", "work", 2), row("2026-09-22", "work", 1.5)];
    const p = periodFromAttendance(monthly, rows, "2026-09");
    expect(p.first).toMatchObject({ absentDays: 1, otHours: 2, daysWorked: 0 });
    expect(p.second).toMatchObject({ absentDays: 1, otHours: 1.5 });
  });
  it("daily staff: marked days are paid, paid leave too; days off are not", () => {
    const rows = [row("2026-09-01", "work"), row("2026-09-02", "work"), row("2026-09-03", "sick"), row("2026-09-04", "off"), row("2026-09-16", "annual"), row("2026-09-17", "absent")];
    const p = periodFromAttendance(daily, rows, "2026-09");
    expect([p.first.daysWorked, p.second.daysWorked]).toEqual([3, 1]);
  });
  it("work on a Thai holiday is holiday work (8 h), its overtime holiday overtime", () => {
    const p = periodFromAttendance(daily, [row("2026-10-13", "work", 2), row("2026-10-14", "work", 2)], "2026-10"); // 13 Oct: holiday
    expect(p.first).toMatchObject({ daysWorked: 2, holidayHours: 8, holidayOtHours: 2, otHours: 2 });
  });
  it("a monthly employee who joins mid-month: the days before count as unpaid, whatever the calendar says", () => {
    const p = periodFromAttendance({ ...monthly, startDate: "2026-09-11" }, [], "2026-09");
    expect([p.first.absentDays, p.second.absentDays]).toEqual([10, 0]);
  });
  it("days of a month", () => {
    expect(daysOfMonth("2026-02").length).toBe(28);
    expect(daysOfMonth("2026-09").at(-1)).toBe("2026-09-30");
  });
});

describe("leave", () => {
  it("6 days annual after a year of service, 30 days sick; counted per calendar year", () => {
    const rows = [row("2026-03-01", "annual"), row("2026-03-02", "annual"), row("2026-05-05", "sick"), row("2025-12-30", "annual")];
    expect(leaveBalance({ startDate: "2025-02-01" }, rows, 2026)).toEqual({ annualEntitled: 6, annualUsed: 2, sickUsed: 1, sickEntitled: 30 });
    expect(leaveBalance({ startDate: "2026-02-01" }, rows, 2026).annualEntitled).toBe(0);
    expect(leaveBalance({ startDate: "" }, [], 2026).annualEntitled).toBe(6);
  });
});

describe("documents that expire", () => {
  it("keeps sane entries only", () => {
    expect(parseDocuments([{ name: " Work permit ", expires: "2027-03-31" }, { name: "", expires: "2027-01-01" }, { name: "Visa", expires: "soon" }, 5])).toEqual([{ name: "Work permit", expires: "2027-03-31" }]);
  });
  it("lists what expires within the window, soonest first, skipping people who left", () => {
    const emp = (id: string, endDate: string, documents: { name: string; expires: string }[]) => ({ id, name: id, nickname: "", endDate, documents });
    const list = expiringDocuments(
      [emp("a", "", [{ name: "Visa", expires: "2026-10-20" }, { name: "Permit", expires: "2027-01-01" }]), emp("b", "", [{ name: "Visa", expires: "2026-09-28" }]), emp("c", "2026-09-01", [{ name: "Visa", expires: "2026-10-01" }])],
      "2026-09-29",
    );
    expect(list.map((x) => [x.employee.id, x.doc.name, x.daysLeft])).toEqual([
      ["b", "Visa", -1],
      ["a", "Visa", 21],
    ]);
  });
});
