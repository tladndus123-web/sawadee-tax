import { describe, expect, it } from "vitest";
import { findRecurring, nextDay } from "./recurring";

const T = "2026-10-28";
const rent = ["2026-06-01", "2026-07-01", "2026-08-02", "2026-09-01", "2026-10-01"].map((date) => ({ seller: "SUKHUMVIT PROPERTY CO., LTD.", taxId: "0105555000001", date, net: 45000, category: "rent" as const }));

describe("repeating payments", () => {
  it("finds the same supplier, same part of the month, about the same amount", () => {
    const out = findRecurring({ docs: rent }, T);
    expect(out).toEqual([
      { key: "ledger:0105555000001", title: "SUKHUMVIT PROPERTY CO., LTD.", day: 1, amount: 4500000, months: 5, next: "2026-11-01", category: "rent", from: "ledger" },
    ]);
  });

  it("leaves out irregular ones, what is already in the calendar and what was turned down", () => {
    const odd = [
      { seller: "MAKRO", date: "2026-07-03", net: 1200 },
      { seller: "MAKRO", date: "2026-08-19", net: 5400 },
      { seller: "MAKRO", date: "2026-09-27", net: 800 },
    ];
    expect(findRecurring({ docs: odd }, T)).toEqual([]);
    expect(findRecurring({ docs: rent, events: ["Sukhumvit Property rent"] }, T)).toEqual([]);
    expect(findRecurring({ docs: rent, dismissed: ["ledger:0105555000001"] }, T)).toEqual([]);
    expect(findRecurring({ docs: rent.slice(0, 2) }, T)).toEqual([]);
  });

  it("knows the next such day, short months included", () => {
    expect(nextDay(31, "2026-11-10")).toBe("2026-11-30");
    expect(nextDay(5, "2026-10-28")).toBe("2026-11-05");
  });
});
