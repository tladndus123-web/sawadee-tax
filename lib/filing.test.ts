import { describe, expect, it } from "vitest";
import { buildPp30, buildWhtFiling, filingDeadlines, filingMonth, totalToPay } from "./filing";
import type { Sale } from "./sales";
import { sampleDoc } from "./sample";
import type { LedgerDoc } from "./types";

const CO = "0105557035035";
const sale = (date: string, gross: number, vat: number, exempt = 0): Sale => ({
  id: `${date}-${gross}`, branchId: "", date, channel: "store", docFrom: "", docTo: "", bills: 0, gross, vat, exempt, note: "", photoPath: null, source: "manual",
});
const doc = (patch: (x: LedgerDoc) => void) => {
  const d = sampleDoc();
  d.customer.taxId = CO;
  patch(d);
  return d;
};

describe("ภ.พ.30 boxes", () => {
  // the sample purchase: 60,000 + VAT 4,200, a full tax invoice — claimable when addressed to us
  it("sales, purchases and the VAT to pay", () => {
    const { pp30, from } = buildPp30(
      [sale("2026-10-01", 107000, 7000), sale("2026-10-01", 53500, 3500), sale("2026-10-02", 21400, 1400), sale("2026-11-01", 999, 0)],
      [doc((x) => (x.date = "2026-10-05")), doc((x) => (x.date = "2026-09-30"))],
      "2026-10",
      CO,
    );
    expect(pp30).toEqual({ sales: 170000, zeroRated: 0, exempt: 0, taxable: 170000, outputVat: 11900, purchases: 60000, inputVat: 4200, toPay: 7700, overpaid: 0 });
    expect(from).toMatchObject({ saleDays: 2, saleSlips: 3, claimDocs: 1, otherDocs: 0, vatOff: false });
  });

  it("exempt sales leave box 4; more input tax than output = overpaid", () => {
    const { pp30 } = buildPp30([sale("2026-10-03", 10000, 0, 10000)], [doc((x) => (x.date = "2026-10-05"))], "2026-10", CO);
    expect(pp30).toMatchObject({ sales: 10000, exempt: 10000, taxable: 0, outputVat: 0, inputVat: 4200, toPay: 0, overpaid: 4200 });
  });

  it("purchases count in their claim month; ones that cannot be claimed stay out with their VAT shown", () => {
    const late = doc((x) => ((x.date = "2026-09-20"), (x.taxMonth = "2026-10")));
    const notOurs = doc((x) => ((x.date = "2026-10-06"), (x.customer.taxId = "")));
    const { pp30, from } = buildPp30([], [late, notOurs], "2026-10", CO);
    expect(pp30.inputVat).toBe(4200);
    expect(from).toMatchObject({ claimDocs: 1, otherDocs: 1, otherVat: 4200 });
  });

  it("flags closing reports whose VAT is not 7 % of the sales", () => {
    expect(buildPp30([sale("2026-10-01", 10700, 300)], [], "2026-10", CO).from.vatOff).toBe(true);
  });
});

describe("withholding returns", () => {
  const paid = (id: string, taxId: string, taxable: number, paidDate = "2026-10-10") => ({
    id,
    doc: doc((x) => {
      x.date = "2026-10-01";
      x.seller.taxId = taxId;
      x.totals.taxable = taxable;
      x.totals.exempt = 0;
      x.totals.wht = 0;
      x.whtRate = 3;
      x.paid = true;
      x.paidDate = paidDate;
    }),
  });

  it("splits by form, finds bad tax IDs and unpaid ones", () => {
    const unpaid = { id: "u", doc: doc((x) => ((x.date = "2026-10-03"), (x.whtRate = 3), (x.paid = false), (x.paidDate = ""))) };
    const w = buildWhtFiling([paid("a", "0105557035035", 10000), paid("b", "1234", 5000), paid("c", "0105557035035", 1000, "2026-11-01"), unpaid], "2026-10");
    expect(w.totals.pnd53).toEqual({ paid: 10000, tax: 300 });
    expect(w.totals.pnd3).toEqual({ paid: 5000, tax: 150 });
    expect(w.badIds).toEqual(["b"]);
    expect(w.unpaid).toBe(1);
    const { pp30 } = buildPp30([sale("2026-10-01", 10700, 700)], [], "2026-10", CO);
    expect(totalToPay(pp30, w)).toBe(1150);
  });
});

describe("deadlines and which month", () => {
  it("VAT the 15th / 23rd, withholding the 7th / 15th, moved off weekends", () => {
    // 2026-11-07 is a Saturday, 2026-11-15 a Sunday
    expect(filingDeadlines("2026-10")).toEqual({ vat: { due: "2026-11-16", online: "2026-11-23" }, wht: { due: "2026-11-09", online: "2026-11-16" } });
  });
  it("last month until its e-filing date, then this month", () => {
    expect(filingMonth("2026-11-08")).toBe("2026-10");
    expect(filingMonth("2026-11-24")).toBe("2026-11");
  });
});
