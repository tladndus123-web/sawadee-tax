// Daily reminders (Vercel Cron, vercel.json — 09:00 Bangkok), sent to each admin who linked LINE:
// - unpaid credit purchases that are overdue or due within 7 days;
// - the VAT return (ภ.พ.30): 3 days and 1 day before its deadline while the month is still open, with what is
//   left to check and the input VAT that can be claimed.
// Nothing is sent on days with nothing to say, so the monthly LINE message quota is barely touched.

import { monthKey } from "@/lib/archive";
import { type DocumentRow, type ItemRow, rowToDoc } from "@/lib/db-map";
import { summarize, upcoming, vatFiling } from "@/lib/dashboard";
import { dueReminder, lineClient, lineConfig, VAT_REMIND_DAYS, vatReminder } from "@/lib/line";
import { appUrl } from "@/lib/line-bot";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { todayBangkok } from "@/lib/thai-tax";

export const runtime = "nodejs";

export async function GET(req: Request) {
  // Vercel Cron sends "Authorization: Bearer $CRON_SECRET"; nobody else may trigger pushes
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  if (!lineConfig().channelAccessToken) return Response.json({ sent: 0, reason: "LINE not configured" });

  const admin = supabaseAdmin();
  const today = todayBangkok();
  const [docs, admins] = await Promise.all([
    admin.from("documents").select("*").eq("status", "reviewed").eq("payment", "credit").eq("paid", false).is("deleted_at", null),
    admin.from("members").select("line_user_id").eq("role", "admin").not("line_user_id", "is", null),
  ]);
  if (docs.error) throw docs.error;
  if (admins.error) throw admins.error;

  const items = upcoming(
    (docs.data as DocumentRow[]).map((row) => ({ id: row.id, doc: rowToDoc(row, []) })),
    today,
  );
  const texts = [dueReminder(items, `${appUrl()}/`), await vatText(admin, today)].filter((x): x is string => !!x);
  const to = (admins.data ?? []).map((m) => m.line_user_id as string);
  if (!texts.length || !to.length) return Response.json({ sent: 0 });

  const client = lineClient();
  const messages = texts.map((text) => ({ type: "text" as const, text }));
  const results = await Promise.allSettled(to.map((id) => client.pushMessage({ to: id, messages })));
  const failed = results.filter((r) => r.status === "rejected");
  failed.forEach((r) => console.error("[cron] reminder push failed", (r as PromiseRejectedResult).reason));
  return Response.json({ sent: to.length - failed.length, failed: failed.length, messages: texts.length });
}

/** The VAT return reminder, only on its days and only while the month is open (the ledger is read only then) */
async function vatText(admin: ReturnType<typeof supabaseAdmin>, today: string): Promise<string | null> {
  const f = vatFiling(today);
  if (!VAT_REMIND_DAYS.includes(f.daysLeft)) return null;
  const [lock, settings, all] = await Promise.all([
    admin.from("month_locks").select("month").eq("month", f.month).maybeSingle(),
    admin.from("company_settings").select("tax_id").eq("id", 1).maybeSingle(),
    admin.from("documents").select("*, document_items(*)").is("deleted_at", null),
  ]);
  if (lock.error || settings.error || all.error) throw lock.error ?? settings.error ?? all.error;
  if (lock.data) return null;
  const rows = (all.data ?? []) as (DocumentRow & { document_items: ItemRow[]; ack_flags?: string[] | null })[];
  const toDoc = (r: (typeof rows)[number]) => ({ id: r.id, doc: rowToDoc(r, r.document_items ?? []), ack: r.ack_flags ?? [] });
  const s = summarize(rows.filter((r) => r.status === "reviewed").map(toDoc), f.month, settings.data?.tax_id ?? "", today);
  const drafts = rows.filter((r) => r.status === "draft").map(toDoc).filter((d) => monthKey(d.doc) === f.month).length;
  return vatReminder(
    { month: f.month, due: f.onlineOnly ? f.dueOnline : f.due, daysLeft: f.daysLeft, toCheck: s.toCheck, drafts, claimableVat: s.claimableVat },
    `${appUrl()}/`,
  );
}
