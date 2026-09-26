// Thai tax invoice requirements (docs/thai-tax-invoice-check.md):
// Revenue Code §86/4 + DG VAT Notification No. 199 (head office / branch), §82/3 (3-year input VAT claim window).
import { describe, expect, it } from "vitest";
import { claimable, missingRequired, runChecks, vatBlocked } from "./checks";
import { invoiceMonth, monthKey } from "./archive";
import { openClaimMonth } from "./month-lock-store";
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

describe("input VAT claim window (§82/3 + DG VAT Notification No. 4: up to 6 months after the invoice month)", () => {
  it("is open until the end of the 6th month after the invoice month", () => {
    // sample invoice: 23/09/2026 → last claim month March 2027
    expect(check(doc(), "claimWindow", "2027-03-31")?.ok).toBe(true);
    expect(check(doc(), "claimWindow", "2027-04-01")?.ok).toBe(false);
  });
  it("with a claim month set, that month must be inside the window", () => {
    expect(check(doc((d) => (d.taxMonth = "2027-03")), "claimWindow", "2030-01-01")?.ok).toBe(true);
    expect(check(doc((d) => (d.taxMonth = "2027-04")), "claimWindow")?.ok).toBe(false);
    expect(check(doc((d) => (d.taxMonth = "2026-08")), "claimWindow")?.ok).toBe(false);
  });
  it("counts from the month, so month ends work", () => {
    expect(check(doc((d) => (d.date = "2026-08-31")), "claimWindow", "2027-02-28")?.ok).toBe(true);
    expect(check(doc((d) => (d.date = "2026-08-31")), "claimWindow", "2027-03-01")?.ok).toBe(false);
  });
  it("only applies to full tax invoices with a real date", () => {
    expect(check(doc((d) => (d.docType = "receipt")), "claimWindow")).toBeUndefined();
    expect(check(doc((d) => (d.date = "")), "claimWindow")).toBeUndefined();
  });
});

describe("claimable input VAT", () => {
  it("needs our company, every required item and an open claim window", () => {
    expect(claimable(doc(), COMPANY)).toBe(true);
    expect(claimable(doc((d) => (d.seller.branch = { th: "", en: "", ja: "" })), COMPANY)).toBe(false);
    // Decided by the claim month, never by today: a filed month's report doesn't change later
    expect(claimable(doc((d) => (d.taxMonth = "2027-03")), COMPANY)).toBe(true);
    expect(claimable(doc((d) => (d.taxMonth = "2027-04")), COMPANY)).toBe(false);
    // A copy of a tax invoice can't be claimed (DG VAT Notification No. 42)
    expect(claimable(doc((d) => (d.copyKind = "copy")), COMPANY)).toBe(false);
  });
});

describe("forbidden input VAT (§82/5)", () => {
  it("entertainment is not claimable by default, other categories are", () => {
    expect(claimable(doc(), COMPANY)).toBe(true);
    expect(claimable(doc((d) => (d.category = "entertainment")), COMPANY)).toBe(false);
  });
  it("can be set by hand either way (e.g. a sedan's fuel, or entertainment ruled claimable)", () => {
    expect(claimable(doc((d) => (d.noClaim = true)), COMPANY)).toBe(false);
    expect(vatBlocked({ category: "entertainment", noClaim: false })).toBe(false);
    expect(normalize({ noClaim: "yes" }).noClaim).toBe(null);
  });
});

describe("claim (tax) month", () => {
  it("defaults to the invoice month and follows a set claim month", () => {
    const d = doc((x) => (x.date = "2026-08-25"));
    expect(monthKey(d)).toBe("2026-08");
    const late = { ...d, taxMonth: "2026-09" };
    expect(monthKey(late)).toBe("2026-09");
    expect(invoiceMonth(late)).toBe("2026-08");
  });
  it("keeps only a real YYYY-MM", () => {
    expect(normalize({ taxMonth: "2026-13" }).taxMonth).toBe("");
    expect(normalize({ taxMonth: "2026-09" }).taxMonth).toBe("2026-09");
  });
});

describe("late invoice into a closed month", () => {
  it("goes to the first open month after it", () => {
    expect(openClaimMonth("2026-08", new Set())).toBe("");
    expect(openClaimMonth("2026-08", new Set(["2026-08"]))).toBe("2026-09");
    expect(openClaimMonth("2026-11", new Set(["2026-11", "2026-12"]))).toBe("2027-01");
  });
});
