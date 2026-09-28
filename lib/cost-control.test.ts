import { describe, expect, it } from "vitest";
import { costControl, DEFAULT_TARGETS, laborTotal, levelOf, monthLabor, targetsOf } from "./cost-control";

describe("food cost, labour and rent against sales", () => {
  // sales 100,000 without VAT; food 25,000 + supplies 8,000; rent 12,000; office 1,000
  const costs = { byCategory: new Map([["food", 2500000], ["supplies", 800000], ["rent", 1200000], ["office", 100000]]) };
  const foodKeys = new Set(["food", "supplies"]);

  it("each as a share of sales without VAT; FL and FLR with their summed targets", () => {
    const c = costControl(10000000, costs, foodKeys, 2800000, DEFAULT_TARGETS);
    expect(c.food).toMatchObject({ amount: 3300000, pct: 33, target: 30, level: "near" });
    expect(c.labor).toMatchObject({ amount: 2800000, pct: 28, level: "ok" });
    expect(c.rent).toMatchObject({ amount: 1200000, pct: 12, level: "near" });
    expect(c.fl).toMatchObject({ amount: 6100000, pct: 61, target: 60, level: "near" });
    expect(c.flr).toMatchObject({ amount: 7300000, pct: 73, target: 70, level: "near" });
  });

  it("only the categories marked food cost count as food", () => {
    expect(costControl(10000000, costs, new Set(["food"]), 0, DEFAULT_TARGETS).food.amount).toBe(2500000);
  });

  it("no sales: amounts, no shares", () => {
    const c = costControl(0, costs, foodKeys, 0, DEFAULT_TARGETS);
    expect(c.food).toMatchObject({ pct: null, level: "none" });
  });

  it("levels: within the target, up to 5 points over, more", () => {
    expect([levelOf(30, 30), levelOf(35, 30), levelOf(35.1, 30), levelOf(null, 30)]).toEqual(["ok", "near", "over", "none"]);
  });

  it("labour: wages + the employer's social security + other staff costs, per month", () => {
    const lines = [
      { branchId: "h", month: "2026-09", wages: 90000, socialSecurity: 3750, other: 1250.5, note: "" },
      { branchId: "s", month: "2026-09", wages: 40000, socialSecurity: 1750, other: 0, note: "" },
      { branchId: "h", month: "2026-08", wages: 1, socialSecurity: 0, other: 0, note: "" },
    ];
    expect(laborTotal(lines[0])).toBe(9500050);
    expect(monthLabor(lines, "2026-09")).toBe(9500050 + 4175000);
  });

  it("targets: the company's sane ones, else 30 / 30 / 10", () => {
    expect(targetsOf({ food: 28, labor: 0, rent: "x" })).toEqual({ food: 28, labor: 30, rent: 10 });
    expect(targetsOf(null)).toEqual(DEFAULT_TARGETS);
  });
});
