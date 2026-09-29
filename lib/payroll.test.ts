import { describe, expect, it } from "vitest";
import { annualDeadlines, DEFAULT_PAYROLL, type Employee, EMPTY_PERIOD, incomeTax, LEGAL_OT, lineRates, otRatesOf, monthlyWithholding, daysNotEmployed, maskId, monthPay, payrollFiling, payrollSettingsOf, periodPay, socialSecurity, taxableIncome } from "./payroll";

const emp = (p: Partial<Employee> = {}): Employee => ({
  id: "e",
  branchId: "",
  name: "Somchai",
  nickname: "",
  position: "",
  payType: "monthly",
  rate: 18000,
  startDate: "",
  endDate: "",
  ssEnrolled: true,
  nationalId: "",
  address: "",
  extraAllowance: 0,
  whtFixed: null,
  note: "",
  documents: [],
  ...p,
});
const period = (p: Partial<typeof EMPTY_PERIOD> = {}) => ({ ...EMPTY_PERIOD, ...p });

describe("pay per period", () => {
  it("monthly staff: half the salary each period, less unpaid days (salary ÷ 30)", () => {
    expect(periodPay(emp(), period()).gross).toBe(9000);
    expect(periodPay(emp(), period({ absentDays: 2 })).gross).toBe(7800);
  });
  it("daily staff: days × day rate", () => {
    expect(periodPay(emp({ payType: "daily", rate: 400 }), period({ daysWorked: 13 })).gross).toBe(5200);
  });
  it("overtime ×1.5; holiday work ×1 (monthly) or ×2 (daily); holiday overtime ×3 — hourly = monthly ÷30 ÷8 or daily ÷8", () => {
    const d = periodPay(emp({ payType: "daily", rate: 400 }), period({ daysWorked: 10, otHours: 4, holidayHours: 8, holidayOtHours: 2 }));
    expect([d.base, d.overtime, d.holiday, d.holidayOvertime]).toEqual([4000, 300, 800, 300]); // 50/h
    const m = periodPay(emp({ rate: 24000 }), period({ otHours: 2, holidayHours: 8 })); // 100/h
    expect([m.overtime, m.holiday]).toEqual([300, 800]);
  });
  it("the company may pay higher multiples, never lower than the law", () => {
    const x = lineRates(otRatesOf({ ot: 2, holidayMonthly: 0.5, holidayDaily: 2.5, holidayOt: "4" }), "daily");
    expect(x).toEqual({ ot: 2, holiday: 2.5, holidayOt: 3 });
    const d = periodPay(emp({ payType: "daily", rate: 400 }), period({ otHours: 4, holidayHours: 8, holidayOtHours: 2 }), x); // 50/h
    expect([d.overtime, d.holiday, d.holidayOvertime]).toEqual([400, 1000, 300]);
    expect(otRatesOf({ ot: 99, holidayOt: 3.333 })).toEqual({ ot: 10, holidayMonthly: 1, holidayDaily: 2, holidayOt: 3.33 });
    expect(payrollSettingsOf({}).ot).toEqual(LEGAL_OT);
    const s = { ...DEFAULT_PAYROLL, ot: { ...LEGAL_OT, ot: 2 } };
    expect(monthPay(emp({ rate: 24000 }), period({ otHours: 2 }), EMPTY_PERIOD, s).first.overtime).toBe(400); // 100/h × 2 × 2
  });
  it("bonus and allowance are pay but not social-security wages", () => {
    const p = periodPay(emp(), period({ bonus: 2000, allowance: 500 }));
    expect([p.wages, p.gross]).toEqual([9000, 11500]);
  });
});

describe("social security (2026: 5 % of 1,650–17,500)", () => {
  it("capped at 875, floored at 83", () => {
    expect(socialSecurity(18000, DEFAULT_PAYROLL)).toBe(875);
    expect(socialSecurity(10400, DEFAULT_PAYROLL)).toBe(520);
    expect(socialSecurity(1000, DEFAULT_PAYROLL)).toBe(83);
    expect(socialSecurity(0, DEFAULT_PAYROLL)).toBe(0);
  });
  it("the company's settings when sane", () => {
    expect(payrollSettingsOf({ ssCeiling: 20000, ssRate: "x", ssAccount: "10-0012345-6" })).toEqual({ ssRate: 5, ssFloor: 1650, ssCeiling: 20000, ssAccount: "1000123456", ot: LEGAL_OT });
  });
});

