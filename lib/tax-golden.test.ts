// 세금 정답 예시 (owner 2026-11-18: "세금 정답 예시 너가 한번 해 봐"): every expected number below was worked out by
// hand from the Thai rules, not taken from the code, so a code change that moves a figure fails here. The same cases,
// with the working, are in docs/tax-answer-key.md for the accountant to confirm. Change an answer here only when the
// accountant says the rule is different.
import { describe, expect, it } from "vitest";
import { claimable } from "./checks";
import { buildPp30 } from "./filing";
import { DEFAULT_PAYROLL, incomeTax, monthlyWithholding, socialSecurity, taxableIncome } from "./payroll";
import type { Sale } from "./sales";
import { sampleDoc } from "./sample";
import { monthDeadlines } from "./tax-hub";
import type { LedgerDoc } from "./types";
import { amountToPay, whtAmount } from "./wht";

const CO = "0105557035035";
const sale = (o: Partial<Sale>): Sale => ({ id: Math.random().toString(36).slice(2), branchId: "", date: "2026-10-05", channel: "store", docFrom: "", docTo: "", bills: 0, gross: 0, vat: 0, exempt: 0, note: "", photoPath: null, source: "photo", ...o });
/** A full tax invoice addressed to us, claimed in October 2026 */
const bill = (taxable: number, vat: number, o: Partial<LedgerDoc> = {}): LedgerDoc => {
  const d = sampleDoc();
  return { ...d, date: "2026-10-10", taxMonth: "2026-10", customer: { ...d.customer, taxId: CO }, totals: { ...d.totals, taxable, exempt: 0, vat, net: taxable + vat, wht: 0 }, whtRate: 0, ...o };
};
const wht = (taxable: number, vat: number, rate: number) => ({ taxable, exempt: 0, vat, net: taxable + vat, rate });

describe("부가세 (VAT 7%)", () => {
  it("V1 세금계산서 1,000 + VAT 70: 매입세액 70을 공제", () => {
    const { pp30 } = buildPp30([], [bill(1000, 70)], "2026-10", CO);
    expect(pp30.purchases).toBe(1000);
    expect(pp30.inputVat).toBe(70);
  });
  it("V2 매출 10,700 (VAT 포함): 공급가 10,000 · 매출세액 700", () => {
    const { pp30 } = buildPp30([sale({ gross: 10700, vat: 700 })], [], "2026-10", CO);
    expect(pp30.sales).toBe(10000);
    expect(pp30.outputVat).toBe(700);
    expect(pp30.toPay).toBe(700);
  });
  it("V3 매출세액 7,000 − 매입세액 3,500 = 낼 부가세 3,500", () => {
    const { pp30 } = buildPp30([sale({ gross: 107000, vat: 7000 })], [bill(50000, 3500)], "2026-10", CO);
    expect(pp30.toPay).toBe(3500);
    expect(pp30.overpaid).toBe(0);
  });
  it("V4 매입세액이 더 크면: 낼 것 0, 더 낸 세액 2,800 (환급 또는 다음 달로 이월)", () => {
    const { pp30 } = buildPp30([sale({ gross: 10700, vat: 700 })], [bill(50000, 3500)], "2026-10", CO);
    expect(pp30.toPay).toBe(0);
    expect(pp30.overpaid).toBe(2800);
  });
  it("V5 공제 안 되는 것: 간이 영수증, 우리 회사 앞이 아닌 것, 사본", () => {
    expect(claimable(bill(1000, 70), CO)).toBe(true);
    expect(claimable(bill(1000, 70, { docType: "abbr" }), CO)).toBe(false);
    const other = bill(1000, 70);
    expect(claimable({ ...other, customer: { ...other.customer, taxId: "0994000165510" } }, CO)).toBe(false);
    expect(claimable(bill(1000, 70, { copyKind: "copy" }), CO)).toBe(false);
  });
  it("V6 6개월이 지난 세금계산서는 공제 불가 (2026-03 발행 → 2026-09까지만)", () => {
    expect(claimable(bill(1000, 70, { date: "2026-03-10", taxMonth: "2026-09" }), CO)).toBe(true);
    expect(claimable(bill(1000, 70, { date: "2026-03-10", taxMonth: "2026-10" }), CO)).toBe(false);
  });
});

