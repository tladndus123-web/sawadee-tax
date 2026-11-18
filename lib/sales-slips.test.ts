import { describe, expect, it } from "vitest";
import type { Sale } from "./sales";
import { elsewherePairs, groupSlips, sameDay, sameSlip, slipElsewhere, slipPlan, swappedDate } from "./sales-slips";

const s = (o: Partial<Sale & { part: number }>): Sale & { part: number } => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  branchId: "",
  date: "2026-11-05",
  channel: "store",
  docFrom: "",
  docTo: "",
  bills: 0,
  gross: 0,
  vat: 0,
  exempt: 0,
  note: "",
  photoPath: null,
  source: "photo",
  part: 1,
  ...o,
});

describe("several slips a day", () => {
  const breakfast = s({ id: "b", part: 1, docFrom: "A0001", docTo: "A0040", gross: 10700, vat: 700, bills: 40 });
  const lunch = s({ id: "l", part: 2, docFrom: "A0041", docTo: "A0120", gross: 21400, vat: 1400, bills: 80 });
  const dinner = s({ part: 3, docFrom: "A0121", docTo: "A0200", gross: 32100, vat: 2100, bills: 80 });

  it("tells a slip read twice from another meal", () => {
    expect(sameSlip(breakfast, { ...breakfast, docFrom: " a0001 " })).toBe(true);
    expect(sameSlip(breakfast, lunch)).toBe(false);
    // no receipt numbers printed: the very same figures
    expect(sameSlip(s({ gross: 500, vat: 33 }), s({ gross: 500, vat: 33 }))).toBe(true);
    expect(sameSlip(s({ gross: 500, vat: 33 }), s({ gross: 600, vat: 33 }))).toBe(false);
    expect(sameSlip(s({ gross: 0 }), s({ gross: 0 }))).toBe(false);
    expect(sameSlip(breakfast, { ...breakfast, docFrom: "" , docTo: "" })).toBe(false);
  });

  it("adds a new meal, keeps a re-read slip single, replaces a typed day", () => {
    expect(slipPlan([], dinner)).toEqual({ mode: "new" });
    expect(slipPlan([breakfast, lunch], dinner)).toEqual({ mode: "add", count: 3, total: 64200 });
    expect(slipPlan([breakfast, lunch], { ...lunch })).toEqual({ mode: "same", target: lunch });
    const typed = s({ id: "t", source: "manual", gross: 50000 });
    expect(slipPlan([typed], dinner)).toEqual({ mode: "replace", target: typed });
    // a typed total over a day of slips replaces only when the day had one line
    expect(slipPlan([breakfast], { ...s({ gross: 9 }), source: "manual" })).toEqual({ mode: "replace", target: breakfast });
    expect(slipPlan([breakfast], dinner).mode).toBe("add");
  });

  it("finds the day's lines and sums them into one row", () => {
    const other = s({ id: "o", date: "2026-11-04", gross: 1 });
    const branch = s({ id: "x", branchId: "b1", gross: 2 });
    expect(sameDay([breakfast, lunch, other, branch], { date: "2026-11-05", channel: "store", branchId: "", id: "l" }).map((x) => x.id)).toEqual(["b"]);
    const [day, ...rest] = groupSlips([lunch, breakfast, dinner, other]);
    expect(rest).toHaveLength(1);
    expect(day.slips.map((x) => x.id)).toEqual(["b", "l", dinner.id]);
    expect(day).toMatchObject({ gross: 64200, vat: 4200, bills: 200, docFrom: "A0001", docTo: "A0200" });
  });
});

describe("the same report on another day (day and month read swapped)", () => {
  it("swaps day and month only when that is another real date", () => {
    expect(swappedDate("2026-11-05")).toBe("2026-05-11");
    expect(swappedDate("2026-05-05")).toBeNull();
    expect(swappedDate("2026-11-25")).toBeNull();
  });
  it("finds the same figures on the swapped date, and the same receipt numbers on any day", () => {
    const old = s({ id: "a", date: "2026-05-11", gross: 43268.9, vat: 2830.66, bills: 120 });
    expect(slipElsewhere([old], s({ date: "2026-11-05", gross: 43268.9, vat: 2830.66, bills: 120 }))?.id).toBe("a");
    expect(slipElsewhere([old], s({ date: "2026-11-05", gross: 43268.9, vat: 2830.66, bills: 121 }))).toBeNull();
    expect(slipElsewhere([old], s({ date: "2026-11-06", gross: 43268.9, vat: 2830.66, bills: 120 }))).toBeNull();
    const r = s({ id: "b", date: "2026-10-02", docFrom: "R001", docTo: "R090", gross: 1000 });
    expect(slipElsewhere([r], s({ date: "2026-10-20", docFrom: "r001", docTo: "R090", gross: 1000 }))?.id).toBe("b");
    expect(slipElsewhere([r], s({ date: "2026-10-20", docFrom: "R091", docTo: "R150", gross: 1000 }))).toBeNull();
    expect(slipElsewhere([r], s({ date: "2026-10-20", channel: "grab", docFrom: "R001", docTo: "R090" }))).toBeNull();
  });
});

describe("pairs already in twice (the sales screen banner)", () => {
  it("lists each pair once, by receipt numbers or swapped-date figures", () => {
    const a = s({ id: "a", date: "2026-05-11", gross: 43268.9, vat: 2830.66, bills: 120 });
    const b = s({ id: "b", date: "2026-11-05", gross: 43268.9, vat: 2830.66, bills: 120 });
    const c = s({ id: "c", date: "2026-10-02", docFrom: "R1", docTo: "R9", gross: 500 });
    const d = s({ id: "d", date: "2026-10-03", docFrom: "R1", docTo: "R9", gross: 500 });
    const e = s({ id: "e", date: "2026-11-06", gross: 43268.9, vat: 2830.66, bills: 120 });
    const pairs = elsewherePairs([a, b, c, d, e]);
    expect(pairs.map((p) => `${p.first.id}${p.second.id}`).sort()).toEqual(["ab", "cd"]);
  });
});
