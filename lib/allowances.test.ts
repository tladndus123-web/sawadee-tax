import { describe, expect, it } from "vitest";
import { allowanceTotal, customNames, parseAllowances, rowsFromSaved, savedFromRows } from "./allowances";

describe("named allowances", () => {
  it("reads only sane items from the database", () => {
    expect(parseAllowances(null)).toEqual([]);
    expect(
      parseAllowances([
        { key: "meal", name: "ignored", amount: 1000.005 },
        { key: "", name: "  Cleaning  ", amount: 300 },
        { key: "nope", name: "Tips", amount: -5 },
        { key: "", name: "", amount: 50 },
        "junk",
      ]),
    ).toEqual([
      { key: "meal", name: "", amount: 1000.01 },
      { key: "", name: "Cleaning", amount: 300 },
      { key: "", name: "Tips", amount: 0 },
    ]);
  });

  it("joins the two halves by name and keeps an old unnamed total as 'other'", () => {
    const rows = rowsFromSaved(
      { items: [{ key: "meal", name: "", amount: 500 }, { key: "", name: "Cleaning", amount: 200 }], total: 700 },
      { items: [{ key: "meal", name: "", amount: 600 }], total: 600 },
    );
    expect(rows).toEqual([
      { key: "meal", name: "", first: 500, second: 600 },
      { key: "", name: "Cleaning", first: 200, second: 0 },
    ]);
    expect(rowsFromSaved({ items: [], total: 1200 }, { items: [], total: 0 })).toEqual([{ key: "other", name: "", first: 1200, second: 0 }]);
  });

  it("saves each half without zero amounts, and the totals add up in satang", () => {
    const rows = [
      { key: "meal" as const, name: "", first: 0.1, second: 0 },
      { key: "" as const, name: " Cleaning ", first: 0.2, second: 300 },
      { key: "" as const, name: "  ", first: 99, second: 99 },
    ];
    expect(savedFromRows(rows, "first")).toEqual([
      { key: "meal", name: "", amount: 0.1 },
      { key: "", name: "Cleaning", amount: 0.2 },
    ]);
    expect(savedFromRows(rows, "second")).toEqual([{ key: "", name: "Cleaning", amount: 300 }]);
    expect(allowanceTotal(rows, "first")).toBe(0.3);
  });

  it("offers each typed name once", () => {
    expect(
      customNames([
        { key: "", name: "Cleaning", amount: 1 },
        { key: "meal", name: "", amount: 1 },
        { key: "", name: "Cleaning", amount: 2 },
        { key: "", name: "Tips", amount: 1 },
      ]),
    ).toEqual(["Cleaning", "Tips"]);
  });
});
