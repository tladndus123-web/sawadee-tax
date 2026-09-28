// The LINE reminders' content, shared by the daily cron and the admin's "send a test" button:
// - bills to pay: every saved document not ticked paid (the same rule as the dashboard — lib/archive isUnpaid),
//   overdue or due within 7 days;
// - the VAT return (ภ.พ.30): what is left to check and the input VAT that can be claimed, on its reminder days
//   while the month is open (or always, for a test);
// - payroll filings (ภ.ง.ด.1, สปส.1-10): withholding and social security of last month's saved payroll, likewise;
// - employee documents (work permit, visa …) that expire within 30 days.

import { monthKey } from "./archive";
import { type DocumentRow, type ItemRow, rowToDoc } from "./db-map";
import { summarize, upcoming, vatFiling } from "./dashboard";
import { documentReminder, dueReminder, payrollReminder, vatReminder } from "./line";
import { appUrl } from "./line-bot";
import { serverCategories } from "./categories-server";
import { expiringDocuments, parseDocuments } from "./attendance";
import { payrollFiling } from "./payroll";
import type { supabaseAdmin } from "./supabase/admin";

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = DocumentRow & { document_items: ItemRow[]; ack_flags?: string[] | null };

export async function reminderTexts(admin: Admin, today: string, opts: { test?: boolean } = {}): Promise<string[]> {
  const f = vatFiling(today);
  // Which categories' VAT is not claimable (settings) — the claimable VAT in the message depends on it
  await serverCategories();
  const [docs, lock, settings] = await Promise.all([
    admin.from("documents").select("*, document_items(*)").is("deleted_at", null),
    admin.from("month_locks").select("month").eq("month", f.month).maybeSingle(),
    admin.from("company_settings").select("tax_id").eq("id", 1).maybeSingle(),
  ]);
  if (docs.error || lock.error || settings.error) throw docs.error ?? lock.error ?? settings.error;

  const rows = (docs.data ?? []) as Row[];
  const toDoc = (r: Row) => ({ id: r.id, doc: rowToDoc(r, r.document_items ?? []), ack: r.ack_flags ?? [] });
  const saved = rows.filter((r) => r.status === "reviewed").map(toDoc);
  const url = `${appUrl()}/`;

  const due = dueReminder(upcoming(saved, today), url);

  let vat: string | null = null;
  if (!lock.data || opts.test) {
    const s = summarize(saved, f.month, settings.data?.tax_id ?? "", today);
    const drafts = rows.filter((r) => r.status === "draft").map(toDoc).filter((d) => monthKey(d.doc) === f.month).length;
    vat = vatReminder(
      { month: f.month, due: f.onlineOnly ? f.dueOnline : f.due, daysLeft: f.daysLeft, toCheck: s.toCheck, drafts, claimableVat: s.claimableVat },
      url,
      { force: opts.test },
    );
  }
  // Payroll filings: only for a month that has payroll saved, and only while it is open
  let pay: string | null = null;
  const pf = payrollFiling(today);
  const [lines, payLock] = await Promise.all([
    admin.from("payroll_lines").select("wht, ss_employee, ss_employer").eq("month", pf.month),
    admin.from("month_locks").select("month").eq("month", pf.month).maybeSingle(),
  ]);
  if (!lines.error && lines.data?.length && (!payLock.data || opts.test)) {
    const sum = (k: "wht" | "ss_employee" | "ss_employer") => lines.data.reduce((a, r) => a + Math.round(Number(r[k]) * 100), 0) / 100;
    pay = payrollReminder({ ...pf, wht: sum("wht"), ss: sum("ss_employee") + sum("ss_employer") }, `${url}payroll`, { force: opts.test });
  }
  // Employee documents (work permit, visa …) running out: 30 / 7 / 1 / 0 days before, and every day once expired
  const { data: staff } = await admin.from("employees").select("id, name, nickname, end_date, documents");
  const expiring = expiringDocuments(
    (staff ?? []).map((e) => ({ id: e.id as string, name: e.name as string, nickname: (e.nickname as string) ?? "", endDate: (e.end_date as string | null) ?? "", documents: parseDocuments(e.documents) })),
    today,
  );
  const docTexts = documentReminder(
    expiring.map((x) => ({ name: x.employee.name, doc: x.doc.name, daysLeft: x.daysLeft })),
    `${url}payroll`,
    { force: opts.test },
  );
  return [due, vat, pay, docTexts].filter((x): x is string => !!x);
}
