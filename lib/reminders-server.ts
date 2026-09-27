// The LINE reminders' content, shared by the daily cron and the admin's "send a test" button:
// - bills to pay: every saved document not ticked paid (the same rule as the dashboard — lib/archive isUnpaid),
//   overdue or due within 7 days;
// - the VAT return (ภ.พ.30): what is left to check and the input VAT that can be claimed, on its reminder days
//   while the month is open (or always, for a test).

import { monthKey } from "./archive";
import { type DocumentRow, type ItemRow, rowToDoc } from "./db-map";
import { summarize, upcoming, vatFiling } from "./dashboard";
import { dueReminder, vatReminder } from "./line";
import { appUrl } from "./line-bot";
import type { supabaseAdmin } from "./supabase/admin";

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = DocumentRow & { document_items: ItemRow[]; ack_flags?: string[] | null };

export async function reminderTexts(admin: Admin, today: string, opts: { test?: boolean } = {}): Promise<string[]> {
  const f = vatFiling(today);
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
  return [due, vat].filter((x): x is string => !!x);
}
