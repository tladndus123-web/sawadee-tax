import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import { priceBoard, priceRises } from "./price-watch";

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

describe("priceBoard (the price change screen)", () => {
  it("rises and falls per vendor against the last purchase before the month, with what it cost more", () => {
    const docs = [
      doc("a", "2026-08-20", [{ d: "หมู", price: 140 }, { d: "ไข่", price: 4 }]),
      doc("b", "2026-09-10", [{ d: "หมู", price: 145 }, { d: "ข้าว", price: 50 }, { d: "น้ำมัน", price: 60 }]),
      doc("c", "2026-10-03", [{ d: "หมู", price: 160, qty: 10 }, { d: "ข้าว", price: 45, qty: 4 }, { d: "น้ำมัน", price: 60.2 }, { d: "ผัก", price: 30 }]),
      doc("d", "2026-10-20", [{ d: "หมู", price: 162, qty: 5 }]),
      doc("e", "2026-11-01", [{ d: "หมู", price: 999 }]),
      doc("f", "2026-10-05", [{ d: "หมู", price: 200 }], "0999999999999"),
    ];
    const b = priceBoard(docs, "2026-10");
    expect(b).toMatchObject({ up: 1, down: 1, same: 1, first: 2 });
    // หมู: 145 → 162 (+12 %); paid (160−145)×10 + (162−145)×5 = 150 + 85 = ฿235 more
    const v = b.vendors[0];
    expect(v.items.map((i) => [i.item, i.before, i.now, i.pct, i.qty, i.extra])).toEqual([
      ["หมู", 14500, 16200, 12, 15, 23500],
      ["น้ำมัน", 6000, 6020, 0, 1, 0],
      ["ข้าว", 5000, 4500, -10, 4, -2000],
    ]);
    expect(b.paidMore).toBe(23500);
    expect(b.saved).toBe(2000);
    expect(v.extra).toBe(21500);
  });
  it("nothing bought in the month → empty board", () => {
    expect(priceBoard([doc("a", "2026-09-01", [{ d: "A", price: 10 }])], "2026-10")).toMatchObject({ vendors: [], up: 0, down: 0, first: 0 });
  });
});
