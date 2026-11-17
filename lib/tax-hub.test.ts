import { describe, expect, it } from "vitest";
import { hubMonth, monthDeadlines, payrollTaxes, returnStatus } from "./tax-hub";

describe("tax returns hub", () => {
  it("opens on the filing month unless a good month is given", () => {
    expect(hubMonth("2026-09", "2026-11-18")).toBe("2026-09");
    expect(hubMonth("2026-13", "2026-11-18")).toBe("2026-10");
    expect(hubMonth(undefined, "2026-11-30")).toBe("2026-11");
  });
  it("has each return's deadlines in the next month", () => {
    const d = monthDeadlines("2026-10");
    expect(d.pp30.online >= "2026-11-23").toBe(true);
    expect(d.pnd53.paper >= "2026-11-07").toBe(true);
    expect(d.pnd1.online >= "2026-11-15").toBe(true);
  });
  it("says filed, nothing, late or open", () => {
    const base = { deadline: "2026-11-23", today: "2026-11-18" };
    expect(returnStatus({ ...base, filed: true, nothing: false })).toBe("filed");
    expect(returnStatus({ ...base, filed: false, nothing: true })).toBe("none");
    expect(returnStatus({ ...base, filed: false, nothing: false })).toBe("open");
    expect(returnStatus({ ...base, today: "2026-11-24", filed: false, nothing: false })).toBe("late");
  });
  it("adds up payroll's tax and social security in satang", () => {
    expect(payrollTaxes([{ wht: 100.5, ssEmployee: 750, ssEmployer: 750 }, { wht: 0, ssEmployee: 375.25, ssEmployer: 375.25 }])).toEqual({ pnd1: 10050, sso: 225050, people: 2 });
  });
});
