import { describe, expect, it } from "vitest";
import { type DatedDoc, findAnomalies } from "./anomalies";
import { sampleDoc } from "./sample";

const doc = (id: string, created: string, o: { tax?: string; no?: string; net?: number; cat?: string } = {}): DatedDoc => {
  const d = sampleDoc();
  d.seller.taxId = o.tax ?? "0105500000002";
  d.docNo = o.no ?? id;
  d.totals = { ...d.totals, net: o.net ?? 1000 };
  d.category = (o.cat ?? "repairs") as typeof d.category;
  return { id, doc: d, created };
};

describe("anything unusual in the last days", () => {
  const usual = [doc("a", "2026-09-01", { net: 14000 }), doc("b", "2026-09-10", { net: 13000 }), doc("c", "2026-10-01", { net: 15000 })];
  it("the same receipt twice, once per pair", () => {
    const list = findAnomalies([...usual, doc("x", "2026-10-21", { no: "IV-1" }), doc("y", "2026-10-22", { no: "IV-1" })], "2026-10-20", "2026-10-24");
    expect(list.filter((a) => a.kind === "dup")).toHaveLength(1);
  });
  it("a spend three times the usual of its kind (and at least ฿5,000)", () => {
    const list = findAnomalies([...usual, doc("big", "2026-10-21", { net: 45000 }), doc("ok", "2026-10-21", { net: 20000 })], "2026-10-20", "2026-10-24");
    const big = list.filter((a) => a.kind === "big");
    expect(big).toHaveLength(1);
    expect(big[0]).toMatchObject({ id: "big", amount: 45000, usual: 14000 });
  });
  it("needs enough history before calling something big", () => {
    expect(findAnomalies([doc("a", "2026-10-01", { net: 1000 }), doc("big", "2026-10-21", { net: 45000 })], "2026-10-20", "2026-10-24").some((a) => a.kind === "big")).toBe(false);
  });
  it("a supplier never bought from before, with whether its tax ID is valid", () => {
    const list = findAnomalies([...usual, doc("n1", "2026-10-21", { tax: "0105557035035" }), doc("n2", "2026-10-22", { tax: "0105557035035" }), doc("bad", "2026-10-22", { tax: "1234567890123" })], "2026-10-20", "2026-10-24");
    const fresh = list.filter((a) => a.kind === "new");
    expect(fresh).toHaveLength(2);
    expect(fresh.find((a) => a.id === "n1")).toMatchObject({ taxIdValid: true });
    expect(fresh.find((a) => a.id === "bad")).toMatchObject({ taxIdValid: false });
  });
  it("nothing unusual: an empty list; most serious first", () => {
    expect(findAnomalies(usual, "2026-10-20", "2026-10-24")).toEqual([]);
    const list = findAnomalies([...usual, doc("n", "2026-10-21", { tax: "0105557035035" }), doc("x", "2026-10-21", { no: "a" }), doc("big", "2026-10-22", { net: 45000 })], "2026-10-20", "2026-10-24");
    expect(list.map((a) => a.kind)).toEqual(["dup", "big", "new"]);
  });
});
