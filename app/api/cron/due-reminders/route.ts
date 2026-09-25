// Daily payment reminder (Vercel Cron, vercel.json — 09:00 Bangkok). Sends each admin who linked LINE a
// list of unpaid credit purchases that are overdue or due within 7 days. Nothing is sent on days with
// nothing due, so the monthly LINE message quota is barely touched.

import { type DocumentRow, rowToDoc } from "@/lib/db-map";
import { upcoming } from "@/lib/dashboard";
import { dueReminder, lineClient, lineConfig } from "@/lib/line";
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
  const [docs, admins] = await Promise.all([
    admin.from("documents").select("*").eq("status", "reviewed").eq("payment", "credit").eq("paid", false).is("deleted_at", null),
    admin.from("members").select("line_user_id").eq("role", "admin").not("line_user_id", "is", null),
  ]);
  if (docs.error) throw docs.error;
  if (admins.error) throw admins.error;

  const items = upcoming(
    (docs.data as DocumentRow[]).map((row) => ({ id: row.id, doc: rowToDoc(row, []) })),
    todayBangkok(),
  );
  const text = dueReminder(items, `${appUrl()}/`);
  const to = (admins.data ?? []).map((m) => m.line_user_id as string);
  if (!text || !to.length) return Response.json({ sent: 0 });

  const client = lineClient();
  const results = await Promise.allSettled(to.map((id) => client.pushMessage({ to: id, messages: [{ type: "text", text }] })));
  const failed = results.filter((r) => r.status === "rejected");
  failed.forEach((r) => console.error("[cron] reminder push failed", (r as PromiseRejectedResult).reason));
  return Response.json({ sent: to.length - failed.length, failed: failed.length, due: items.filter((i) => i.state !== "later" && i.state !== "none").length });
}
