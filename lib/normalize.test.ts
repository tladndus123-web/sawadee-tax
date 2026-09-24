import { describe, expect, it } from "vitest";
import sample from "@/docs/reference/sample-document.json";
import { blank, normalize, normalizeTotals } from "./normalize";

describe("normalize", () => {
  it("returns the blank shape for junk", () => {
    expect(normalize(null)).toEqual(blank());
    expect(normalize("x")).toEqual(blank());
  });

  it("keeps the sample document intact", () => {
    const d = normalize(sample);
    expect(d.docNo).toBe("IV690923-0128");
    expect(d.date).toBe("2026-09-23");
    expect(d.dueDate).toBe("2026-10-08");
    expect(d.seller.taxId).toBe("0745538001265");
    expect(d.items).toHaveLength(1);
    expect(d.items[0]).toMatchObject({ code: "6F24100000", qty: 10, price: 6000, amount: 60000 });
    expect(d.totals).toEqual({
      total: 60000,
      discount: 0,
      afterDisc: 60000,
      deposit: 0,
      afterDep: 60000,
      exempt: 0,
      taxable: 60000,
      vat: 4200,
      net: 64200,
      wht: 0,
    });
    expect(d.signs.deliverer?.en).toBe("Chanchai");
    expect(d.unclear).toEqual(["customer.name", "sales.name"]);
  });

  it("converts a Buddhist era date but keeps 69 inside the document number", () => {
    const d = normalize({ date: "2569-09-23", dueDate: "2569-10-08", docNo: "IV690923-0128" });
    expect(d.date).toBe("2026-09-23");
    expect(d.dueDate).toBe("2026-10-08");
    expect(d.dateWasBuddhist).toBe(true);
    expect(d.docNo).toBe("IV690923-0128");
  });

  it("cleans numbers, tax IDs and enums", () => {
    const d = normalize({
      docType: "weird",
      category: "nope",
      payment: "cash",
      confidence: "LOW",
      seller: { taxId: "0-7455-38001-26-5" },
      creditDays: "15 days",
      items: [{ qty: "", price: "6,000.00", amount: "60,000.004" }],
    });
    expect(d.docType).toBe("other");
    expect(d.category).toBe("other");
    expect(d.payment).toBe("cash");
    expect(d.confidence).toBe("medium");
    expect(d.seller.taxId).toBe("0745538001265");
    expect(d.creditDays).toBe(15);
    // Review #5: a missing quantity stays 0 (no default of 1) so the line check can flag it
    expect(d.items[0]).toMatchObject({ qty: 0, price: 6000, amount: 60000 });
  });

  it("fills totals lines that were not printed", () => {
    expect(
      normalizeTotals({ total: 1000, discount: 100, vat: 63, afterDisc: null, afterDep: null, taxable: null, net: null }),
    ).toEqual({
      total: 1000,
      discount: 100,
      afterDisc: 900,
      deposit: 0,
      afterDep: 900,
      exempt: 0,
      taxable: 900,
      vat: 63,
      net: 963,
      wht: 0,
    });
    // Only net printed (e.g. a simple receipt)
    expect(normalizeTotals({ net: 107.1, vat: 7.01 })).toMatchObject({ total: 107.1, taxable: 107.1, net: 107.1 });
  });

  it("does satang math without floating point drift", () => {
    expect(normalizeTotals({ total: 0.3, discount: 0.1 }).afterDisc).toBe(0.2);
    expect(normalizeTotals({ total: 0.1, deposit: 0.2 }).afterDep).toBe(-0.1);
  });

  it("reads first-version documents", () => {
    const d = normalize({
      vendor: { th: "ร้าน", en: "Shop", ja: "店" },
      taxId: "0745538001265",
      subtotal: 100,
      vat: 7,
      total: 107,
      items: [{ name: { en: "Tea" }, qty: 2, amount: 100 }],
    });
    expect(d.seller.name.en).toBe("Shop");
    expect(d.totals).toMatchObject({ total: 100, taxable: 100, vat: 7, net: 107 });
    expect(d.items[0].desc.en).toBe("Tea");
  });

  it("keeps only valid field boxes", () => {
    const d = normalize({ field_boxes: { "customer.name": [0.1, 0.2, 0.3, 0.05], bad: [0, 0, 2, 1], short: [1] } });
    expect(d.fieldBoxes).toEqual({ "customer.name": [0.1, 0.2, 0.3, 0.05] });
  });

  it("limits list sizes", () => {
    const d = normalize({
      items: Array.from({ length: 50 }, () => ({ amount: 1 })),
      unclear: Array(40).fill("x"),
      terms: Array(12).fill({ en: "t" }),
    });
    expect(d.items).toHaveLength(40);
    expect(d.unclear).toHaveLength(30);
    expect(d.terms).toHaveLength(10);
  });
});
