import { describe, expect, it } from "vitest";
import { missingRequired } from "./checks";
import { manualStart, retitle } from "./manual-doc";
import { normalize } from "./normalize";

const CO = "0105557035035";
const addressedToUs = (date: string, name: string) =>
  normalize({ date, customer: { taxId: CO, code: "R-1", name: { th: name, en: "", ja: "" }, address: { th: "กรุงเทพฯ", en: "", ja: "" }, branch: { th: "สำนักงานใหญ่", en: "", ja: "" } } });

describe("a document typed by hand starts as a proper tax invoice", () => {
  it("is titled ใบกำกับภาษี, dated today, with one item line", () => {
    const d = manualStart([], CO, "2026-09-27");
    expect(d.docType).toBe("full");
    expect(d.docTitle.th).toBe("ใบกำกับภาษี");
    expect(d.date).toBe("2026-09-27");
    expect(d.items).toHaveLength(1);
    expect(d.customer.taxId).toBe(CO);
  });

  it("copies the buyer from the newest document addressed to us (not the customer code)", () => {
    const d = manualStart([addressedToUs("2026-08-01", "เก่า"), addressedToUs("2026-09-20", "บริษัท ซันยู ครีเอท จำกัด"), normalize({ date: "2026-09-26" })], CO, "2026-09-27");
    expect(d.customer.name.th).toBe("บริษัท ซันยู ครีเอท จำกัด");
    expect(d.customer.address.th).toBe("กรุงเทพฯ");
    expect(d.customer.branch.th).toBe("สำนักงานใหญ่");
    expect(d.customer.code).toBe("");
  });

  it("then only lacks what the person types: seller, number and the item", () => {
    const d = manualStart([addressedToUs("2026-09-20", "บริษัท ซันยู ครีเอท จำกัด")], CO, "2026-09-27");
    expect(missingRequired(d)).toEqual(["docNo", "seller.name", "seller.address", "seller.branch", "items.0.desc"]);
  });
});

describe("picking the kind of document typed by hand", () => {
  it("retitles it: abbreviated invoice, receipt, and no title for other", () => {
    const d = manualStart([], CO, "2026-09-30");
    expect(retitle(d.docTitle, "abbr").th).toBe("ใบกำกับภาษีอย่างย่อ");
    expect(retitle(retitle(d.docTitle, "receipt"), "full").th).toBe("ใบกำกับภาษี");
    expect(retitle(d.docTitle, "receipt")).toEqual({ th: "ใบเสร็จรับเงิน", en: "Receipt", ja: "領収書" });
    expect(retitle(d.docTitle, "other")).toEqual({ th: "", en: "", ja: "" });
    expect(retitle({ th: "", en: "", ja: "" }, "full").th).toBe("ใบกำกับภาษี");
  });
  it("keeps a title someone wrote themselves", () => {
    const own = { th: "ใบแจ้งหนี้", en: "Invoice", ja: "" };
    expect(retitle(own, "receipt")).toEqual(own);
  });
});
