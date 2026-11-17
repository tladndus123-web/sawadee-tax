import { describe, expect, it } from "vitest";
import { numbersOk, sheetNumbers } from "./ai-sheet";
import { cleanPayAdvice, cleanPaySheet } from "./pay-advice";
import { cleanTaxCheck, cleanTaxSheet } from "./tax-check";

describe("AI answers only with the sheet's numbers", () => {
  it("collects the sheet's numbers in every usual spelling", () => {
    const s = sheetNumbers({ a: 1234.5, b: [-20], c: "due 2026-11-23" });
    expect(numbersOk("pay ฿1,234.50 and 20 now, by 2026-11-23", s)).toBe(true);
    expect(numbersOk("pay ฿1,300", s)).toBe(false);
  });
});

describe("tax check", () => {
  const sheet = cleanTaxSheet({
    month: "2026-10",
    today: "2026-11-18",
    vat: { output: 12000, input: 3000, toPay: 9000, credit: 0, carriedIn: 0 },
    vatBefore: [{ month: "2026-09", toPay: 4500 }],
    wht: { pnd53Count: 2, pnd53Tax: 600, pnd3Count: 0, pnd3Tax: 0, badTaxIds: 1, notMarkedPaid: 0 },
    payroll: { lines: 6, tax: 0, socialSecurity: 4500 },
    documentsToCheck: 3,
    drafts: 0,
    possibleDuplicates: 1,
    deadlines: { vat: "2026-11-23", vatDaysLeft: 5, withholding: "2026-11-16", withholdingDaysLeft: -2 },
    filed: { vat: false, monthly: false },
  })!;
  it("checks the sheet the browser sends", () => {
    expect(sheet.wht.badTaxIds).toBe(1);
    expect(cleanTaxSheet({ month: "bad" })).toBeNull();
  });
  it("keeps a good answer and drops a made-up figure", () => {
    const good = cleanTaxCheck({ summary: "VAT 9000 is double last month's 4500.", checks: [{ level: "red", text: "Fix 1 bad tax ID", link: "filing" }, { level: "x", text: "", link: "?" }] }, sheet);
    expect(good).toEqual({ summary: "VAT 9000 is double last month's 4500.", checks: [{ level: "red", text: "Fix 1 bad tax ID", link: "filing" }] });
    expect(cleanTaxCheck({ summary: "VAT will be 9500", checks: [] }, sheet)).toBeNull();
  });
});

describe("payables advice", () => {
  const sheet = cleanPaySheet({ today: "2026-11-18", totals: { late: 1500 }, bills: [{ supplier: "Makro", amount: 1000, days: -3 }, { supplier: "Fresh", amount: 500, days: 2 }] })!;
  it("numbers the bills and keeps only real picks", () => {
    expect(sheet.bills.map((b) => b.n)).toEqual([1, 2]);
    expect(cleanPayAdvice({ summary: "Pay Makro 1,000 first.", actions: ["Then Fresh 500"], payFirst: [1, 2, 9, 1.5] }, sheet)).toEqual({ summary: "Pay Makro 1,000 first.", actions: ["Then Fresh 500"], payFirst: [1, 2] });
    expect(cleanPayAdvice({ summary: "Pay 7,000", actions: [], payFirst: [] }, sheet)).toBeNull();
  });
});

describe("tax check names its forms", () => {
  it("lets the form numbers through", async () => {
    const { cleanTaxCheck, cleanTaxSheet } = await import("./tax-check");
    const sheet = cleanTaxSheet({ month: "2026-10", vat: { toPay: 100 } })!;
    expect(cleanTaxCheck({ summary: "File ภ.พ.30 and ภ.ง.ด.53/3.", checks: [] }, sheet)?.summary).toBe("File ภ.พ.30 and ภ.ง.ด.53/3.");
  });
});
