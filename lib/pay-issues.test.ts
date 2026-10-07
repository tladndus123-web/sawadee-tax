import { describe, expect, it } from "vitest";
import { EMPTY_PERIOD, payIssues } from "./payroll";

const monthly = { rate: 18000, payType: "monthly" as const, nationalId: "1101700230705", ssEnrolled: true };
const daily = { rate: 400, payType: "daily" as const, nationalId: "1101700230705", ssEnrolled: true };

describe("pay to look at before saving", () => {
  it("a normal monthly salary: nothing", () => {
    expect(payIssues(monthly, EMPTY_PERIOD, EMPTY_PERIOD, "2026-09")).toEqual([]);
  });
  it("no salary set", () => {
    expect(payIssues({ ...monthly, rate: 0 }, EMPTY_PERIOD, EMPTY_PERIOD, "2026-09")).toEqual(["noRate"]);
  });
  it("day-paid with no days worked; with days it is fine", () => {
    expect(payIssues(daily, EMPTY_PERIOD, EMPTY_PERIOD, "2026-09")).toEqual(["noDays"]);
    expect(payIssues(daily, { ...EMPTY_PERIOD, daysWorked: 12 }, EMPTY_PERIOD, "2026-09")).toEqual([]);
  });
  it("every day of the month off (30 in September)", () => {
    expect(payIssues(monthly, { ...EMPTY_PERIOD, absentDays: 15 }, { ...EMPTY_PERIOD, absentDays: 15 }, "2026-09")).toEqual(["absentAll"]);
  });
  it("ID number missing or not 13 digits", () => {
    expect(payIssues({ ...monthly, nationalId: "" }, EMPTY_PERIOD, EMPTY_PERIOD, "2026-09")).toEqual(["noId"]);
    expect(payIssues({ ...monthly, nationalId: "12345" }, EMPTY_PERIOD, EMPTY_PERIOD, "2026-09")).toEqual(["badId"]);
  });
});
