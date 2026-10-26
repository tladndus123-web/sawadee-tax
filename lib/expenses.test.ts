import { describe, expect, it } from "vitest";
import { monthExpenses, type Claim, claimDoc, claimProblems, claimSummary, DEFAULT_EXPENSE_CATEGORIES, docAmount, owed, readExpenseSettings } from "./expenses";
import { normalize } from "./normalize";

const claim = (over: Partial<Claim>): Claim => ({
  id: "c",
  userId: "u1",
  name: "Somchai",
  day: "2026-10-26",
  seller: "7-Eleven",
  amount: 35000,
  category: "supplies",
  note: "",
  photoPath: null,
  photoHash: null,
  doc: null,
  status: "pending",
  reason: "",
  decidedAt: null,
  paidOn: null,
  paidHow: null,
  documentId: null,
  createdAt: "2026-10-26T02:00:00Z",
  ...over,
});

describe("expense settings", () => {
  it("starts with the usual categories, a photo, LINE on and no self-approval", () => {
    expect(readExpenseSettings(undefined)).toEqual({ categories: DEFAULT_EXPENSE_CATEGORIES, autoUnder: 0, photo: true, line: true });
  });
  it("keeps the company's choices and drops what is not a category", () => {
    expect(readExpenseSettings({ categories: ["fuel", "nope", "fuel", "c_abcd"], autoUnder: 300.4, photo: false, line: false })).toEqual({
      categories: ["fuel", "c_abcd"],
      autoUnder: 300,
      photo: false,
      line: false,
    });
  });
});

describe("a claim", () => {
  it("needs a day, an amount and, when asked, a photo", () => {
    expect(claimProblems(claim({ amount: 0, day: "" }), { photo: true })).toEqual(["day", "amount", "photo"]);
    expect(claimProblems(claim({}), { photo: true }, true)).toEqual([]);
    expect(claimProblems(claim({}), { photo: false })).toEqual([]);
  });

  it("adds up what is owed per person and the month", () => {
    const list = [
      claim({ id: "a", status: "approved", amount: 35000 }),
      claim({ id: "b", status: "approved", amount: 89000 }),
      claim({ id: "c", userId: "u2", name: "Nida", status: "approved", amount: 118000 }),
      claim({ id: "d", status: "pending" }),
      claim({ id: "e", status: "paid", paidOn: "2026-10-20", amount: 10000 }),
      claim({ id: "f", status: "rejected", day: "2026-09-30" }),
    ];
    expect(owed(list)).toEqual([
      { userId: "u1", name: "Somchai", amount: 124000, ids: ["a", "b"] },
      { userId: "u2", name: "Nida", amount: 118000, ids: ["c"] },
    ]);
    expect(claimSummary(list, "2026-10")).toEqual({ pending: 1, owed: 242000, paid: 10000, count: 5 });
  });

  it("becomes a paid receipt in the ledger, or keeps the AI reading with its VAT", () => {
    const plain = claimDoc(claim({ note: "dish soap" }), "2026-10-27", "cash");
    expect(plain).toMatchObject({ docType: "receipt", date: "2026-10-26", category: "supplies", paid: true, paidDate: "2026-10-27", payment: "cash", memo: "Somchai · dish soap" });
    expect(plain.seller.name.th).toBe("7-Eleven");
    expect(plain.totals.net).toBe(350);
    const read = normalize({ docType: "abbr", seller: { name: { en: "MAKRO" } }, totals: { net: 1180, vat: 77.2, taxable: 1102.8 }, category: "food" });
    const fromAi = claimDoc(claim({ doc: read, category: "consumables", amount: 118000 }), "2026-10-28", "transfer");
    expect(fromAi).toMatchObject({ docType: "abbr", category: "consumables", paid: true, payment: "transfer" });
    expect(fromAi.totals.vat).toBe(77.2);
    expect(docAmount(read)).toBe(118000);
  });
});

describe("the month's expenses", () => {
  it("adds up approved and paid claims by person and category, with last month", () => {
    const list = [
      claim({ id: "a", status: "paid", amount: 35000, category: "supplies" }),
      claim({ id: "b", status: "approved", amount: 118000, name: "Nida", userId: "u2", category: "food" }),
      claim({ id: "c", status: "pending", amount: 999900 }),
      claim({ id: "d", status: "rejected", amount: 999900 }),
      claim({ id: "e", status: "paid", amount: 20000, day: "2026-09-30" }),
    ];
    expect(monthExpenses(list, "2026-10")).toEqual({
      total: 153000,
      count: 2,
      prevTotal: 20000,
      people: [{ name: "Nida", amount: 118000 }, { name: "Somchai", amount: 35000 }],
      categories: [{ category: "food", amount: 118000 }, { category: "supplies", amount: 35000 }],
    });
  });
});
