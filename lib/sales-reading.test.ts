import { describe, expect, it } from "vitest";
import { parseSalesReply } from "./sales-reading";

const readings = (json: Record<string, unknown>) => {
  const r = parseSalesReply(json);
  if (r.notReport) throw new Error("notReport");
  return r.readings;
};

describe("parseSalesReply", () => {
  it("reads several channels of one closing report", () => {
    const r = readings({
      entries: [
        { date: "2026-10-08", channel: "store", gross: 21400, vat: 1400, bills: 52 },
        { date: "2026-10-08", channel: "grab", gross: 3210, vat: 210 },
        { date: "2026-10-08", channel: "lineman", gross: 1070, vat: null },
      ],
    });
    expect(r.map((x) => [x.channel, x.gross, x.vat])).toEqual([
      ["store", 21400, 1400],
      ["grab", 3210, 210],
      ["lineman", 1070, 70],
    ]);
    // VAT worked out, not printed: marked to check
    expect(r[2].unclear).toContain("vat");
  });

  it("adds up lines of the same day and channel", () => {
    const r = readings({ entries: [{ date: "2026-10-08", channel: "grab", gross: 1000.1, vat: 65.43 }, { date: "2026-10-08", channel: "grab", gross: 500.2, vat: 32.72, bills: 3 }] });
    expect(r).toHaveLength(1);
    expect([r[0].gross, r[0].vat, r[0].bills]).toEqual([1500.3, 98.15, 3]);
  });

  it("keeps the days of a multi-day summary apart and drops empty lines", () => {
    const r = readings({ entries: [{ date: "2026-10-01", channel: "grab", gross: 800, vat: 52.34 }, { date: "2026-10-02", channel: "grab", gross: 0 }, { date: "2026-10-03", channel: "grab", gross: "1,200", vat: 78.5 }] });
    expect(r.map((x) => `${x.date} ${x.gross}`)).toEqual(["2026-10-01 800", "2026-10-03 1200"]);
  });

  it("still reads the older single-entry reply, and flags a missing date", () => {
    const r = readings({ notReport: false, date: "", channel: "nonsense", gross: 535, vat: 35 });
    expect(r[0].channel).toBe("store");
    expect(r[0].unclear).toContain("date");
  });

  it("is not a report when nothing has sales", () => {
    expect(parseSalesReply({ notReport: true }).notReport).toBe(true);
    expect(parseSalesReply({ entries: [{ date: "2026-10-01", gross: 0 }] }).notReport).toBe(true);
  });
});
