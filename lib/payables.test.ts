import { describe, expect, it } from "vitest";
import { bucketOf, bucketTotals, bySupplier, unpaidBills } from "./payables";
import type { LedgerDoc } from "./types";

const doc = (o: { net: number; wht?: number; due?: string; paid?: boolean; tax?: string; name?: string; date?: string }) =>
  ({ totals: { net: o.net, wht: o.wht ?? 0 }, dueDate: o.due ?? "", paid: !!o.paid, date: o.date ?? "2026-11-01", seller: { taxId: o.tax ?? "", name: { th: o.name ?? "", en: o.name ?? "", ja: "" } } }) as unknown as LedgerDoc;

describe("bills to pay", () => {
  it("buckets by days to the due date", () => {
    expect(bucketOf(null)).toBe("none");
    expect(bucketOf(-1)).toBe("late");
    expect(bucketOf(0)).toBe("week");
    expect(bucketOf(7)).toBe("week");
    expect(bucketOf(8)).toBe("month");
    expect(bucketOf(31)).toBe("later");
  });
  it("lists unpaid bills, net of withholding, soonest first, no due date last", () => {
    const bills = unpaidBills(
      [
        { id: "a", doc: doc({ net: 1070, wht: 30, due: "2026-11-25" }) },
        { id: "b", doc: doc({ net: 500, due: "2026-11-10" }) },
        { id: "c", doc: doc({ net: 999, paid: true, due: "2026-11-01" }) },
        { id: "d", doc: doc({ net: 200 }) },
      ],
      "2026-11-18",
    );
    expect(bills.map((b) => b.id)).toEqual(["b", "a", "d"]);
    expect(bills[1].amount).toBe(104000);
    expect(bills[0].bucket).toBe("late");
    expect(bucketTotals(bills).late).toEqual({ amount: 50000, count: 1 });
  });
  it("groups per supplier, late money first", () => {
    const bills = unpaidBills(
      [
        { id: "a", doc: doc({ net: 100, due: "2026-11-30", tax: "0105555000001", name: "Makro" }) },
        { id: "b", doc: doc({ net: 50, due: "2026-11-01", tax: "0105555000002", name: "Fresh" }) },
        { id: "c", doc: doc({ net: 100, due: "2026-12-30", tax: "0105555000001", name: "Makro" }) },
      ],
      "2026-11-18",
    );
    const g = bySupplier(bills);
    expect(g.map((x) => x.key)).toEqual(["0105555000002", "0105555000001"]);
    expect(g[1].amount).toBe(20000);
  });
});
