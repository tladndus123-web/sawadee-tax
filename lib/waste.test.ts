import { describe, expect, it } from "vitest";
import { rowToWaste, type WasteLog, wasteMonth } from "./waste";

const log = (day: string, item: string, amount: number | null, reason: WasteLog["reason"] = "spoiled", qty = 1, unit = "kg"): WasteLog =>
  rowToWaste({ id: day + item + amount, branch_id: "b", day, item, qty, unit, amount, reason });

describe("waste log", () => {
  it("reads rows safely", () => {
    const w = rowToWaste({ id: 1, day: "2026-11-02", item: "Milk", qty: "2", amount: null, reason: "weird" });
    expect(w).toMatchObject({ id: "1", qty: 2, amount: null, reason: "other", source: "app", photoPath: null });
  });
  it("sums the month, groups items, compares with last month", () => {
    const m = wasteMonth(
      [log("2026-11-01", "Milk", 90, "spoiled", 2, "L"), log("2026-11-05", " milk ", 45, "expired", 1, "L"), log("2026-11-06", "Pork", 300, "mistake"), log("2026-11-07", "Rice", null), log("2026-10-10", "Milk", 200)],
      "2026-11",
    );
    expect(m.total).toBe(43500);
    expect(m.lines).toBe(4);
    expect(m.unpriced).toBe(1);
    expect(m.before).toBe(20000);
    expect(m.change).toBe(118);
    expect(m.items[0]).toEqual({ item: "Pork", amount: 30000, lines: 1, qty: 1, unit: "kg" });
    expect(m.items[1]).toMatchObject({ item: "Milk", amount: 13500, lines: 2, qty: 3 });
    expect(m.reasons.map((r) => r.reason)).toEqual(["mistake", "spoiled", "expired"]);
  });
  it("has no change figure without last month", () => {
    expect(wasteMonth([log("2026-11-01", "Milk", 90)], "2026-11").change).toBeNull();
  });
});
