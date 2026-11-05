import { describe, expect, it } from "vitest";
import { bucketOf, groupByDays } from "./ledger-days";

describe("bucketOf", () => {
  const today = "2026-11-20";
  it("names the recent days", () => {
    expect(bucketOf("2026-11-20", today).kind).toBe("today");
    expect(bucketOf("2026-11-19", today).kind).toBe("yesterday");
    expect(bucketOf("2026-11-14", today).kind).toBe("week");
    expect(bucketOf("2026-11-13", today).kind).toBe("lastWeek");
    expect(bucketOf("2026-11-07", today).kind).toBe("lastWeek");
    expect(bucketOf("", today).kind).toBe("noDate");
  });
  it("splits older days into weeks of their month, the last one running to the month's end", () => {
    expect(bucketOf("2026-11-06", today)).toEqual({ kind: "range", month: "2026-11", from: 1, to: 7 });
    expect(bucketOf("2026-10-30", today)).toEqual({ kind: "range", month: "2026-10", from: 29, to: 31 });
    expect(bucketOf("2026-02-28", today)).toEqual({ kind: "range", month: "2026-02", from: 22, to: 28 });
    expect(bucketOf("2026-12-02", today)).toEqual({ kind: "range", month: "2026-12", from: 1, to: 7 }); // a date ahead
  });
});

describe("groupByDays", () => {
  it("groups newest first and puts documents without a date last", () => {
    const rows = ["2026-11-02", "", "2026-11-20", "2026-11-19", "2026-11-05", "2026-11-18"].map((d, i) => ({ i, d }));
    const g = groupByDays(rows, (r) => r.d, "2026-11-20");
    expect(g.map((x) => x.key)).toEqual(["today", "yesterday", "week", "2026-11:1", "noDate"]);
    expect(g[3].items.map((r) => r.d)).toEqual(["2026-11-05", "2026-11-02"]);
  });
});
