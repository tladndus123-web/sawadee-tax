import { describe, expect, it } from "vitest";
import { monthsEnding, plTable } from "./pl-table";
import { monthResult, type Sale } from "./sales";
import { sampleDoc } from "./sample";

const CO = "0105557035035";
const sale = (date: string, channel: Sale["channel"], gross: number, vat: number): Sale => ({
  id: `${date}-${channel}`, branchId: "", date, channel, docFrom: "", docTo: "", bills: 0, gross, vat, exempt: 0, note: "", photoPath: null, source: "manual",
});
// the sample purchase: 60,000 + VAT 4,200 = 64,200 (claimable when addressed to us), dated in its invoice month
const ours = { ...sampleDoc(), customer: { ...sampleDoc().customer, taxId: CO } };
const month = ours.taxMonth || ours.date.slice(0, 7);

describe("profit and loss by category, months side by side", () => {
  it("lists the months oldest first, across a year end", () => {
    expect(monthsEnding("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("agrees with the month's result for every month", () => {
    const sales = [sale(`${month}-01`, "store", 107000, 7000), sale(`${month}-02`, "grab", 21400, 1400)];
    const t = plTable(sales, [ours], month, 3, CO);
    const r = monthResult(sales, [ours], month, CO);
    expect(t.salesTotal.values.at(-1)).toBe(r.salesValue);
    expect(t.costTotal.values.at(-1)).toBe(r.purchasesCost);
    expect(t.profit.values.at(-1)).toBe(r.profit);
    expect(t.sales.map((s) => s.key)).toEqual(["store", "grab"]);
    expect(t.costs).toEqual([{ key: ours.category, values: [0, 0, 60000], total: 60000 }]);
  });

  it("VAT that cannot be claimed is a cost; months outside the window are left out", () => {
    const notOurs = { ...ours, customer: { ...ours.customer, taxId: "" } };
    const t = plTable([sale("1999-01-01", "store", 100, 0)], [notOurs], month, 2, CO);
    expect(t.costTotal.total).toBe(64200);
    expect(t.salesTotal.total).toBe(0);
    expect(t.profit.values).toEqual([0, -64200]);
  });

  it("biggest cost category first", () => {
    const small = { ...ours, category: "fuel" as const, totals: { ...ours.totals, net: 107, vat: 7 } };
    const t = plTable([], [small, { ...ours, category: "rent" as const }], month, 1, CO);
    expect(t.costs.map((c) => c.key)).toEqual(["rent", "fuel"]);
  });
});

describe("P&L with a mixed receipt and equipment", () => {
  it("lines split into their categories; depreciation is its own row", () => {
    const mixed = { ...ours, items: [{ ...ours.items[0], amount: 45000, category: "" as const }, { ...ours.items[0], amount: 15000, category: "office" as const }] };
    const oven = { ...ours, category: "asset" as const, depYears: 5 };
    const t = plTable([], [mixed, oven], month, 1, CO);
    const by = Object.fromEntries(t.costs.map((c) => [c.key, c.total]));
    expect(by[ours.category]).toBe(45000);
    expect(by.office).toBe(15000);
    expect(by.depreciation).toBe(1000);
    expect(by.asset).toBeUndefined();
    expect(t.costTotal.total).toBe(61000);
  });
});

describe("P&L with labour", () => {
  it("labour typed in is its own cost row and lowers the profit", () => {
    const t = plTable([], [], month, 1, CO, [{ branchId: "", month, wages: 20000, socialSecurity: 750, other: 0, note: "" }]);
    expect(t.costs).toEqual([{ key: "labor", values: [20750], total: 20750 }]);
    expect(t.profit.total).toBe(-20750);
  });
});

describe("shares of sales", async () => {
  const { rowShares, shareOfSales } = await import("./pl-table");
  it("a value against the same column's sales, one decimal; no sales, no share", () => {
    expect(shareOfSales(162530.62, 719889.93)).toBe(22.6);
    expect(shareOfSales(-5000, 100000)).toBe(-5);
    expect(shareOfSales(1000, 0)).toBeNull();
  });
  it("each month and the whole period on its own sales", () => {
    const sales = { key: "total", values: [0, 100000, 200000], total: 300000 };
    const rent = { key: "rent", values: [30000, 30000, 30000], total: 90000 };
    expect(rowShares(rent, sales)).toEqual({ values: [null, 30, 15], total: 30 });
  });
});
