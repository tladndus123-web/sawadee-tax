import { describe, expect, it } from "vitest";
import { addDays, branchLabel, branchNo, dmy, fixDate, taxIdOk, todayBangkok } from "./thai-tax";

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

describe("branch for the purchase tax report", () => {
  const tri = (th: string, en = "", ja = "") => ({ th, en, ja });
  it("reads the head office in any language", () => {
    expect(branchNo(tri("สำนักงานใหญ่", "Head office", "本社"))).toBe("00000");
    expect(branchNo(tri("", "HEAD OFFICE"))).toBe("00000");
    expect(branchNo(tri("", "", "本店"))).toBe("00000");
    expect(branchNo(tri("00000"))).toBe("00000");
  });
  it("reads a branch number as 5 digits", () => {
    expect(branchNo(tri("สาขาที่ 00012", "Branch 00012"))).toBe("00012");
    expect(branchNo(tri("", "Branch 3"))).toBe("00003");
  });
  it("leaves it empty when the document doesn't say", () => {
    expect(branchNo(tri(""))).toBe("");
    expect(branchNo(null)).toBe("");
    expect(branchNo(tri("", "Tel 021234567"))).toBe("");
  });
  it("writes it the way the form does", () => {
    expect(branchLabel("00000", "th")).toBe("สำนักงานใหญ่");
    expect(branchLabel("00012", "th")).toBe("สาขาที่ 00012");
    expect(branchLabel("00012", "en")).toBe("Branch 00012");
    expect(branchLabel("", "th")).toBe("");
  });
});
