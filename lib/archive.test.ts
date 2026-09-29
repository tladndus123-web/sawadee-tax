import { describe, expect, it } from "vitest";
import sample from "@/docs/reference/sample-document.json";
import { groupByMonth, matches, monthKey, NO_DATE, search } from "./archive";
import { normalize } from "./normalize";
import { sampleDoc } from "./sample";
import type { LedgerDoc } from "./types";

const base = normalize(sample);
const doc = (date: string, net: number, extra: Partial<LedgerDoc> = {}): { doc: LedgerDoc } => ({
  doc: { ...base, date, totals: { ...base.totals, net, vat: net * 0.07 }, ...extra },
});

describe("monthly archive", () => {
  it("files documents by the month of their date", () => {
    expect(monthKey({ date: "2026-09-23" })).toBe("2026-09");
    expect(monthKey({ date: "" })).toBe(NO_DATE);
  });

  it("groups newest month first, undated last, with satang-exact totals", () => {
    const groups = groupByMonth([doc("2026-08-02", 0.1), doc("", 5), doc("2026-09-01", 0.2), doc("2026-09-30", 0.1, { paid: true })]);
    expect(groups.map((g) => g.key)).toEqual(["2026-09", "2026-08", NO_DATE]);
    expect(groups[0].net).toBe(0.3);
    expect(groups[0].items.map((i) => i.doc.date)).toEqual(["2026-09-30", "2026-09-01"]);
    expect(groups[0].unpaid).toBe(1);
  });

  it("filters by any chosen sticker and by unpaid", () => {
    const d = doc("2026-09-01", 1, { stickers: ["red", "blue"], paid: false }).doc;
    expect(matches(d, { stickers: [], unpaidOnly: false })).toBe(true);
    expect(matches(d, { stickers: ["blue", "green"], unpaidOnly: false })).toBe(true);
    expect(matches(d, { stickers: ["green"], unpaidOnly: false })).toBe(false);
    expect(matches({ ...d, paid: true }, { stickers: [], unpaidOnly: true })).toBe(false);
    // Category: the document's own, or a line of a mixed receipt
    expect(matches({ ...d, category: "other" }, { stickers: [], unpaidOnly: false, category: "other" })).toBe(true);
    expect(matches({ ...d, category: "food" }, { stickers: [], unpaidOnly: false, category: "other" })).toBe(false);
    expect(matches({ ...d, category: "food", items: [{ ...d.items[0], category: "office" }] }, { stickers: [], unpaidOnly: false, category: "office" })).toBe(true);
  });

  it("normalize keeps only known stickers, in a fixed order, once", () => {
    expect(normalize({ ...sample, stickers: ["blue", "pink", "red", "blue"] }).stickers).toEqual(["red", "blue"]);
  });
});

describe("ledger search", () => {
  const doc = sampleDoc();
  it("finds by seller in any language, document number, tax ID and amount", () => {
    for (const q of ["panfood", "แพนฟู้ด", "IV690923", "0745538001265", "64,200", "64200", "64200.00", "panfood 64200"]) {
      expect(search(doc, q), q).toBe(true);
    }
  });
  it("needs every word to match", () => {
    expect(search(doc, "panfood 99999")).toBe(false);
    expect(search(doc, "sunny")).toBe(false);
  });
  it("an empty search keeps everything", () => {
    expect(search(doc, "  ")).toBe(true);
  });
});

describe("one rule for 'unpaid' (ledger, filters, dashboard)", async () => {
  const { isUnpaid, paidAtTill } = await import("./archive");
  it("unpaid = not ticked paid; what the person ticks wins", () => {
    expect(isUnpaid({ paid: false })).toBe(true);
    expect(isUnpaid({ paid: true })).toBe(false);
  });
  it("a fresh cash / transfer / card receipt without a due date starts out paid on its date", () => {
    const r = paidAtTill({ paid: false, paidDate: "", payment: "transfer", dueDate: "", date: "2026-09-27" });
    expect([r.paid, r.paidDate]).toEqual([true, "2026-09-27"]);
    expect(paidAtTill({ paid: false, paidDate: "", payment: "cash", dueDate: "", date: "2026-09-27" }).paid).toBe(true);
  });
  it("credit, a printed due date, or an unknown payment stay unpaid", () => {
    expect(paidAtTill({ paid: false, paidDate: "", payment: "credit", dueDate: "", date: "2026-09-27" }).paid).toBe(false);
    expect(paidAtTill({ paid: false, paidDate: "", payment: "transfer", dueDate: "2026-10-15", date: "2026-09-27" }).paid).toBe(false);
    expect(paidAtTill({ paid: false, paidDate: "", payment: "other", dueDate: "", date: "2026-09-27" }).paid).toBe(false);
  });
});
