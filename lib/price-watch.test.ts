import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import { priceRises } from "./price-watch";

const doc = (id: string, date: string, items: { d: string; price?: number; qty?: number; amount?: number; unit?: string }[], taxId = "0105551234567") =>
  normalize({
    id,
    docNo: id,
    date,
    seller: { taxId, name: { th: "แม็คโคร", en: "Makro", ja: "" } },
    items: items.map((i) => ({ desc: { th: i.d, en: "", ja: "" }, unit: { th: i.unit ?? "กก.", en: "", ja: "" }, qty: i.qty ?? 1, price: i.price ?? 0, amount: i.amount ?? (i.price ?? 0) * (i.qty ?? 1) })),
  });

describe("priceRises", () => {
  it("compares the month's latest purchase with the one before, 5 % or more", () => {
    const docs = [doc("a", "2026-09-10", [{ d: "หมูสามชั้น", price: 145 }]), doc("b", "2026-10-03", [{ d: "หมูสามชั้น ", price: 162 }]), doc("c", "2026-10-05", [{ d: "ไข่ไก่", price: 4.2 }, { d: "ไข่ไก่", price: 4.2 }])];
    const r = priceRises(docs, "2026-10");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ docId: "b", item: "หมูสามชั้น", before: 14500, now: 16200, pct: 12, beforeDate: "2026-09-10" });
  });

  it("ignores small rises, falls, other months and other vendors", () => {
    const docs = [
      doc("a", "2026-09-10", [{ d: "น้ำมัน", price: 100 }, { d: "ข้าว", price: 50 }, { d: "กุ้ง", price: 300 }]),
      doc("b", "2026-10-03", [{ d: "น้ำมัน", price: 103 }, { d: "ข้าว", price: 45 }]),
      doc("c", "2026-10-04", [{ d: "กุ้ง", price: 400 }], "0999999999999"),
      doc("d", "2026-11-01", [{ d: "ข้าว", price: 80 }]),
    ];
    expect(priceRises(docs, "2026-10")).toEqual([]);
  });

  it("works out a unit price from amount ÷ quantity and skips a change of unit", () => {
    const docs = [doc("a", "2026-09-10", [{ d: "ผักกาด", qty: 10, amount: 200 }, { d: "น้ำตาล", price: 25, unit: "กก." }]), doc("b", "2026-10-02", [{ d: "ผักกาด", qty: 5, amount: 125 }, { d: "น้ำตาล", price: 40, unit: "ถุง" }])];
    const r = priceRises(docs, "2026-10");
    expect(r.map((x) => [x.item, x.before, x.now, x.pct])).toEqual([["ผักกาด", 2000, 2500, 25]]);
  });

  it("puts the biggest rise first", () => {
    const docs = [doc("a", "2026-09-01", [{ d: "A", price: 10 }, { d: "B", price: 10 }]), doc("b", "2026-10-01", [{ d: "A", price: 11 }, { d: "B", price: 15 }])];
    expect(priceRises(docs, "2026-10").map((x) => x.item)).toEqual(["B", "A"]);
  });
});
