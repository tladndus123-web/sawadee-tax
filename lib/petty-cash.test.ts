import { describe, expect, it } from "vitest";
import { fixedForMonth } from "./fixed-costs";
import { type CashMove, cashBook, cashCostLines, cashMonth } from "./petty-cash";

let n = 0;
const m = (day: string, kind: CashMove["kind"], amount: number, o: Partial<CashMove> = {}): CashMove => ({
  id: String(++n),
  branchId: "b1",
  day,
  kind,
  amount,
  category: kind === "out" ? "food" : null,
  receipt: false,
  memo: "",
  createdBy: null,
  createdAt: `2026-01-01T00:00:${String(n).padStart(2, "0")}Z`,
  ...o,
});

describe("cash box", () => {
  const moves = [
    m("2026-10-01", "in", 5000),
    m("2026-10-02", "out", 120.5),
    m("2026-10-02", "out", 900, { receipt: true, category: "supplies" }),
    m("2026-10-03", "count", 3970),
    m("2026-10-04", "out", 70),
    m("2026-09-30", "in", 1000),
  ];

  it("runs the balance in date order; a count resets it and shows what was missing", () => {
    const b = cashBook(moves);
    expect(b.rows.map((r) => r.move.day)).toEqual(["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-02", "2026-10-03", "2026-10-04"]);
    // 1,000 + 5,000 − 120.50 − 900 = 4,979.50 expected; 3,970 counted → 1,009.50 short
    expect(b.rows[4].diff).toBe(-100950);
    expect(b.balance).toBe(390000);
  });

  it("sums a month: in, out, spent without a receipt, count differences", () => {
    expect(cashMonth(moves, "2026-10")).toEqual({ in: 500000, out: 109050, noReceipt: 19050, diff: -100950 });
  });

  it("turns spending without a receipt into cost lines of its month and category", () => {
    const lines = cashCostLines(moves);
    expect(lines.map((l) => [l.category, l.amount, l.fromMonth])).toEqual([
      ["food", 120.5, "2026-10"],
      ["food", 70, "2026-10"],
    ]);
    expect(fixedForMonth(lines, "2026-10").get("food")).toBe(19050);
    expect(fixedForMonth(lines, "2026-11").size).toBe(0);
  });
});
