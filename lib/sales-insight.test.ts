import { describe, expect, it } from "vitest";
import type { Sale } from "./sales";
import { salesFacts } from "./sales-insight";

const sale = (branchId: string, date: string, gross: number, bills = 10, channel: Sale["channel"] = "store"): Sale => ({
  id: `${branchId}${date}${channel}`,
  branchId,
  date,
  channel,
  docFrom: "",
  docTo: "",
  bills,
  gross,
  vat: Math.round((gross * 7) / 107 * 100) / 100,
  exempt: 0,
  note: "",
  photoPath: null,
  source: "manual",
});

describe("salesFacts", () => {
  const branches = [{ id: "a", name: "YUNA 1" }, { id: "b", name: "TRUFFLE" }];
  it("compares the month so far with the same days of last month and lists days without sales", () => {
    const sales = [sale("a", "2026-11-01", 10700), sale("a", "2026-11-03", 10700), sale("a", "2026-10-01", 5350), sale("a", "2026-10-02", 5350), sale("a", "2026-10-20", 99999)];
    const { lines, elapsed } = salesFacts(sales, branches, "2026-11", "2026-11-04");
    expect(elapsed).toBe(3); // today has nothing entered yet: up to yesterday
    expect(lines[0]).toContain("[YUNA 1] 2026-11 1–3: 20,000 THB, +100% vs same days last month (10,000)");
    expect(lines[0]).toContain("2 days entered, avg 10,000/day");
    expect(lines[0]).toContain("20 bills, avg bill 1,000");
    expect(lines[0]).toContain("NO SALES ENTERED on day 02");
    expect(lines.some((l) => l.includes("TRUFFLE"))).toBe(false);
  });
  it("counts today once it has sales, and says nothing on the 1st before closing", () => {
    expect(salesFacts([sale("a", "2026-11-04", 1070)], branches, "2026-11", "2026-11-04").elapsed).toBe(4);
    expect(salesFacts([sale("a", "2026-10-31", 1070)], branches, "2026-11", "2026-11-01").lines).toEqual([]);
  });
  it("splits channels and shows a past month whole", () => {
    const sales = [sale("b", "2026-10-31", 10700, 5, "store"), sale("b", "2026-10-31", 10700, 5, "grab")];
    const { lines, elapsed } = salesFacts(sales, branches, "2026-10", "2026-11-06");
    expect(elapsed).toBe(31);
    expect(lines.join("\n")).toContain("channels: store 50% · grab 50%");
    expect(lines.join("\n")).toContain("10-31 Sat 20,000");
  });
});

describe("closed weekdays", () => {
  it("are not counted as days without sales", async () => {
    const { salesFacts } = await import("./sales-insight");
    // 2026-11-02 is a Monday; sales every day but Mondays
    const sales = Array.from({ length: 9 }, (_, i) => `2026-11-0${i + 1}`)
      .filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() !== 1)
      .map((date) => ({ id: date, branchId: "b", date, channel: "store", gross: 1070, vat: 70, exempt: 0, bills: 10, part: 1 }));
    const open = salesFacts(sales as never, [{ id: "b", name: "A" }], "2026-11", "2026-11-10").lines[0];
    const shut = salesFacts(sales as never, [{ id: "b", name: "A", closedDays: [1] }], "2026-11", "2026-11-10").lines[0];
    expect(open).toContain("NO SALES ENTERED on day 02");
    expect(shut).not.toContain("NO SALES ENTERED");
    expect(shut).toContain("closed every Mon");
  });
});
