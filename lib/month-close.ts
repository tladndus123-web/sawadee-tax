// Month-end closing checklist (dashboard): the month to close next and what is still open in it — documents to
// look at, days of shop sales missing, and staff whose pay the office has not checked. Closing itself is the
// existing month lock (lib/month-lock-store); open items only warn, they don't stop it (owner's choice).

import { monthKey } from "./archive";
import type { Branch } from "./branches";
import { needsCheck } from "./dashboard";
import { employedInMonth, type Employee } from "./payroll";
import { missingDays, saleDays } from "./sale-days";
import { type Sale, saleMonth } from "./sales";
import type { LedgerDoc } from "./types";

/** The oldest month before this one that has books (documents or sales) and is not closed yet */
export function monthToClose(docMonths: string[], sales: Sale[], locked: ReadonlySet<string>, thisMonth: string): string | null {
  const months = new Set([...docMonths, ...sales.map(saleMonth)]);
  return [...months].filter((m) => /^\d{4}-\d{2}$/.test(m) && m < thisMonth && !locked.has(m)).sort()[0] ?? null;
}

export interface CloseEntry {
  id: string;
  doc: LedgerDoc;
  status: string;
  checkedAt: number | null;
  ackFlags: readonly string[];
}

export interface CloseTodo {
  /** Drafts, saved documents the office has not checked, and ones with an open warning */
  docs: number;
  /** Days of shop sales missing, over every branch */
  missingDays: number;
  /** Staff on the payroll that month whose pay is not checked; null when there is nobody on the payroll */
  payroll: { staff: number; left: number } | null;
}

export function closeTodo(opts: {
  month: string;
  entries: readonly CloseEntry[];
  companyTaxId: string;
  today: string;
  sales: Sale[];
  branches: readonly Branch[];
  employees: readonly Pick<Employee, "id" | "startDate" | "endDate">[];
  /** Employee ids whose pay was checked for the month */
  payChecked: ReadonlySet<string>;
}): CloseTodo {
  const { month, entries, companyTaxId, today } = opts;
  const inMonth = entries.filter((e) => monthKey(e.doc) === month);
  // Checked against the whole ledger (a duplicate may sit in another month)
  const warned = needsCheck(
    entries.filter((e) => e.status !== "draft").map((e) => ({ id: e.id, doc: e.doc, ack: e.ackFlags })),
    companyTaxId,
    today,
  );
  const docs = inMonth.filter((e) => e.status === "draft" || e.checkedAt === null || warned.has(e.id)).length;
  const missing = opts.branches.reduce((n, b) => n + missingDays(saleDays(opts.sales, b.id, month, today, b.closedDays)).length, 0);
  const staff = opts.employees.filter((e) => employedInMonth(e, month));
  return {
    docs,
    missingDays: missing,
    payroll: staff.length ? { staff: staff.length, left: staff.filter((e) => !opts.payChecked.has(e.id)).length } : null,
  };
}

/** How many of the three are still open */
export const openCount = (t: CloseTodo) => Number(t.docs > 0) + Number(t.missingDays > 0) + Number(!!t.payroll?.left);
