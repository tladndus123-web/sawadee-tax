import { describe, expect, it } from "vitest";
import { payslipText, thaiMonth } from "./payslip-text";

describe("payslipText", () => {
  it("names the month the Thai way", () => {
    expect(thaiMonth("2026-10")).toBe("ตุลาคม 2569");
  });

  it("lists both halves with deductions and the month's net", () => {
    const t = payslipText({
      company: "YUNA CO., LTD.",
      employee: "Somchai",
      month: "2026-10",
      payType: "monthly",
      rate: 18000,
      first: { gross: 9000, ssEmployee: 0, wht: 0, otherDeduction: 0, net: 9000, paidOn: "2026-10-15" },
      second: { gross: 9000, ssEmployee: 750, wht: 0, otherDeduction: 100, net: 8150, paidOn: "" },
    });
    expect(t).toContain("ใบแจ้งเงินเดือน / Payslip · ตุลาคม 2569");
    expect(t).toContain("ชื่อ / Name: Somchai");
    expect(t).toContain("▪ 1–15\nรวมเงินได้ / Gross: 9,000.00\nเงินได้สุทธิ / Net: 9,000.00\nจ่ายวันที่ / Paid: 15/10/2026");
    expect(t).toContain("▪ 16–31\nรวมเงินได้ / Gross: 9,000.00\nประกันสังคม / Social security: -750.00\nหักอื่น ๆ / Other: -100.00\nเงินได้สุทธิ / Net: 8,150.00");
    expect(t.endsWith("รวมสุทธิทั้งเดือน / Month net: ฿17,150.00")).toBe(true);
  });

  it("leaves out a half with nothing paid", () => {
    const t = payslipText({ company: "", employee: "Malee", month: "2026-02", payType: "daily", rate: 400, first: null, second: { gross: 4000, ssEmployee: 200, wht: 0, otherDeduction: 0, net: 3800, paidOn: "" } });
    expect(t).not.toContain("▪ 1–15");
    expect(t).toContain("▪ 16–28");
    expect(t).toContain("ค่าจ้างรายวัน / Day rate: 400.00");
  });

  it("in one language for the employee's phone", () => {
    const slip = { company: "", employee: "Somchai", month: "2026-10", payType: "monthly" as const, rate: 18000, first: null, second: { gross: 9000, ssEmployee: 750, wht: 0, otherDeduction: 0, net: 8250, paidOn: "" } };
    const th = payslipText(slip, "th");
    expect(th).toContain("ใบแจ้งเงินเดือน · ตุลาคม 2569");
    expect(th).not.toContain("Payslip");
    expect(payslipText(slip, "ja")).toContain("給与明細 · 2026年10月");
    expect(payslipText(slip, "ko")).toContain("실수령액: 8,250.00");
    expect(payslipText(slip, "en")).toContain("Payslip · October 2026");
  });
});
