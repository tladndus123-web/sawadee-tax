import { describe, expect, it } from "vitest";
import { docLabel } from "./doc-label";

const tri = (en: string, th = "", ja = "") => ({ th, en, ja });
const item = (desc: ReturnType<typeof tri>) => ({ category: "" as const, code: "", desc, wh: "", qty: 1, unit: tri(""), price: 0, amount: 0 });
const doc = (p: { seller?: string; docNo?: string; items?: ReturnType<typeof item>[] }) => ({ seller: { name: tri(p.seller ?? "") } as never, docNo: p.docNo ?? "", items: p.items ?? [] });

describe("what a document is called in a list", () => {
  it("the seller first, then the document number", () => {
    expect(docLabel(doc({ seller: "PANFOOD", docNo: "IV-1" }), "en")).toEqual({ name: "PANFOOD", more: 0 });
    expect(docLabel(doc({ docNo: "IV-1" }), "en")).toEqual({ name: "IV-1", more: 0 });
  });
  it("typed by hand with no seller: the first item line (in the screen language) and how many more", () => {
    const d = doc({ items: [item(tri("Cash purchases through September 27", "ซื้อเงินสด", "現金仕入")), item(tri("", "", "消耗品")), item(tri("", "", "修繕費"))] });
    expect(docLabel(d, "ja")).toEqual({ name: "現金仕入", more: 2 });
    expect(docLabel(d, "en")).toEqual({ name: "Cash purchases through September 27", more: 2 });
    expect(docLabel(doc({ items: [item(tri("Labor cost", "ค่าแรงงาน", "人件費"))] }), "th")).toEqual({ name: "ค่าแรงงาน", more: 0 });
  });
  it("nothing at all: empty (the list shows a dash)", () => {
    expect(docLabel(doc({ items: [item(tri(""))] }), "en")).toEqual({ name: "", more: 0 });
  });
});
