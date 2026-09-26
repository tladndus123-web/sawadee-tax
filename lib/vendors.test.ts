import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import { sampleDoc } from "./sample";
import { applyHistory, applyVendor, type Vendor } from "./vendors";

const vendor: Vendor = {
  id: "v1",
  taxId: "0745538001265",
  name: { th: "บริษัท แพนฟู้ด จำกัด", en: "PANFOOD CO., LTD.", ja: "パンフード株式会社" },
  address: { th: "ที่อยู่ในสมุด", en: "Dictionary address", ja: "" },
  branch: { th: "สำนักงานใหญ่", en: "Head office", ja: "本社" },
  tel: "034-000000",
  fax: "",
};

describe("vendor dictionary", () => {
  it("makes the name follow the dictionary", () => {
    const read = sampleDoc();
    read.seller.name = { th: "บริษัท แพนฟูด จำกัด", en: "Panfood Co Ltd", ja: "" };
    const { doc, fixed } = applyVendor(read, vendor);
    expect(doc.seller.name).toEqual(vendor.name);
    expect(fixed).toContain("seller.name");
  });

  it("never replaces a read address (branches differ) but fills empty fields", () => {
    const read = sampleDoc();
    read.seller.tel = "";
    const kept = applyVendor(read, vendor);
    expect(kept.doc.seller.address).toEqual(read.seller.address);
    expect(kept.doc.seller.tel).toBe("034-000000");

    read.seller.address = { th: "", en: "", ja: "" };
    read.seller.branch = { th: "", en: "", ja: "" };
    const filled = applyVendor(read, vendor);
    expect(filled.fixed).toEqual(expect.arrayContaining(["seller.address", "seller.branch", "seller.tel"]));
    expect(filled.doc.seller.address.en).toBe("Dictionary address");
  });

  it("does nothing for another tax ID, an invalid one, or when everything already matches", () => {
    expect(applyVendor(sampleDoc(), { ...vendor, taxId: "0105557035035" }).fixed).toEqual([]);
    const bad = sampleDoc();
    bad.seller.taxId = "123";
    expect(applyVendor(bad, vendor).fixed).toEqual([]);
    const same = sampleDoc();
    expect(applyVendor(same, { ...vendor, name: same.seller.name, tel: same.seller.tel }).fixed).toEqual([]);
  });

  it("reads separators in the tax ID", () => {
    const read = sampleDoc();
    read.seller.taxId = "0-7455-38001-26-5";
    read.seller.name = { th: "", en: "PANFOOD", ja: "" };
    expect(applyVendor(read, vendor).fixed).toContain("seller.name");
  });
});

describe("the vendor's last saved category and payment carry over", () => {
  const base = () => normalize({ category: "other", payment: "other" });
  it("overrides a fresh reading and names both fixes", () => {
    const { doc, fixed } = applyHistory(base(), { category: "food", payment: "credit" });
    expect(doc.category).toBe("food");
    expect(doc.payment).toBe("credit");
    expect(fixed).toEqual(["category", "payment"]);
  });
  it("does nothing without history, on equal values, or on junk values", () => {
    expect(applyHistory(base(), null).fixed).toEqual([]);
    expect(applyHistory(base(), { category: "other", payment: "other" }).fixed).toEqual([]);
    const junk = applyHistory(base(), { category: "nonsense", payment: "" });
    expect(junk.fixed).toEqual([]);
    expect(junk.doc.category).toBe("other");
  });
});
