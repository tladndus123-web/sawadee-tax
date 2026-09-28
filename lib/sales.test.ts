import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import { monthResult, type Sale, saleValue, saleVatOk, salesReportRows, vatInsideSales } from "./sales";
import { sampleDoc } from "./sample";

const CO = "0105557035035";
const sale = (date: string, channel: Sale["channel"], gross: number, vat: number): Sale => ({
  id: `${date}-${channel}`, branchId: "", date, channel, docFrom: "", docTo: "", bills: 0, gross, vat, exempt: 0, note: "", photoPath: null, source: "manual",
});

describe("sales amounts", () => {
  it("VAT inside a total and the value without it", () => {
    expect(vatInsideSales(10700)).toBe(700);
    expect(vatInsideSales(10700, 700)).toBe(654.21);
    expect(saleValue({ gross: 10700, vat: 700 })).toBe(10000);
  });
  it("checks the printed VAT against 7/107 (±1 baht)", () => {
    expect(saleVatOk({ gross: 10700, vat: 700, exempt: 0 })).toBe(true);
    expect(saleVatOk({ gross: 10700, vat: 700.9, exempt: 0 })).toBe(true);
    expect(saleVatOk({ gross: 10700, vat: 650, exempt: 0 })).toBe(false);
  });
});

describe("monthly result", () => {
  // the sample purchase: 60,000 + VAT 4,200 = 64,200, claimable when addressed to us
  const ours = { ...sampleDoc(), customer: { ...sampleDoc().customer, taxId: CO } };

  it("sales minus purchases, both without the VAT that comes back", () => {
    const r = monthResult([sale("2026-09-01", "store", 107000, 7000), sale("2026-09-01", "grab", 21400, 1400), sale("2026-10-01", "store", 999, 0)], [ours], "2026-09", CO);
    expect(r).toMatchObject({ salesGross: 128400, salesVat: 8400, salesValue: 120000, purchasesGross: 64200, claimableVat: 4200, purchasesCost: 60000, profit: 60000, vatPayable: 4200, days: 1 });
    expect(r.margin).toBeCloseTo(0.5);
    expect(r.byChannel).toEqual([
      { channel: "store", gross: 107000, value: 100000 },
      { channel: "grab", gross: 21400, value: 20000 },
    ]);
  });

  it("VAT that cannot be claimed is a cost", () => {
    const notOurs = normalize({ ...sampleDoc(), customer: { taxId: "" } });
    const rent = monthResult([sale("2026-09-02", "store", 107000, 7000)], [], "2026-09", CO, 0, new Map([["rent", 3000000]]));
    expect(rent).toMatchObject({ purchasesCost: 30000, profit: 70000, claimableVat: 0 });
    const r = monthResult([sale("2026-09-02", "store", 107000, 7000)], [notOurs], "2026-09", CO);
    expect(r.purchasesCost).toBe(64200);
    expect(r.profit).toBe(35800);
    expect(r.vatPayable).toBe(7000);
  });

  it("no sales: zero margin, not a division by zero", () => {
    expect(monthResult([], [], "2026-09", CO)).toMatchObject({ profit: 0, margin: 0, days: 0, byChannel: [] });
  });

  it("report lines in date order, store before apps", () => {
    const rows = salesReportRows([sale("2026-09-02", "store", 1, 0), sale("2026-09-01", "grab", 1, 0), sale("2026-09-01", "store", 1, 0), sale("2026-08-31", "store", 1, 0)], "2026-09");
    expect(rows.map((r) => r.id)).toEqual(["2026-09-01-store", "2026-09-01-grab", "2026-09-02-store"]);
  });
});

describe("equipment in the month's result", async () => {
  const { monthResult } = await import("./sales");
  const { sampleDoc } = await import("./sample");
  const base = { ...sampleDoc(), customer: { ...sampleDoc().customer, taxId: CO }, date: "2026-09-10" };
  it("an oven written off over 5 years costs 1,000 a month, not 60,000 at once", () => {
    const oven = { ...base, category: "asset" as const, depYears: 5 };
    const r = monthResult([], [oven], "2026-09", CO);
    expect(r.purchasesGross).toBe(64200);
    expect(r.purchasesCost).toBe(1000);
    expect(r.depreciation).toBe(1000);
    expect(monthResult([], [oven], "2027-03", CO).purchasesCost).toBe(1000);
  });
});

describe("labour in the month's result", async () => {
  const { monthResult } = await import("./sales");
  it("labour typed in lowers the profit but is not a purchase", () => {
    const r = monthResult([sale("2026-09-01", "store", 107000, 7000)], [], "2026-09", CO, 3000000);
    expect(r).toMatchObject({ salesValue: 100000, purchasesCost: 0, labor: 30000, profit: 70000 });
  });
});
