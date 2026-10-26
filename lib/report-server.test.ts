import { describe, expect, it } from "vitest";
import { anomalyLines, isReportDay, REPORT_DAYS } from "./report-server";

describe("5-day LINE report", () => {
  it("goes out on the 5th, 10th, 15th, 20th and 25th, not before the owner's start day", () => {
    expect(REPORT_DAYS).toEqual([5, 10, 15, 20, 25]);
    expect(isReportDay("2026-11-05")).toBe(true);
    expect(isReportDay("2026-11-25")).toBe(true);
    expect(isReportDay("2026-11-06")).toBe(false);
    expect(isReportDay("2026-11-30")).toBe(false);
    expect(isReportDay("2026-10-25")).toBe(false); // before REPORTS_FROM
  });
  it("tells the unusual things in the reader's words, each linked to its document", () => {
    const vendor = { th: "ร้าน", en: "Shop", ja: "" };
    const lines = anomalyLines(
      [
        { kind: "dup", id: "a", otherId: "b", vendor, docNo: "IV-1", amount: 1000 },
        { kind: "big", id: "c", vendor, category: "repairs", amount: 45000, usual: 14000 },
        { kind: "new", id: "d", vendor, taxId: "1234567890123", taxIdValid: false, amount: 500 },
      ],
      "ko",
      "https://app",
      () => "수리비",
    );
    expect(lines[0]).toMatchObject({ level: "red", title: "같은 영수증이 두 번 올라왔어요", url: "https://app/documents/a" });
    expect(lines[1].title).toBe("평소보다 3.2배 큰 지출 ฿45,000");
    expect(lines[1].detail).toBe("수리비 평균 ฿14,000 · Shop");
    expect(lines[2]).toMatchObject({ level: "orange" });
    expect(lines[2].detail).toContain("세금번호 확인 필요");
  });
});
