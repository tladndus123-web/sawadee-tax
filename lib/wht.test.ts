import { describe, expect, it } from "vitest";
import { sampleDoc } from "./sample";
import type { LedgerDoc } from "./types";
import { buildWhtList, payeeForm, whtAmount, whtMonth, whtRateOf, whtTax } from "./wht";

const d = (patch: (x: LedgerDoc) => void) => {
  const doc = sampleDoc();
  patch(doc);
  return doc;
};

describe("withholding tax", () => {
  it("is taken from the price before VAT, rounded to the satang", () => {
    expect(whtAmount({ taxable: 60000, exempt: 0 }, 3)).toBe(1800);
    expect(whtAmount({ taxable: 1234.56, exempt: 0 }, 3)).toBe(37.04);
    expect(whtAmount({ taxable: 1000, exempt: 500 }, 5)).toBe(75);
  });
  it("uses the printed amount when there is one, else base × rate", () => {
    expect(whtTax(d((x) => ((x.totals.taxable = 10000), (x.totals.exempt = 0), (x.totals.wht = 300))))).toBe(300);
    expect(whtTax(d((x) => ((x.totals.taxable = 10000), (x.totals.exempt = 0), (x.totals.wht = 0), (x.whtRate = 3))))).toBe(300);
    expect(whtRateOf(d((x) => ((x.totals.taxable = 10000), (x.totals.exempt = 0), (x.totals.wht = 300), (x.whtRate = 0))))).toBe(3);
  });
  it("companies go on ภ.ง.ด.53, people on ภ.ง.ด.3", () => {
    expect(payeeForm("0745538001265")).toBe("53");
    expect(payeeForm("3-1006-01234-56-7")).toBe("3");
  });
  it("belongs to the month it was paid in", () => {
    expect(whtMonth({ paid: true, paidDate: "2026-10-02" })).toBe("2026-10");
    expect(whtMonth({ paid: false, paidDate: "" })).toBe("");
  });
  it("lists a month's withholdings by form with totals", () => {
    const paidOct = (id: string, taxId: string, taxable: number) => ({
      id,
      doc: d((x) => {
        x.seller.taxId = taxId;
        x.totals.taxable = taxable;
        x.totals.exempt = 0;
        x.totals.wht = 0;
        x.whtRate = 3;
        x.whtType = "service";
        x.paid = true;
        x.paidDate = "2026-10-05";
      }),
    });
    const list = buildWhtList(
      [paidOct("a", "0745538001265", 10000), paidOct("b", "0105557035035", 5000), paidOct("c", "3100601234567", 2000), { id: "x", doc: d((x) => (x.whtRate = 0)) }],
      "2026-10",
    );
    expect(list.pnd53.map((r) => r.id)).toEqual(["b", "a"]);
    expect(list.totals.pnd53).toEqual({ paid: 15000, tax: 450 });
    expect(list.pnd3.map((r) => r.tax)).toEqual([60]);
  });
});
