import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import { applyOurCompany, ourCompanyFrom } from "./our-company";

const US = "0105561234567";
const doc = (th: string, branch: string, addr: string, taxId = US, en = "") =>
  normalize({ customer: { taxId, name: { th, en, ja: "" }, branch: { th: branch, en: "", ja: "" }, address: { th: addr, en: "", ja: "" } } });

describe("our company on purchase invoices", () => {
  const saved = [
    doc("บริษัท ซันยู ครีเอท จำกัด", "สาขา 00006", "9/15 ถนนเจิมจอมพล", US, "Sanyu Create Co., Ltd."),
    doc("บริษัท ซันยู ครีเอท จำกัด (สาขาที่ 00006)", "00006", "9/15 ถนนเจิมจอมพล"),
    doc("บริษัท ชันยู ครีเอท จำกัด", "สาขาที่ 00006", "9/15 ถ.เจิมจอมพล"),
    doc("บริษัท ซันยู ครีเอท จำกัด", "สาขา 00007", "93/3 ถนนศรีราชานคร1"),
    doc("บริษัท ธันยู ครีเอท จำกัด", "สาขาที่ 00007", "93/3 ถนนศรีราชานคร1"),
    doc("บริษัท ยันนู ศรีเอท จำกัด", "สำนักงานใหญ่", "155/18-19 สุขุมวิท"),
    doc("ร้านอื่น", "", "x", "0999999999999"),
  ];

  it("takes the most common spelling of our name, without the branch printed after it", () => {
    const ours = ourCompanyFrom(saved, US);
    expect(ours.name).toEqual({ th: "บริษัท ซันยู ครีเอท จำกัด", en: "Sanyu Create Co., Ltd." });
  });

  it("keeps an address per branch, only where two documents agree", () => {
    const ours = ourCompanyFrom(saved, US);
    expect(ours.addressByBranch["00006"]).toEqual({ th: "9/15 ถนนเจิมจอมพล" });
    expect(ours.addressByBranch["00007"]).toEqual({ th: "93/3 ถนนศรีราชานคร1" });
    expect(ours.addressByBranch["00000"]).toBeUndefined();
  });

  it("fixes a misread buyer and uses its branch's address; other buyers are left alone", () => {
    const ours = ourCompanyFrom(saved, US);
    const fixed = applyOurCompany(doc("บริษัท ซันนู คริเอท จำกัด", "สาขาที่ 00007", "93/3 ถ.ศรีราชา"), ours);
    expect(fixed.customer.name.th).toBe("บริษัท ซันยู ครีเอท จำกัด");
    expect(fixed.customer.address.th).toBe("93/3 ถนนศรีราชานคร1");
    // Head office: no agreed address yet, so the reading stays
    expect(applyOurCompany(doc("x", "สำนักงานใหญ่", "155 อ่านได้"), ours).customer.address.th).toBe("155 อ่านได้");
    const other = doc("ร้านอื่น", "", "x", "0999999999999");
    expect(applyOurCompany(other, ours)).toBe(other);
  });
});
