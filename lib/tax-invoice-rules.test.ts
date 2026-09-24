// Thai tax invoice requirements (docs/thai-tax-invoice-check.md):
// Revenue Code §86/4 + DG VAT Notification No. 199 (head office / branch), §82/3 (3-year input VAT claim window).
import { describe, expect, it } from "vitest";
import { claimable, missingRequired, runChecks } from "./checks";
import { normalize } from "./normalize";
import { sampleDoc } from "./sample";
import type { LedgerDoc } from "./types";

const COMPANY = "0105557035035";
const TODAY = "2026-09-25";
const doc = (patch: (d: LedgerDoc) => void = () => {}) => {
  const d = sampleDoc();
  patch(d);
  return d;
};
const check = (d: LedgerDoc, key: string, today = TODAY) => runChecks(d, { companyTaxId: COMPANY, today }).find((c) => c.key === key);

describe("seller head office / branch (Notification 199)", () => {
  it("is read, kept and required on a full tax invoice", () => {
    expect(normalize({ seller: { branch: { th: "สาขาที่ 00003", en: "Branch 00003", ja: "支店 00003" } } }).seller.branch.th).toBe("สาขาที่ 00003");
    expect(normalize({}).seller.branch).toEqual({ th: "", en: "", ja: "" });
    expect(missingRequired(doc((d) => (d.seller.branch = { th: "", en: "", ja: "" })))).toEqual(["seller.branch"]);
  });
});

describe("required particulars (§86/4)", () => {
  it("passes the complete sample", () => {
    expect(missingRequired(doc())).toEqual([]);
    expect(check(doc(), "required")).toMatchObject({ ok: true, na: false });
  });

  it("lists every missing item as a field path", () => {
    const d = doc((d) => {
      d.docTitle = { th: "ใบส่งของ", en: "Delivery note", ja: "" };
      d.docNo = "";
      d.customer.address = { th: "", en: "", ja: "" };
      d.customer.branch = { th: "", en: "", ja: "" };
    });
    expect(missingRequired(d)).toEqual(["docTitle", "docNo", "customer.address", "customer.branch"]);
    expect(check(d, "required")).toMatchObject({ ok: false, paths: ["docTitle", "docNo", "customer.address", "customer.branch"] });
  });

  it("accepts buyer details printed only in English", () => {
    expect(missingRequired(doc((d) => (d.customer.name = { th: "", en: "Sunyu Create Co., Ltd.", ja: "" })))).toEqual([]);
  });

  it("does not apply to receipts or abbreviated invoices", () => {
    expect(missingRequired(doc((d) => ((d.docType = "abbr"), (d.docNo = ""))))).toEqual([]);
    expect(check(doc((d) => (d.docType = "receipt")), "required")).toBeUndefined();
  });
});

describe("input VAT claim window (§82/3: 3 years from issue)", () => {
  it("is open until three years after the invoice date", () => {
    expect(check(doc(), "claimWindow", "2029-09-23")?.ok).toBe(true);
    expect(check(doc(), "claimWindow", "2029-09-24")?.ok).toBe(false);
  });
  it("handles 29 February", () => {
    expect(check(doc((d) => (d.date = "2028-02-29")), "claimWindow", "2031-02-28")?.ok).toBe(true);
    expect(check(doc((d) => (d.date = "2028-02-29")), "claimWindow", "2031-03-01")?.ok).toBe(false);
  });
  it("only applies to full tax invoices with a real date", () => {
    expect(check(doc((d) => (d.docType = "receipt")), "claimWindow")).toBeUndefined();
    expect(check(doc((d) => (d.date = "")), "claimWindow")).toBeUndefined();
  });
});

describe("claimable input VAT", () => {
  it("needs our company, every required item and an open claim window", () => {
    expect(claimable(doc(), COMPANY, TODAY)).toBe(true);
    expect(claimable(doc((d) => (d.seller.branch = { th: "", en: "", ja: "" })), COMPANY, TODAY)).toBe(false);
    expect(claimable(doc(), COMPANY, "2030-01-01")).toBe(false);
  });
});
