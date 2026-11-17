import { describe, expect, it } from "vitest";
import { feeLedgerDoc } from "./settlement-doc";
import { channelOf, cleanSettlement, feeDocOf, feesOf, recordedSales, saleOf, settlementCheck } from "./settlement-read";

const raw = { isSettlement: true, platform: "grab", periodFrom: "2569-11-01", periodTo: "2026-11-07", payoutDate: "2026-11-10", orders: 120.4, sales: 30000, commission: 9000, transactionFee: 0, serviceFee: 0, shippingFee: 0, adsFee: 500, otherFees: 0, feeVat: 0, withheld: 0, payout: 20500, platformTaxId: "" };

describe("delivery-app settlements", () => {
  it("cleans the reading: Buddhist years, rounding, unknown apps refused", () => {
    const s = cleanSettlement(raw)!;
    expect(s.periodFrom).toBe("2026-11-01");
    expect(s.orders).toBe(120);
    expect(cleanSettlement({ ...raw, platform: "shopee" })).toBeNull();
    expect(cleanSettlement({ ...raw, isSettlement: false })).toBeNull();
    expect(cleanSettlement({ ...raw, sales: 0, payout: 0 })).toBeNull();
  });
  it("checks the payout against sales less fees", () => {
    const s = cleanSettlement(raw)!;
    expect(feesOf(s)).toBe(9500);
    expect(settlementCheck(s)).toEqual({ expected: 20500, gap: 0, ok: true });
    expect(settlementCheck({ ...s, payout: 20000 }).ok).toBe(false);
  });
  it("makes the sales line and the fee purchase", () => {
    const s = cleanSettlement(raw)!;
    expect(saleOf(s, "b1")).toMatchObject({ branchId: "b1", date: "2026-11-07", channel: "grab", gross: 30000, vat: 1962.62, bills: 120 });
    expect(channelOf("shopeefood")).toBe("shopee");
    const fee = feeDocOf(s);
    expect(fee).toEqual({ date: "2026-11-10", net: 8878.5, vat: 621.5, total: 9500 });
    const doc = feeLedgerDoc(s, "b1");
    expect(doc.items.reduce((a, i) => a + i.amount, 0)).toBeCloseTo(8878.5, 2);
    expect(doc).toMatchObject({ category: "fees", paid: true, docType: "receipt", branchId: "b1" });
  });
  it("finds the app's sales already entered for the period", () => {
    const s = cleanSettlement(raw)!;
    const sales = [
      { branchId: "b1", channel: "grab", date: "2026-11-03", gross: 4000 },
      { branchId: "b1", channel: "store", date: "2026-11-03", gross: 9999 },
      { branchId: "b2", channel: "grab", date: "2026-11-03", gross: 9999 },
      { branchId: "b1", channel: "grab", date: "2026-11-08", gross: 9999 },
    ];
    expect(recordedSales(sales, s, "b1")).toBe(4000);
  });
});
