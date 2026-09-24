// Fixes for the external review (docs/review-findings/REVIEW-FINDINGS.md). Each block names its finding.
import { describe, expect, it } from "vitest";
import sample from "@/docs/reference/sample-document.json";
import { bahtText } from "./baht-text";
import { claimable, runChecks } from "./checks";
import { docSchema } from "./doc-schema";
import { normalize } from "./normalize";
import { sampleDoc } from "./sample";
import { fixDate, isIsoDate } from "./thai-tax";
import type { LedgerDoc } from "./types";

const COMPANY = "0105557035035";
const doc = (patch: (d: LedgerDoc) => void = () => {}) => {
  const d = sampleDoc();
  patch(d);
  return d;
};
const check = (d: LedgerDoc, key: string) => runChecks(d, { companyTaxId: COMPANY, today: "2026-09-25" }).find((c) => c.key === key);

describe("#2 a written 0 is a number, not 'missing'", () => {
  it("checks the line when the unit price is 0", () => {
    expect(check(doc((d) => (d.items[0].price = 0)), "items")?.ok).toBe(false);
  });
  it("still skips lines that only print an amount", () => {
    const d = doc((d) => {
      d.items[0].qty = 0;
      d.items[0].price = 0;
    });
    expect(check(d, "items")?.ok).toBe(true);
  });
  it("compares the item sum with a total of 0", () => {
    expect(check(doc((d) => (d.totals.total = 0)), "items")?.ok).toBe(false);
  });
  it("always runs the totals checks", () => {
    const d = doc((d) => {
      d.totals.net = 0;
      d.wordsPrinted = "";
    });
    expect(check(d, "net")?.ok).toBe(false);
    expect(check(doc((d) => (d.totals.total = 0)), "chain")?.ok).toBe(false);
    expect(check(doc((d) => (d.totals.vat = 0)), "vat")?.ok).toBe(false);
  });
});

describe("#3 dates must exist on the calendar", () => {
  it("rejects impossible dates", () => {
    expect(isIsoDate("2026-13-23")).toBe(false);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(fixDate("2569-02-30")).toEqual(["", false]);
    expect(fixDate("2569-9-23")).toEqual(["2026-09-23", true]);
  });
  it("flags an impossible date instead of crashing", () => {
    const d = doc((d) => (d.date = "2026-13-23"));
    expect(() => runChecks(d)).not.toThrow();
    expect(check(d, "date")?.ok).toBe(false);
    expect(check(doc((d) => { d.date = "2026-02-30"; d.creditDays = 0; }), "date")?.ok).toBe(false);
  });
  it("does not let the form save an impossible date", () => {
    expect(docSchema.safeParse(doc((d) => (d.date = "2026-02-30"))).success).toBe(false);
    expect(docSchema.safeParse(doc()).success).toBe(true);
  });
});

describe("#4 the printed Thai words are the one source for the Thai line", () => {
  it("shows the corrected printed words", () => {
    const d = doc((d) => {
      d.totals.net = 21;
      d.wordsPrinted = bahtText(21);
    });
    const n = normalize(d);
    expect(n.words.th).toBe(bahtText(21));
    expect(n.words.en).toBe("฿ 21.00");
  });
  it("falls back to generated words when nothing was printed", () => {
    expect(normalize({ ...sample, wordsPrinted: "" }).words.th).toBe(bahtText(64200));
  });
});

describe("#5 quantities keep their precision", () => {
  it("keeps 1.234 and checks 1.234 × 1000 = 1234", () => {
    const n = normalize({ ...sample, items: [{ ...sample.items[0], qty: 1.234, price: 1000, amount: 1234 }], totals: { ...sample.totals, total: 1234, afterDisc: 1234, afterDep: 1234, taxable: 1234, vat: 86.38, net: 1320.38 } });
    expect(n.items[0].qty).toBe(1.234);
    expect(check(n, "items")?.ok).toBe(true);
  });
  it("does not turn a tiny or missing quantity into 1", () => {
    expect(normalize({ ...sample, items: [{ ...sample.items[0], qty: 0.004 }] }).items[0].qty).toBe(0.004);
    expect(normalize({ ...sample, items: [{ amount: 50 }] }).items[0].qty).toBe(0);
  });
});

describe("#6 tax IDs are never cut to 13 digits", () => {
  it("keeps the extra digit and fails the check", () => {
    const n = normalize({ ...sample, seller: { ...sample.seller, taxId: "07455380012659" } });
    expect(n.seller.taxId).toBe("07455380012659");
    expect(check(n, "sellerTax")?.ok).toBe(false);
    expect(docSchema.safeParse(n).success).toBe(true);
  });
});

describe("#8 claimable only when the buyer is our company", () => {
  it("needs our company tax ID", () => {
    expect(claimable(doc(), "")).toBe(false);
    expect(claimable(doc(), "123")).toBe(false);
    expect(claimable(doc(), COMPANY, "2026-09-25")).toBe(true);
  });
});

describe("#9 VAT tolerance is max(1 baht, 0.2% of taxable), not rounded up", () => {
  it("fails 1.01 over on 502.50 taxable (limit 1.005)", () => {
    expect(check(doc((d) => { d.totals.taxable = 502.5; d.totals.vat = 36.19; }), "vat")?.ok).toBe(false);
  });
  it("passes exactly at the 1 baht floor and at 0.2%", () => {
    expect(check(doc((d) => { d.totals.taxable = 502.5; d.totals.vat = 36.18; }), "vat")?.ok).toBe(true);
    // 0.2% of 100,000 = 200 baht
    expect(check(doc((d) => { d.totals.taxable = 100000; d.totals.vat = 7200; }), "vat")?.ok).toBe(true);
    expect(check(doc((d) => { d.totals.taxable = 100000; d.totals.vat = 7200.01; }), "vat")?.ok).toBe(false);
  });
});
