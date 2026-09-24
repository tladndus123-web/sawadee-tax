import { describe, expect, it } from "vitest";
import { addDays, dmy, fixDate, taxIdOk, todayBangkok } from "./thai-tax";

describe("taxIdOk", () => {
  it.each(["0745538001265", "0105557035035"])("%s passes", (id) => {
    expect(taxIdOk(id)).toBe(true);
  });

  it.each(["0745538001265", "0105557035035"])("%s fails when the last digit changes", (id) => {
    for (let d = 0; d <= 9; d++) {
      if (String(d) === id[12]) continue;
      expect(taxIdOk(id.slice(0, 12) + d)).toBe(false);
    }
  });

  it("ignores separators and rejects wrong lengths", () => {
    expect(taxIdOk("0-7455-38001-26-5")).toBe(true);
    expect(taxIdOk("074553800126")).toBe(false);
    expect(taxIdOk("")).toBe(false);
    expect(taxIdOk(undefined)).toBe(false);
  });
});

describe("dates", () => {
  it("adds credit days across a month", () => {
    expect(addDays("2026-09-23", 15)).toBe("2026-10-08");
    expect(addDays("2026-12-25", 10)).toBe("2027-01-04");
  });

  it("converts Buddhist era years over 2400", () => {
    expect(fixDate("2569-09-23")).toEqual(["2026-09-23", true]);
    expect(fixDate("2026-9-3")).toEqual(["2026-09-03", false]);
    expect(fixDate("23/09/2026")).toEqual(["", false]);
  });

  it("formats d/m/y", () => {
    expect(dmy("2026-10-08")).toBe("08/10/2026");
    expect(dmy("")).toBe("—");
  });

  it("uses Bangkok time for today", () => {
    // 2026-09-23 20:00 UTC is already the 24th in Bangkok (UTC+7)
    expect(todayBangkok(new Date("2026-09-23T20:00:00Z"))).toBe("2026-09-24");
  });
});
