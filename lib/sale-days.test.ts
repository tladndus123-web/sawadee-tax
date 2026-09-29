import { describe, expect, it } from "vitest";
import { missingDays, saleDays } from "./sale-days";
import type { Sale } from "./sales";

const B = "branch-a";
const sale = (date: string, channel: Sale["channel"] = "store", branchId = B): Sale =>
  ({ id: `${branchId}-${date}-${channel}`, branchId, date, channel, docFrom: "", docTo: "", bills: 0, gross: 1000, vat: 0, exempt: 0, note: "", photoPath: "", source: "manual" }) as Sale;

describe("days of shop sales in a month", () => {
  it("marks days with a store sale, the gaps, and nothing from today on", () => {
    const days = saleDays([sale("2026-09-01"), sale("2026-09-03")], B, "2026-09", "2026-09-05");
    expect(days).toHaveLength(30);
    expect(days.slice(0, 6).map((d) => d.state)).toEqual(["sold", "missing", "sold", "missing", "later", "later"]);
    expect(missingDays(days).map((d) => d.date)).toEqual(["2026-09-02", "2026-09-04"]);
    expect(days[0].sale?.gross).toBe(1000);
  });

  it("only the store counts, and only this branch", () => {
    const days = saleDays([sale("2026-09-01"), sale("2026-09-02", "grab"), sale("2026-09-03", "store", "other")], B, "2026-09", "2026-09-04");
    expect(days.slice(0, 3).map((d) => d.state)).toEqual(["sold", "missing", "missing"]);
  });

  it("regular closing weekdays are not missing (2026-09-07 is a Monday)", () => {
    const days = saleDays([sale("2026-09-01")], B, "2026-09", "2026-09-09", [1]);
    expect(days[6]).toMatchObject({ date: "2026-09-07", weekday: 1, state: "closed" });
    expect(missingDays(days).map((d) => d.date)).toEqual(["2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-08"]);
  });

  it("a sale on a closing day still shows as sold", () => {
    expect(saleDays([sale("2026-09-07")], B, "2026-09", "2026-09-30", [1])[6].state).toBe("sold");
  });

  it("nothing is missing before the first store sale, or with no store sales at all", () => {
    const days = saleDays([sale("2026-09-10")], B, "2026-09", "2026-09-12");
    expect(days.slice(0, 9).every((d) => d.state === "before")).toBe(true);
    expect(missingDays(days).map((d) => d.date)).toEqual(["2026-09-11"]);
    expect(missingDays(saleDays([], B, "2026-09", "2026-09-30"))).toEqual([]);
  });

  it("a past month is checked to its last day; February has 28 days", () => {
    const feb = saleDays([sale("2026-02-01")], B, "2026-02", "2026-09-30");
    expect(feb).toHaveLength(28);
    expect(missingDays(feb)).toHaveLength(27);
  });
});
