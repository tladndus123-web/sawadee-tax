import { describe, expect, it } from "vitest";
import { summarize, trend, upcoming } from "./dashboard";
import { sampleDoc } from "./sample";
import type { LedgerDoc } from "./types";

const COMPANY = "0105557035035";
const TODAY = "2026-09-25";
let n = 0;
const d = (patch: (x: LedgerDoc) => void = () => {}) => {
  const doc = sampleDoc();
  patch(doc);
  return { id: `d${++n}`, doc };
};

describe("dashboard summary", () => {
  it("adds up the month, claimable VAT and unpaid credit purchases", () => {
    const docs = [
      d(), // Sept, credit, unpaid, due 08/10, claimable 4,200
      d((x) => ((x.date = "2026-09-01"), (x.totals.net = 0.1), (x.totals.vat = 0), (x.payment = "cash"))),
      d((x) => ((x.date = "2026-08-10"), (x.dueDate = "2026-08-25"))), // August, overdue
    ];
    const s = summarize(docs, "2026-09", COMPANY, TODAY);
    expect(s.count).toBe(2);
    expect(s.total).toBe(64200.1);
    expect(s.claimableVat).toBe(4200);
    // Cash receipts are paid at the till: only the two credit documents are unpaid
    expect(s.unpaidCount).toBe(2);
    expect(s.unpaid).toBe(128400);
    expect(s.overdueCount).toBe(1);
  });

  it("counts documents with a failing check, ignoring the unclear-fields notice", () => {
    const s = summarize([d(), d((x) => (x.totals.vat = 1))], "2026-09", COMPANY, TODAY);
    expect(s.toCheck).toBe(1);
  });
});

describe("upcoming payments", () => {
  it("puts overdue first, then this week, then later, then no due date", () => {
    const list = upcoming(
      [
        d((x) => ((x.docNo = "later"), (x.dueDate = "2026-10-20"))),
        d((x) => ((x.docNo = "none"), (x.dueDate = ""))),
        d((x) => ((x.docNo = "overdue"), (x.dueDate = "2026-09-20"))),
        d((x) => ((x.docNo = "soon"), (x.dueDate = "2026-09-30"))),
        d((x) => ((x.docNo = "paid"), (x.paid = true))),
      ],
      TODAY,
    );
    expect(list.map((i) => [i.doc.docNo, i.state, i.days])).toEqual([
      ["overdue", "overdue", -5],
      ["soon", "soon", 5],
      ["later", "later", 25],
      ["none", "none", null],
    ]);
  });
});

describe("6-month trend", () => {
  it("covers the months up to the chosen one, across a year boundary, with empty months as 0", () => {
    const t = trend([d((x) => (x.date = "2026-01-15")), d((x) => (x.date = "2025-11-02")), d((x) => (x.date = "2025-05-01"))], "2026-02");
    expect(t.map((p) => p.month)).toEqual(["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(t.map((p) => p.count)).toEqual([0, 0, 1, 0, 1, 0]);
    expect(t[4].net).toBe(64200);
  });
});
