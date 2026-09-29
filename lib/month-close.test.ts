import { describe, expect, it } from "vitest";
import { openWarnings } from "./dashboard";
import { closeTodo, type CloseEntry, monthToClose, openCount } from "./month-close";
import { normalize } from "./normalize";
import type { Sale } from "./sales";

const CO = "0105557035035";
const HEAD = { id: "head", no: "00000", name: "", sort: 0, color: "", closedDays: [1] };
const sale = (date: string): Sale =>
  ({ id: date, branchId: "head", date, channel: "store", docFrom: "", docTo: "", bills: 0, gross: 1000, vat: 0, exempt: 0, note: "", photoPath: "", source: "manual" }) as Sale;
const entry = (id: string, date: string, p: Partial<CloseEntry> = {}): CloseEntry => ({
  id,
  doc: normalize({ date, docNo: id, seller: { taxId: "0105551234567" } }),
  status: "reviewed",
  checkedAt: 1,
  ackFlags: [],
  ...p,
});
// Accept whatever the automatic checks say about a document, so only the rule under test counts
const quiet = (e: CloseEntry): CloseEntry => ({ ...e, ackFlags: openWarnings([{ id: e.id, doc: e.doc }], CO, "2026-10-05").get(e.id) ?? [] });

describe("the month to close next", () => {
  it("is the oldest month before this one with books, not closed", () => {
    expect(monthToClose(["2026-08", "2026-09", "2026-10"], [sale("2026-07-03")], new Set(["2026-07"]), "2026-10")).toBe("2026-08");
    expect(monthToClose(["2026-08", "none"], [], new Set(["2026-08"]), "2026-10")).toBeNull();
    expect(monthToClose(["2026-10"], [], new Set(), "2026-10")).toBeNull();
  });
});

describe("what is still open in the month", () => {
  const base = { month: "2026-09", companyTaxId: CO, today: "2026-10-05", branches: [HEAD], employees: [], payChecked: new Set<string>() };

  it("documents: drafts, not checked by the office, and open warnings — other months don't count", () => {
    const entries = [
      quiet(entry("a", "2026-09-02")),
      quiet(entry("b", "2026-09-03", { status: "draft" })),
      quiet(entry("c", "2026-09-04", { checkedAt: null })),
      quiet(entry("d", "2026-08-30", { checkedAt: null })),
    ];
    expect(closeTodo({ ...base, entries, sales: [] }).docs).toBe(2);
    const warned = { ...entry("e", "2026-09-05"), ackFlags: [] };
    const hasWarning = (openWarnings([{ id: "e", doc: warned.doc }], CO, "2026-10-05").get("e") ?? []).length > 0;
    expect(closeTodo({ ...base, entries: [warned], sales: [] }).docs).toBe(hasWarning ? 1 : 0);
  });

  it("missing shop sales days, closing weekdays left out (Mondays)", () => {
    const sales = Array.from({ length: 30 }, (_, i) => sale(`2026-09-${String(i + 1).padStart(2, "0")}`)).filter((s) => !["2026-09-10", "2026-09-21"].includes(s.date));
    // the 10th is a Thursday (missing), the 21st a Monday (closed)
    expect(closeTodo({ ...base, entries: [], sales }).missingDays).toBe(1);
  });

  it("payroll: staff of that month whose pay is not checked; nobody on the payroll = nothing to do", () => {
    const employees = [
      { id: "x", startDate: "2025-01-01", endDate: "" },
      { id: "y", startDate: "2026-09-20", endDate: "" },
      { id: "z", startDate: "2025-01-01", endDate: "2026-08-31" },
    ];
    const t = closeTodo({ ...base, entries: [], sales: [], employees, payChecked: new Set(["x"]) });
    expect(t.payroll).toEqual({ staff: 2, left: 1 });
    expect(closeTodo({ ...base, entries: [], sales: [] }).payroll).toBeNull();
    expect(openCount(t)).toBe(1);
    expect(openCount({ docs: 0, missingDays: 0, payroll: null })).toBe(0);
  });
});
