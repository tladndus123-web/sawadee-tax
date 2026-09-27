import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import { sampleDoc } from "./sample";
import { applyHistory, applyRule, applyVendor, canAutoRegister, pickVendor, suggestRule, type Vendor } from "./vendors";

const vendor: Vendor = {
  id: "v1",
  taxId: "0745538001265",
  name: { th: "บริษัท แพนฟู้ด จำกัด", en: "PANFOOD CO., LTD.", ja: "パンフード株式会社" },
  address: { th: "ที่อยู่ในสมุด", en: "Dictionary address", ja: "" },
  branch: { th: "สำนักงานใหญ่", en: "Head office", ja: "本社" },
  tel: "034-000000",
  fax: "",
  ruleCategory: null,
  rulePayment: null,
  autoRegister: false,
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

describe("picking a vendor fills the seller in one go", () => {
  it("replaces another seller completely and carries the vendor's category/payment", () => {
    const d = normalize({ seller: { name: { th: "ร้านอื่น", en: "Other", ja: "" }, taxId: "0105557035035", address: { th: "ที่อื่น", en: "", ja: "" }, tel: "02-000", branchCode: "00001" }, category: "other", payment: "other" });
    const out = pickVendor(d, vendor, { category: "food", payment: "credit" });
    expect(out.seller.taxId).toBe(vendor.taxId);
    expect(out.seller.name).toEqual(vendor.name);
    expect(out.seller.address).toEqual(vendor.address);
    expect(out.seller.tel).toBe(vendor.tel);
    expect(out.seller.branchCode).toBe("");
    expect([out.category, out.payment]).toEqual(["food", "credit"]);
  });
  it("keeps what this paper printed for the same vendor (a branch address)", () => {
    const d = normalize({ seller: { name: { th: "x", en: "", ja: "" }, taxId: vendor.taxId, address: { th: "สาขา 2", en: "Branch 2", ja: "" }, tel: "", branchCode: "00002" } });
    const out = pickVendor(d, vendor, null);
    expect(out.seller.name).toEqual(vendor.name);
    expect(out.seller.address.th).toBe("สาขา 2");
    expect(out.seller.branchCode).toBe("00002");
    expect(out.seller.tel).toBe(vendor.tel);
  });
});

describe("automatic registration rules (freee-style)", () => {
  const ruled = { ...vendor, ruleCategory: "food", rulePayment: "credit", autoRegister: true };
  const fromVendor = () => normalize({ seller: { taxId: vendor.taxId }, category: "office", payment: "cash", confidence: "high" });

  it("the rule wins over the AI and the history", () => {
    const { doc, fixed } = applyRule(fromVendor(), ruled);
    expect([doc.category, doc.payment]).toEqual(["food", "credit"]);
    expect(fixed).toEqual(["category", "payment"]);
    expect(applyRule(fromVendor(), vendor).fixed).toEqual([]);
  });

  it("saves without asking only when switched on, confident, and every check passes", () => {
    expect(canAutoRegister(fromVendor(), ruled, [])).toBe(true);
    expect(canAutoRegister(fromVendor(), vendor, [])).toBe(false);
    expect(canAutoRegister(fromVendor(), ruled, ["unclear"])).toBe(false);
    expect(canAutoRegister({ ...fromVendor(), confidence: "low" }, ruled, [])).toBe(false);
    expect(canAutoRegister(normalize({ seller: { taxId: "0105557035035" } }), ruled, [])).toBe(false);
  });

  it("offers a rule after three identical saves, not before and not when it already exists", () => {
    const same = { category: "food", payment: "credit" };
    expect(suggestRule([same, same, same], vendor)).toEqual(same);
    expect(suggestRule([same, same], vendor)).toBeNull();
    expect(suggestRule([same, same, { category: "office", payment: "credit" }], vendor)).toBeNull();
    expect(suggestRule([same, same, same], ruled)).toBeNull();
  });
});
