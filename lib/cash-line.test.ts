import { describe, expect, it } from "vitest";
import { countOverdue, readCashLine } from "./cash-line";

describe("cash box on LINE", () => {
  it("reads count, in and out in four languages", () => {
    expect(readCashLine("현금 5,200")).toEqual({ kind: "count", amount: 5200, memo: "" });
    expect(readCashLine("현금 넣음 3000")).toEqual({ kind: "in", amount: 3000, memo: "" });
    expect(readCashLine("현금 씀 500 얼음")).toEqual({ kind: "out", amount: 500, memo: "얼음" });
    expect(readCashLine("現金 出 120 氷")).toEqual({ kind: "out", amount: 120, memo: "氷" });
    expect(readCashLine("เงินสด นับ 4800")).toEqual({ kind: "count", amount: 4800, memo: "" });
    expect(readCashLine("cash in ฿1,000.50")).toEqual({ kind: "in", amount: 1000.5, memo: "" });
  });
  it("leaves other lines alone", () => {
    expect(readCashLine("현금")).toBeNull();
    expect(readCashLine("현금 얼마 있어?")).toBeNull();
    expect(readCashLine("오늘 현금 5200")).toBeNull();
    expect(readCashLine("현금 씀 0")).toBeNull();
  });
  it("says when the box has not been counted", () => {
    const moves = [{ day: "2026-11-10", kind: "out" }, { day: "2026-11-12", kind: "count" }];
    expect(countOverdue(moves, "2026-11-13")).toBeNull();
    expect(countOverdue(moves, "2026-11-18")).toBe(6);
    expect(countOverdue([{ day: "2026-09-01", kind: "in" }], "2026-11-18")).toBeNull();
  });
});
