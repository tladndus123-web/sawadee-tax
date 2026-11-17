import { describe, expect, it } from "vitest";
import { DEFAULT_TARGETS } from "./cost-control";
import { cellLevel, emptyMonths, incompleteMonths, plSheet, shareChanges, targetOf } from "./pl-insight";
import type { PlTable } from "./pl-table";

const row = <K,>(key: K, values: number[]) => ({ key, values, total: values.reduce((a, b) => a + b, 0) });
const table: PlTable = {
  months: ["2026-08", "2026-09", "2026-10", "2026-11"],
  sales: [],
  salesTotal: row("total" as const, [0, 100_000_00, 100_000_00, 50_000_00]),
  costs: [row("food" as never, [0, 30_000_00, 31_000_00, 2_000_00]), row("labor" as never, [0, 20_000_00, 20_000_00, 0]), row("rent" as never, [0, 10_000_00, 10_000_00, 10_000_00])],
  costTotal: row("total" as const, [0, 60_000_00, 61_000_00, 12_000_00]),
  profit: row("total" as const, [0, 40_000_00, 39_000_00, 38_000_00]),
};
const food = new Set(["food"]);

describe("P&L at a glance", () => {
  it("holds rows to their targets", () => {
    expect(targetOf("labor", food, DEFAULT_TARGETS)).toBe(30);
    expect(targetOf("food" as never, food, DEFAULT_TARGETS)).toBe(30);
    expect(targetOf("utilities" as never, food, DEFAULT_TARGETS)).toBeNull();
    expect(cellLevel(31, 30)).toBe("near");
    expect(cellLevel(50, null)).toBe("none");
  });
  it("gives the change against the month before in points", () => {
    expect(shareChanges(table.costs[0], table.salesTotal)).toEqual([null, null, 1, -27]);
  });
  it("finds months whose costs are not all in", () => {
    const m = incompleteMonths(table, "2026-11", food);
    expect(m.get("2026-11")).toEqual(["running", "labor", "purchases"]);
    expect(m.has("2026-10")).toBe(false);
    expect([...emptyMonths(table)]).toEqual(["2026-08"]);
  });
  it("makes the AI's sheet without empty months", () => {
    const s = plSheet(table, (k) => String(k), food, DEFAULT_TARGETS, incompleteMonths(table, "2026-11", food), emptyMonths(table));
    expect(s.months.map((x) => x.month)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(s.months[2]).toMatchObject({ sales: 5_000_000, profitPct: 76, incomplete: ["running", "labor", "purchases"] });
    expect(s.rows[1]).toEqual({ name: "labor", target: 30, shares: [20, 20, 0] });
  });
});
