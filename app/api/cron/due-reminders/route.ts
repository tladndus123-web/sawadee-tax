// Daily reminders (Vercel Cron, vercel.json — 09:00 Bangkok), sent to each admin who linked LINE: bills that are
// overdue or due within 7 days, and the VAT return 3 days / 1 day before its deadline (lib/reminders-server).
// Nothing is sent on days with nothing to say, so the monthly LINE message quota is barely touched.

import { lineClient, lineConfig } from "@/lib/line";
import { reminderTexts } from "@/lib/reminders-server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { todayBangkok } from "@/lib/thai-tax";

export const runtime = "nodejs";

export async function GET(req: Request) {
  // Vercel Cron sends "Authorization: Bearer $CRON_SECRET"; nobody else may trigger pushes
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  if (!lineConfig().channelAccessToken) return Response.json({ sent: 0, reason: "LINE not configured" });

  const admin = supabaseAdmin();
  const [texts, admins] = await Promise.all([
    reminderTexts(admin, todayBangkok()),
    admin.from("members").select("line_user_id").eq("role", "admin").not("line_user_id", "is", null),
  ]);
  if (admins.error) throw admins.error;
  const to = (admins.data ?? []).map((m) => m.line_user_id as string);
  if (!texts.length || !to.length) return Response.json({ sent: 0 });

  const client = lineClient();
  const messages = texts.map((text) => ({ type: "text" as const, text }));
  const results = await Promise.allSettled(to.map((id) => client.pushMessage({ to: id, messages })));
  const failed = results.filter((r) => r.status === "rejected");
  failed.forEach((r) => console.error("[cron] reminder push failed", (r as PromiseRejectedResult).reason));
  return Response.json({ sent: to.length - failed.length, failed: failed.length, messages: texts.length });
}
