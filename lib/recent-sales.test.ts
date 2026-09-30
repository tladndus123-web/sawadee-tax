import { describe, expect, it } from "vitest";
import { recentSales } from "./recent-sales";

const s = (date: string, gross: number, vat = 0) => ({ date, gross, vat });

describe("the last seven days of sales", () => {
  it("ends yesterday, adds the channels of a day, leaves VAT out and shows empty days", () => {
    const r = recentSales([s("2026-09-30", 10700, 700), s("2026-09-30", 3000), s("2026-09-25", 5000), s("2026-10-01", 9999)], "2026-10-01");
    expect(r.days.map((d) => d.date)).toEqual(["2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30"]);
    expect(r.days[6].value).toBe(1300000);
    expect(r.days[1].value).toBe(500000);
    expect(r.days[0].value).toBe(0);
    expect(r.total).toBe(1800000);
  });

  it("yesterday against the same weekday a week before", () => {
    const r = recentSales([s("2026-09-30", 11000), s("2026-09-23", 10000)], "2026-10-01");
    expect(r.yesterday).toBe(1100000);
    expect(r.weekAgo).toBe(1000000);
    expect(r.change).toBeCloseTo(0.1);
    expect(recentSales([s("2026-09-30", 11000)], "2026-10-01").change).toBeNull();
  });
});
