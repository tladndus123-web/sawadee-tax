import { describe, expect, it } from "vitest";
import { calendarItems, daysTo, occurrences } from "./company-calendar";

describe("calendarItems", () => {
  it("lists the tax deadlines of a VAT-registered company with staff, moved to working days", () => {
    const items = calendarItems({ from: "2026-11-01", to: "2026-11-30", vatRegistered: true, payroll: true });
    expect(items.map((i) => [i.kind, i.date, i.period])).toEqual([
      ["vat", "2026-11-16", "2026-10"], // the 15th is a Sunday
      ["monthly", "2026-11-16", "2026-10"],
    ]);
    expect(items[0].online).toBe("2026-11-23");
  });

  it("leaves out VAT for a company that is not registered, and payroll filings without staff", () => {
    expect(calendarItems({ from: "2026-11-01", to: "2026-11-30", vatRegistered: false, payroll: false })).toEqual([]);
  });

  it("has the yearly filings: staff papers in February, corporate tax in May and August", () => {
    const kinds = calendarItems({ from: "2027-01-01", to: "2027-12-31", vatRegistered: false, payroll: true })
      .filter((i) => !["monthly"].includes(i.kind))
      .map((i) => `${i.kind}:${i.period}:${i.date}`);
    expect(kinds).toEqual(["cert50:2026:2027-02-15", "pnd1a:2026:2027-03-01", "pnd50:2026:2027-05-31", "pnd51:2027:2027-08-31"]);
  });

  it("ticks the VAT return of a closed month, and anything ticked off", () => {
    const items = calendarItems({ from: "2026-11-01", to: "2026-12-31", vatRegistered: true, payroll: true, locked: new Set(["2026-10"]), done: new Set(["monthly:2026-11"]) });
    const get = (k: string) => items.find((i) => i.key === k)!;
    expect(get("vat:2026-10").done).toBe(true);
    expect(get("vat:2026-11").done).toBe(false);
    expect(get("monthly:2026-11").done).toBe(true);
  });

  it("adds staff papers, bills and company dates", () => {
    const items = calendarItems({
      from: "2026-11-01",
      to: "2026-11-30",
      vatRegistered: false,
      payroll: false,
      employees: [
        { id: "e1", name: "Somchai", documents: [{ name: "Work permit", expires: "2026-11-20" }] },
        { id: "e2", name: "Gone", endDate: "2026-09-30", documents: [{ name: "Visa", expires: "2026-11-21" }] },
      ],
      bills: [{ id: "d1", seller: "MALI", dueDate: "2026-11-05", net: 31190.5 }],
      events: [{ id: "v1", title: "Lease", date: "2025-11-30", repeat: "yearly", remindDays: 30, note: "" }],
    });
    expect(items.map((i) => `${i.kind}:${i.date}:${i.title}`)).toEqual(["bill:2026-11-05:MALI", "doc:2026-11-20:Work permit", "event:2026-11-30:Lease"]);
  });
});

describe("occurrences", () => {
  it("repeats monthly on the same day (or the month's last) and yearly", () => {
    expect(occurrences({ date: "2026-01-31", repeat: "monthly" }, "2026-02-01", "2026-04-30")).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(occurrences({ date: "2024-06-10", repeat: "yearly" }, "2026-01-01", "2027-12-31")).toEqual(["2026-06-10", "2027-06-10"]);
    expect(occurrences({ date: "2026-06-10", repeat: "none" }, "2026-07-01", "2026-07-31")).toEqual([]);
    expect(daysTo("2026-10-28", "2026-11-01")).toBe(4);
  });
});
