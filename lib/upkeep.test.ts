import { describe, expect, it } from "vitest";
import { DEFAULT_PAYROLL, socialSecurity } from "./payroll";
import { holidaysMissing, legalCeiling, readingTrouble, settingsForMonth } from "./upkeep";

describe("things that go wrong as time passes", () => {
  const list = new Set(["2026-01-01", "2027-01-01"]);
  it("asks for next year's holidays from October, and this year's at once", () => {
    expect(holidaysMissing("2026-11-21", list)).toBeNull();
    expect(holidaysMissing("2027-09-30", list)).toBeNull();
    expect(holidaysMissing("2027-10-01", list)).toBe(2028);
    expect(holidaysMissing("2028-01-05", list)).toBe(2028);
  });
  it("pays social security on the legal ceiling of the month's year, never less", () => {
    expect(legalCeiling("2026-11")).toBe(17500);
    expect(legalCeiling("2029-01")).toBe(20000);
    expect(legalCeiling("2032-06")).toBe(23000);
    // 2026–2028: exactly as before
    expect(settingsForMonth(DEFAULT_PAYROLL, "2028-12")).toBe(DEFAULT_PAYROLL);
    expect(socialSecurity(30000, settingsForMonth(DEFAULT_PAYROLL, "2028-12"))).toBe(875);
    // From 2029: 20,000 × 5% = 1,000; from 2032: 23,000 × 5% = 1,150
    expect(socialSecurity(30000, settingsForMonth(DEFAULT_PAYROLL, "2029-01"))).toBe(1000);
    expect(socialSecurity(30000, settingsForMonth(DEFAULT_PAYROLL, "2032-01"))).toBe(1150);
    // A higher ceiling saved in settings stays
    expect(settingsForMonth({ ...DEFAULT_PAYROLL, ssCeiling: 25000 }, "2029-01").ssCeiling).toBe(25000);
  });
  it("speaks up only when reading mostly fails", () => {
    expect(readingTrouble([{ ok: false, code: "aiFail" }, { ok: false, code: "aiFail" }])).toBeNull();
    expect(readingTrouble([...Array(3)].map(() => ({ ok: false, code: "aiFail" })).concat([...Array(5)].map(() => ({ ok: true, code: "" }))))).toBeNull();
    expect(readingTrouble([{ ok: false, code: "noKey" }, { ok: false, code: "aiFail" }, { ok: false, code: "aiFail" }, { ok: true, code: "" }])).toEqual({ failed: 3, worked: 1, code: "aiFail" });
  });
});
