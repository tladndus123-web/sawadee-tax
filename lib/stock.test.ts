import { describe, expect, it } from "vitest";
import { breakEven, openDaysLeft, progress } from "./break-even";
import { costControl, DEFAULT_TARGETS } from "./cost-control";
import { monthCosts } from "./cost-split";
import { plTable } from "./pl-table";
import { prevMonth, stockChange, type StockCount } from "./stock";

const sc = (branchId: string, month: string, amount: number): StockCount => ({ branchId, month, amount, note: "" });

describe("month-end stock", () => {
  it("previous month, across a year", () => {
    expect(prevMonth("2026-10")).toBe("2026-09");
    expect(prevMonth("2026-01")).toBe("2025-12");
  });

  it("food used = bought + last month's stock − this month's (stock grew: less used)", () => {
    const s = stockChange([sc("a", "2026-08", 20000), sc("a", "2026-09", 23000)], "2026-09");
    expect(s).toEqual({ change: -300000, opening: 2000000, closing: 2300000, applied: 1, partial: 0 });
  });

  it("counts only when both months are in; per branch", () => {
    const s = stockChange([sc("a", "2026-08", 20000), sc("a", "2026-09", 15000), sc("b", "2026-09", 9000)], "2026-09");
    expect(s.change).toBe(500000);
    expect(s.applied).toBe(1);
    expect(s.partial).toBe(1);
    expect(stockChange([sc("a", "2026-09", 5000)], "2026-09").change).toBe(0);
  });

  it("the change is part of the month's cost and of the food line", () => {
    const c = monthCosts([], "2026-09", "", new Map([["food", 10000000]]), -300000);
    expect(c.stock).toBe(-300000);
    expect(c.cost).toBe(9700000);
    const cc = costControl(30000000, c, new Set(["food"]), 0, DEFAULT_TARGETS);
    expect(cc.food.amount).toBe(9700000);
  });

  it("the P&L shows it as its own line", () => {
    const t = plTable([], [], "2026-09", 2, "", [], [], [sc("a", "2026-08", 20000), sc("a", "2026-09", 23000)]);
    const row = t.costs.find((r) => r.key === "stock");
    expect(row?.values).toEqual([0, -3000]);
    expect(t.costTotal.values[1]).toBe(-3000);
  });
});

describe("break-even point", () => {
  it("fixed ÷ (1 − food ratio): food 30% of sales, ฿140,000 of other costs", () => {
    // sales ฿500,000; food ฿150,000; rent (fixed cost) ฿60,000; labour ฿80,000
    const costs = { byCategory: new Map([["food", 15000000], ["rent", 6000000]]), cost: 21000000 };
    const b = breakEven(costs, new Set(["food"]), 8000000, 50000000);
    expect(b.fixed).toBe(14000000);
    expect(b.foodRatio).toBeCloseTo(0.3);
    expect(b.point).toBe(20000000);
  });

  it("nothing to judge by: no sales, or food eats every baht", () => {
    expect(breakEven({ byCategory: new Map(), cost: 100 }, new Set(), 0, 0).point).toBeNull();
    expect(breakEven({ byCategory: new Map([["food", 500]]), cost: 500 }, new Set(["food"]), 0, 400).point).toBeNull();
  });

  it("the stock change counts as food", () => {
    const b = breakEven({ byCategory: new Map([["food", 1000]]), cost: 1500, stock: 500 }, new Set(["food"]), 0, 10000);
    expect(b.foodRatio).toBeCloseTo(0.15);
    expect(b.fixed).toBe(0);
  });

  it("progress and what is still needed per open day", () => {
    expect(progress(300, 1000, 7)).toEqual({ ratio: 0.3, left: 700, perDay: 100 });
    expect(progress(1200, 1000, 3)).toEqual({ ratio: 1.2, left: 0, perDay: 0 });
    expect(progress(100, 1000, 0).perDay).toBeNull();
  });

  it("open days left skip the closing weekday (2026-09-28 is a Monday)", () => {
    expect(openDaysLeft("2026-09", "2026-09-26", [])).toBe(5);
    expect(openDaysLeft("2026-09", "2026-09-26", [1])).toBe(4);
    expect(openDaysLeft("2026-08", "2026-09-26", [])).toBe(0);
    expect(openDaysLeft("2026-10", "2026-09-26", [1])).toBe(27);
  });
});
