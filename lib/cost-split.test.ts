import { describe, expect, it } from "vitest";
import { costByCategory, depreciationFor, isMixed, monthCosts } from "./cost-split";
import { sampleDoc } from "./sample";
import type { Category, LedgerDoc } from "./types";

const CO = "0105557035035";
// The sample: 60,000 + VAT 4,200 = 64,200, one item of 60,000, category "supplies"; claimable when addressed to us
const ours = (): LedgerDoc => ({ ...sampleDoc(), category: "supplies", customer: { ...sampleDoc().customer, taxId: CO } });
const item = (amount: number, category: Category | "" = "") => ({ ...ours().items[0], amount, category });

describe("a mixed receipt: cost shared out by line", () => {
  it("one category when no line says otherwise", () => {
    expect([...costByCategory(ours(), CO)]).toEqual([["supplies", 6000000]]);
  });
  it("lines with their own category take their share; the rest follows the document; parts add up exactly", () => {
    const doc = { ...ours(), items: [item(40000, ""), item(15000, "office"), item(5000, "consumables")] };
    const m = costByCategory(doc, CO);
    expect(m.get("supplies")).toBe(4000000);
    expect(m.get("office")).toBe(1500000);
    expect(m.get("consumables")).toBe(500000);
    expect([...m.values()].reduce((a, b) => a + b, 0)).toBe(6000000);
    expect(isMixed(doc)).toBe(true);
  });
  it("rounding lands on the biggest share", () => {
    const doc = { ...ours(), totals: { ...ours().totals, net: 100, vat: 0 }, items: [item(1, "office"), item(1, "repairs"), item(1, "")] };
    const m = costByCategory(doc, CO);
    expect([...m.values()].reduce((a, b) => a + b, 0)).toBe(10000);
  });
});

describe("equipment written off over years", () => {
  const oven = (): LedgerDoc => ({ ...ours(), category: "asset", depYears: 5, date: "2026-09-10" });
  it("60,000 over 5 years = 1,000 a month from the invoice month; nothing before or after", () => {
    expect(depreciationFor(oven(), "2026-09", CO)).toBe(100000);
    expect(depreciationFor(oven(), "2031-08", CO)).toBe(100000);
    expect(depreciationFor(oven(), "2026-08", CO)).toBe(0);
    expect(depreciationFor(oven(), "2031-09", CO)).toBe(0);
  });
  it("the last month takes the remainder so the years add up to the cost", () => {
    const d = { ...oven(), depYears: 3, totals: { ...oven().totals, net: 107, vat: 7 } }; // cost 100.00 over 36 months
    let sum = 0;
    for (let i = 0; i < 36; i++) {
      const y = 2026 + Math.floor((8 + i) / 12);
      const m = ((8 + i) % 12) + 1;
      sum += depreciationFor(d, `${y}-${String(m).padStart(2, "0")}`, CO);
    }
    expect(sum).toBe(10000);
  });
  it("an asset without a period is an ordinary cost", () => {
    expect(depreciationFor({ ...oven(), depYears: 0 }, "2026-09", CO)).toBe(0);
    expect(monthCosts([{ ...oven(), depYears: 0 }], "2026-09", CO).byCategory.get("asset")).toBe(6000000);
  });
  it("the month's costs: purchases by category plus depreciation, the asset itself left out", () => {
    const r = monthCosts([ours(), oven()], "2026-09", CO);
    expect(r.byCategory.get("supplies")).toBe(6000000);
    expect(r.byCategory.has("asset")).toBe(false);
    expect(r.depreciation).toBe(100000);
    expect(r.cost).toBe(6100000);
  });
});

describe("equipment sold or thrown away", async () => {
  const { assetRegister, disposalFor } = await import("./cost-split");
  const oven = (disposedOn = ""): LedgerDoc => ({ ...ours(), category: "asset", depYears: 5, date: "2026-09-10", disposedOn });
  it("depreciation stops from the disposal month; what is left is that month's cost", () => {
    const d = oven("2027-03-20"); // 6 months written off (Sep to Feb) = 6,000
    expect(depreciationFor(d, "2027-02", CO)).toBe(100000);
    expect(depreciationFor(d, "2027-03", CO)).toBe(0);
    expect(disposalFor(d, "2027-03", CO)).toBe(6000000 - 600000);
    expect(disposalFor(d, "2027-04", CO)).toBe(0);
    expect(monthCosts([d], "2027-03", CO)).toMatchObject({ depreciation: 0, disposal: 5400000, cost: 5400000 });
  });
  it("over the whole life the costs add up to the price, disposed of or not", () => {
    for (const d of [oven(), oven("2028-01-05")]) {
      let sum = 0;
      for (let i = 0; i < 80; i++) {
        const y = 2026 + Math.floor((8 + i) / 12);
        const m = `${y}-${String(((8 + i) % 12) + 1).padStart(2, "0")}`;
        sum += monthCosts([d], m, CO).cost;
      }
      expect(sum).toBe(6000000);
    }
  });
  it("the register: cost, written off so far, what is left, state", () => {
    const [a] = assetRegister([oven()], "2026-11", CO);
    expect(a).toMatchObject({ cost: 6000000, writtenOff: 300000, bookValue: 5700000, monthly: 100000, endsIn: "2031-08", state: "active" });
    expect(assetRegister([oven("2026-12-01")], "2026-12", CO)[0]).toMatchObject({ state: "disposed", bookValue: 0 });
    expect(assetRegister([oven()], "2031-08", CO)[0]).toMatchObject({ state: "done", bookValue: 0 });
    expect(assetRegister([oven()], "2026-08", CO)).toHaveLength(0);
  });
});