describe("원천세 (부가세 빼기 전 금액 × 세율)", () => {
  it("W1 용역 10,000 + VAT 700, 3%: 원천세 300 · 지급 10,400", () => {
    const t = wht(10000, 700, 3);
    expect(whtAmount(t, 3)).toBe(300);
    expect(amountToPay({ whtRate: 3, totals: { ...sampleDoc().totals, ...t, wht: 0 } })).toBe(10400);
  });
  it("W2 임대료 20,000 (VAT 없음), 5%: 원천세 1,000 · 지급 19,000", () => {
    const t = wht(20000, 0, 5);
    expect(whtAmount(t, 5)).toBe(1000);
    expect(amountToPay({ whtRate: 5, totals: { ...sampleDoc().totals, ...t, wht: 0 } })).toBe(19000);
  });
  it("W3 광고 5,000 + VAT 350, 2%: 원천세 100 · 지급 5,250", () => {
    expect(whtAmount(wht(5000, 350, 2), 2)).toBe(100);
  });
  it("W4 운송 3,000, 1%: 원천세 30", () => {
    expect(whtAmount(wht(3000, 0, 1), 1)).toBe(30);
  });
  it("W5 서류에 원천세가 찍혀 있으면 그 금액으로 (용역 10,000에 300이 인쇄)", () => {
    expect(amountToPay({ whtRate: 0, totals: { ...sampleDoc().totals, taxable: 10000, exempt: 0, vat: 700, net: 10700, wht: 300 } })).toBe(10400);
  });
});

describe("사회보험 (2026: 임금의 5%, 기준 ฿1,650 ~ ฿17,500, 원 단위 반올림)", () => {
  it("S1 월급 10,000 → 500", () => expect(socialSecurity(10000, DEFAULT_PAYROLL)).toBe(500));
  it("S2 월급 20,000 → 상한 17,500 × 5% = 875", () => expect(socialSecurity(20000, DEFAULT_PAYROLL)).toBe(875));
  it("S3 월급 1,000 → 하한 1,650 × 5% = 82.5 → 83", () => expect(socialSecurity(1000, DEFAULT_PAYROLL)).toBe(83));
  it("S4 월급 17,500 → 875 (상한 그대로)", () => expect(socialSecurity(17500, DEFAULT_PAYROLL)).toBe(875));
});

describe("급여 소득세 원천징수 (ภ.ง.ด.1: 1년치로 계산해 12로 나눔)", () => {
  // 공제: 근로소득공제 50% (최대 100,000) + 본인공제 60,000 + 그해 낸 사회보험
  it("P1 월 20,000 (사회보험 875): 과세표준 69,500 → 세금 0", () => {
    expect(taxableIncome(240000, 10500, 0)).toBe(69500);
    expect(monthlyWithholding(20000, 0, 875, { extraAllowance: 0, whtFixed: null })).toBe(0);
  });
  it("P2 월 30,000: 과세표준 189,500 → 연 1,975 → 월 164.58", () => {
    expect(taxableIncome(360000, 10500, 0)).toBe(189500);
    expect(incomeTax(189500)).toBe(1975);
    expect(monthlyWithholding(30000, 0, 875, { extraAllowance: 0, whtFixed: null })).toBe(164.58);
  });
  it("P3 월 50,000: 과세표준 429,500 → 연 20,450 (7,500 + 12,950) → 월 1,704.17", () => {
    expect(taxableIncome(600000, 10500, 0)).toBe(429500);
    expect(incomeTax(429500)).toBe(20450);
    expect(monthlyWithholding(50000, 0, 875, { extraAllowance: 0, whtFixed: null })).toBe(1704.17);
  });
  it("P4 월 50,000 + 그달 보너스 100,000: 보너스가 늘린 연 세금 11,475를 그달에 → 13,179.17", () => {
    expect(incomeTax(529500)).toBe(31925);
    expect(monthlyWithholding(50000, 100000, 875, { extraAllowance: 0, whtFixed: null })).toBe(13179.17);
  });
  it("P5 소득세 구간: 150,000까지 0%, 300,000까지 5%, 500,000까지 10%, 750,000까지 15%, 1,000,000까지 20%", () => {
    expect(incomeTax(150000)).toBe(0);
    expect(incomeTax(300000)).toBe(7500);
    expect(incomeTax(500000)).toBe(27500);
    expect(incomeTax(750000)).toBe(65000);
    expect(incomeTax(1000000)).toBe(115000);
  });
});

describe("신고 마감 (2026년 11월분; 마감이 휴일이면 다음 평일)", () => {
  it("D1 부가세 ภ.พ.30: 종이 12월 15일 · 인터넷 12월 23일 / 원천세 ภ.ง.ด.3·53·1: 종이 12월 8일 (7일은 12월 5일 토요일의 대체공휴일) · 인터넷 12월 15일", () => {
    const d = monthDeadlines("2026-11");
    expect(d.pp30).toEqual({ paper: "2026-12-15", online: "2026-12-23" });
    expect(d.pnd53).toEqual({ paper: "2026-12-08", online: "2026-12-15" });
    expect(d.pnd3).toEqual({ paper: "2026-12-08", online: "2026-12-15" });
    expect(d.pnd1).toEqual({ paper: "2026-12-08", online: "2026-12-15" });
  });
});
