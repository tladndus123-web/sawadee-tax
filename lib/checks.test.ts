import { describe, expect, it } from "vitest";
import { type CheckContext, claimable, type DetailWord, detailText, flagsFor, runChecks } from "./checks";
import { sampleDoc } from "./sample";
import type { LedgerDoc } from "./types";

const COMPANY = "0105557035035";

const doc = (patch: (d: LedgerDoc) => void = () => {}) => {
  const d = sampleDoc();
  patch(d);
  return d;
};

const TODAY = "2026-09-25";
const find = (d: LedgerDoc, key: string, ctx: CheckContext = { companyTaxId: COMPANY, today: TODAY }) =>
  runChecks(d, ctx).find((c) => c.key === key);

const EN: Partial<Record<DetailWord, string>> = { written: "printed", calc: "calculated" };
const en = (w: DetailWord) => EN[w] ?? w;

describe("sample document", () => {
  it("passes every check except the unclear-fields warning", () => {
    const results = runChecks(doc(), { companyTaxId: COMPANY, others: [], today: TODAY });
    expect(results.filter((c) => !c.ok && !c.na).map((c) => c.key)).toEqual(["unclear"]);
    expect(results.map((c) => c.key)).toEqual([
      "sellerTax",
      "buyerTax",
      "company",
      "required",
      "items",
      "chain",
      "vat",
      "net",
      "words",
      "due",
      "date",
      "claimWindow",
      "unclear",
      "dup",
      "conf",
    ]);
  });

  it("shows the working in the details", () => {
    expect(detailText(find(doc(), "vat")!.detail, en)).toBe("60,000.00 × 7% = 4,200.00 · printed 4,200.00");
    expect(detailText(find(doc(), "due")!.detail, en)).toBe("23/09/2026 + 15 = 08/10/2026 · printed 08/10/2026");
    expect(detailText(find(doc(), "items")!.detail, en)).toBe(
      "10.00 × 6,000.00 = 60,000.00 · Σ 60,000.00 / 60,000.00",
    );
    expect(detailText(find(doc(), "words")!.detail, en)).toBe("calculated: หกหมื่นสี่พันสองร้อยบาทถ้วน");
  });

  it("is claimable for our company", () => {
    expect(claimable(doc(), COMPANY)).toBe(true);
    expect(claimable(doc(), "")).toBe(false); // review #8: needs our company
    expect(claimable(doc(), "0745538001265")).toBe(false);
    expect(claimable(doc((d) => (d.docType = "abbr")), COMPANY)).toBe(false);
  });
});

describe("tax IDs", () => {
  it("fails a bad seller check digit", () => {
    expect(find(doc((d) => (d.seller.taxId = "0745538001264")), "sellerTax")?.ok).toBe(false);
  });

  it("requires a buyer tax ID on a full tax invoice only", () => {
    expect(find(doc((d) => (d.customer.taxId = "")), "buyerTax")?.ok).toBe(false);
    const receipt = doc((d) => {
      d.customer.taxId = "";
      d.docType = "receipt";
    });
    expect(find(receipt, "buyerTax")).toBeUndefined();
  });

  it("treats a missing seller tax ID as n/a on a plain receipt", () => {
    const receipt = doc((d) => {
      d.seller.taxId = "";
      d.docType = "receipt";
    });
    expect(find(receipt, "sellerTax")).toMatchObject({ ok: true, na: true });
  });

  it("compares the buyer with our company", () => {
    expect(find(doc(), "company", { companyTaxId: "0745538001265" })?.ok).toBe(false);
    expect(find(doc(), "company", { companyTaxId: "" })).toMatchObject({ ok: true, na: true });
  });
});

describe("amounts", () => {
  it("catches a wrong line amount", () => {
    expect(find(doc((d) => (d.items[0].amount = 59000)), "items")?.ok).toBe(false);
  });

  it("allows half a baht per line and one baht on the sum", () => {
    const d = doc((x) => {
      x.items[0].qty = 3;
      x.items[0].price = 33.33;
      x.items[0].amount = 100;
      x.totals.total = 100.5;
    });
    expect(find(d, "items")?.ok).toBe(true);
  });

  it("checks the discount / deposit / exempt flow", () => {
    expect(find(doc((d) => (d.totals.afterDisc = 59000)), "chain")?.ok).toBe(false);
  });

  it("allows VAT to be off by max(1 baht, 0.2%)", () => {
    expect(find(doc((d) => (d.totals.vat = 4320)), "vat")?.ok).toBe(true); // 0.2% of 60,000 = 120
    expect(find(doc((d) => (d.totals.vat = 4321)), "vat")?.ok).toBe(false);
    const small = doc((d) => {
      d.totals.taxable = 100;
      d.totals.vat = 8; // 7.00 expected, 1 baht floor
    });
    expect(find(small, "vat")?.ok).toBe(true);
  });

  it("checks the net amount", () => {
    expect(find(doc((d) => (d.totals.net = 64300)), "net")?.ok).toBe(false);
  });

  it("compares printed words ignoring spaces and brackets", () => {
    expect(find(doc((d) => (d.wordsPrinted = "(หกหมื่นสี่พัน สองร้อยบาทถ้วน)")), "words")?.ok).toBe(true);
    expect(find(doc((d) => (d.wordsPrinted = "หกหมื่นสี่พันบาทถ้วน")), "words")?.ok).toBe(false);
  });
});

describe("dates, unclear, duplicates, confidence", () => {
  it("checks the due date", () => {
    expect(find(doc((d) => (d.dueDate = "2026-10-09")), "due")?.ok).toBe(false);
  });

  it("flags a missing date", () => {
    expect(find(doc((d) => (d.date = "")), "date")?.ok).toBe(false);
  });

  it("passes unclear when nothing is listed", () => {
    expect(find(doc((d) => (d.unclear = [])), "unclear")?.ok).toBe(true);
  });

  it("finds duplicates by seller tax ID + doc number, ignoring itself", () => {
    const d = doc((x) => (x.id = "a"));
    const others = [{ id: "a", docNo: "IV690923-0128", sellerTaxId: "0745538001265" }];
    expect(runChecks(d, { others }).find((c) => c.key === "dup")?.ok).toBe(true);
    others.push({ id: "b", docNo: "IV690923-0128", sellerTaxId: "0745538001265" });
    expect(runChecks(d, { others }).find((c) => c.key === "dup")?.ok).toBe(false);
  });

  it("warns on low confidence", () => {
    const d = doc((x) => {
      x.confidence = "low";
      x.unclear = [];
    });
    expect(flagsFor(d, { companyTaxId: COMPANY })).toEqual(["conf"]);
  });
});
