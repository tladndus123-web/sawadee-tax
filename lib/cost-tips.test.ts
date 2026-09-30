import { describe, expect, it } from "vitest";
import { costControl, DEFAULT_TARGETS } from "./cost-control";
import { costTips } from "./cost-tips";

const FOOD = new Set(["food"]);
// sales ฿100,000 (satang 10,000,000); amounts in satang
const cc = (food: number, rent: number, labor: number, sales = 10000000) => costControl(sales, { byCategory: new Map([["food", food], ["rent", rent]]) }, FOOD, labor, DEFAULT_TARGETS);
const base = { salesValue: 10000000, laborEntered: true, stockCounted: true, monthEnding: false, before: null };

describe("cost check points", () => {
  it("no sales yet: enter sales first (no ratio advice)", () => {
    expect(costTips({ ...base, now: cc(0, 0, 0, 0), salesValue: 0 }).map((t) => t.key)).toEqual(["noSales"]);
  });

  it("all within target", () => {
    expect(costTips({ ...base, now: cc(2000000, 500000, 2000000) })).toEqual([{ key: "allGood", tone: "ok" }]);
  });

  it("lines over the target, worst first; rent says how much more to sell", () => {
    // food 36% (target 30, +6 → over), rent 12% (target 10, +2 → near)
    const tips = costTips({ ...base, now: cc(3600000, 1200000, 2000000) });
    expect(tips[0]).toMatchObject({ key: "over", line: "food", tone: "bad", points: 6 });
    // rent ฿12,000 at 10% needs ฿120,000 of sales: ฿20,000 more
    expect(tips[1]).toMatchObject({ key: "rentSales", line: "rent", tone: "warn", points: 2, amount: 2000000 });
  });

  it("food cost against last month", () => {
    const rise = costTips({ ...base, now: cc(2800000, 0, 2000000), before: cc(2500000, 0, 2000000) });
    expect(rise).toEqual([{ key: "rise", tone: "warn", line: "food", points: 3 }]);
    const fall = costTips({ ...base, now: cc(2200000, 0, 2000000), before: cc(2500000, 0, 2000000) });
    expect(fall[0]).toMatchObject({ key: "fall", tone: "ok", points: 3 });
  });

  it("missing labour, and the month-end stock near the end of the month", () => {
    const tips = costTips({ ...base, now: cc(2000000, 0, 0), laborEntered: false, stockCounted: false, monthEnding: true });
    expect(tips.map((t) => t.key)).toEqual(["noLabor", "stock"]);
    expect(tips.map((t) => t.action)).toEqual(["labor", "stock"]);
  });
});
