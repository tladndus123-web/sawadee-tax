import { describe, expect, it } from "vitest";
import { normalizeTotals } from "./normalize";
import { amountToPay } from "./wht";

describe("amountToPay", () => {
  it("is the bill when nothing is withheld", () => {
    expect(amountToPay({ whtRate: 0, totals: normalizeTotals({ taxable: 1000, vat: 70 }) })).toBe(1070);
  });

  it("takes the withholding off: 3 % of the price before VAT", () => {
    // 10,000 + 700 VAT − 300 withheld
    expect(amountToPay({ whtRate: 3, totals: normalizeTotals({ taxable: 10000, vat: 700 }) })).toBe(10400);
  });

  it("uses the withholding printed on the document", () => {
    expect(amountToPay({ whtRate: 0, totals: normalizeTotals({ taxable: 5000, vat: 350, wht: 50 }) })).toBe(5300);
  });
});
