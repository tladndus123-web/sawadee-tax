import { describe, expect, it } from "vitest";
import { type FixedLine, fixedActive, fixedForMonth, fixedTotal, prevMonth } from "./fixed-costs";

const line = (p: Partial<FixedLine>): FixedLine => ({ id: "x", branchId: "h", category: "rent", name: "Rent", amount: 30000, fromMonth: "2026-01", toMonth: null, note: "", ...p });

describe("fixed costs by month", () => {
  it("count from their first month, until their last (inclusive) or for ever", () => {
    const rent = line({});
    expect(fixedActive(rent, "2025-12")).toBe(false);
    expect(fixedActive(rent, "2026-01")).toBe(true);
    expect(fixedActive(rent, "2030-06")).toBe(true);
    const old = line({ toMonth: "2026-06" });
    expect(fixedActive(old, "2026-06")).toBe(true);
    expect(fixedActive(old, "2026-07")).toBe(false);
  });
  it("add up per category in satang; a new amount is a new line from its month", () => {
    const lines = [line({ toMonth: "2026-06" }), line({ id: "y", amount: 32000.5, fromMonth: "2026-07" }), line({ id: "z", category: "utilities", name: "Internet", amount: 599 })];
    expect([...fixedForMonth(lines, "2026-06")]).toEqual([
      ["rent", 3000000],
      ["utilities", 59900],
    ]);
    expect(fixedForMonth(lines, "2026-07").get("rent")).toBe(3200050);
    expect(fixedTotal(lines, "2026-07")).toBe(3200050 + 59900);
    expect(fixedTotal(lines, "2025-01")).toBe(0);
  });
  it("the month before", () => {
    expect(prevMonth("2026-01")).toBe("2025-12");
    expect(prevMonth("2026-07")).toBe("2026-06");
  });
});