describe("withholding tax (ภ.ง.ด.1)", () => {
  it("progressive rates", () => {
    expect(incomeTax(150000)).toBe(0);
    expect(incomeTax(429500)).toBe(20450); // 7,500 + 12,950
    expect(incomeTax(1_200_000)).toBe(7500 + 20000 + 37500 + 50000 + 50000);
  });
  it("taxable: minus 50 % expenses (≤100,000), 60,000 personal, social security, other allowances", () => {
    expect(taxableIncome(600000, 10500, 0)).toBe(429500);
    expect(taxableIncome(120000, 6000, 0)).toBe(0);
  });
  it("a usual restaurant salary pays none; 50,000 a month pays 1,704.17", () => {
    expect(monthlyWithholding(18000, 0, 875, emp())).toBe(0);
    expect(monthlyWithholding(50000, 0, 875, emp())).toBe(1704.17);
  });
  it("a bonus adds the tax it causes in its month; a fixed amount replaces the app's", () => {
    const withBonus = monthlyWithholding(50000, 20000, 875, emp());
    expect(withBonus).toBeCloseTo(1704.17 + 2000, 2); // 20,000 more in the 10 % band
    expect(monthlyWithholding(50000, 0, 875, emp({ whtFixed: 1500 }))).toBe(1500);
  });
});

describe("a month, paid twice", () => {
  it("social security and tax come out of the month-end payment", () => {
    const m = monthPay(emp(), period(), period(), DEFAULT_PAYROLL);
    expect(m).toMatchObject({ gross: 18000, ssEmployee: 875, ssEmployer: 875, wht: 0, netFirst: 9000, netSecond: 8125, employerCost: 18875 });
  });
  it("daily staff: 13 + 13 days at 400, social security on 10,400", () => {
    const m = monthPay(emp({ payType: "daily", rate: 400 }), period({ daysWorked: 13 }), period({ daysWorked: 13 }), DEFAULT_PAYROLL);
    expect(m).toMatchObject({ gross: 10400, ssEmployee: 520, netFirst: 5200, netSecond: 4680 });
  });
  it("not enrolled in social security: none taken", () => {
    expect(monthPay(emp({ ssEnrolled: false }), period(), period(), DEFAULT_PAYROLL).ssEmployee).toBe(0);
  });
  it("other deductions (advances, meals) come off their own period", () => {
    const m = monthPay(emp(), period({ otherDeduction: 1000 }), period({ otherDeduction: 200 }), DEFAULT_PAYROLL);
    expect([m.netFirst, m.netSecond]).toEqual([8000, 7925]);
  });
});

describe("filing deadlines (the month after pay)", () => {
  it("ภ.ง.ด.1 on paper by the 7th, online and สปส.1-10 by the 15th — moved past weekends and holidays", () => {
    expect(payrollFiling("2026-10-02")).toEqual({ month: "2026-09", pnd1Paper: "2026-10-07", due: "2026-10-15", daysLeft: 13 });
    expect(payrollFiling("2026-11-10")).toMatchObject({ month: "2026-10", pnd1Paper: "2026-11-09", due: "2026-11-16" }); // 7th Sat, 15th Sun
  });
  it("the year's papers: 50 ทวิ by 15 February, ภ.ง.ด.1ก by the end of February (working days)", () => {
    expect(annualDeadlines(2026)).toEqual({ cert50: "2027-02-15", pnd1a: "2027-03-01" }); // 28 Feb 2027 is a Sunday
  });
  it("after the deadline, the current month", () => {
    expect(payrollFiling("2026-10-16")).toMatchObject({ month: "2026-10", due: "2026-11-16" });
  });
});

describe("joining or leaving during the month (monthly staff)", () => {
  it("days outside employment become unpaid days off in their half", () => {
    expect(daysNotEmployed({ startDate: "2026-09-11", endDate: "" }, "2026-09")).toEqual({ first: 10, second: 0 });
    expect(daysNotEmployed({ startDate: "", endDate: "2026-09-20" }, "2026-09")).toEqual({ first: 0, second: 10 });
    expect(daysNotEmployed({ startDate: "2026-01-01", endDate: "" }, "2026-09")).toEqual({ first: 0, second: 0 });
    expect(daysNotEmployed({ startDate: "", endDate: "2026-10-15" }, "2026-10")).toEqual({ first: 0, second: 15 }); // 16 days left, at most 15
  });
  it("ID numbers show only the last 4 digits", () => {
    expect(maskId("1101700203450")).toBe("•••••••••3450");
    expect(maskId("")).toBe("");
  });
});
