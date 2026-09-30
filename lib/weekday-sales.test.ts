import { describe, expect, it } from "vitest";
import { weekdayAverages } from "./weekday-sales";

const s = (date: string, gross: number, vat = 0) => ({ date, gross, vat });

describe("sales by weekday", () => {
  it("averages the days that had sales, channels of a day added up, VAT left out", () => {
    // 2026-09-21 and 2026-09-28 are Mondays; 2026-09-26 a Saturday
    const out = weekdayAverages([s("2026-09-21", 10700, 700), s("2026-09-21", 2000), s("2026-09-28", 14000), s("2026-09-26", 30000)], "2026-09-30", 4);
    expect(out[1]).toEqual({ weekday: 1, avg: 1300000, days: 2 });
    expect(out[6]).toEqual({ weekday: 6, avg: 3000000, days: 1 });
    expect(out[0]).toEqual({ weekday: 0, avg: 0, days: 0 });
  });

  it("only the chosen weeks, and not today", () => {
    const out = weekdayAverages([s("2026-08-31", 99999), s("2026-09-30", 5000), s("2026-09-29", 4000)], "2026-09-30", 4);
    expect(out[1].days).toBe(0);
    expect(out[3].days).toBe(0);
    expect(out[2]).toEqual({ weekday: 2, avg: 400000, days: 1 });
  });
});
