// Daily reminders (Vercel Cron, vercel.json — 09:00 Bangkok) to the admins (no daily bills-due list since 2026-10-01):
// the VAT return 3 days / 1 day before its deadline, payroll filings, staff documents (lib/reminders-server). Sent by LINE to admins who
// linked it, and as a phone notification to every device an admin turned notifications on for.
// Nothing is sent on days with nothing to say, so the monthly LINE message quota is barely touched.

import { lineClient, lineConfig } from "@/lib/line";
import { appUrl } from "@/lib/line-bot";
import { sendPush, toPush } from "@/lib/push-server";
import { reminderTexts } from "@/lib/reminders-server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { todayBangkok } from "@/lib/thai-tax";

export const runtime = "nodejs";

export async function GET(req: Request) {
  // Vercel Cron sends "Authorization: Bearer $CRON_SECRET"; nobody else may trigger pushes
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });

  const admin = supabaseAdmin();
  const [texts, admins] = await Promise.all([reminderTexts(admin, todayBangkok()), admin.from("members").select("user_id, line_user_id").eq("role", "admin")]);
  if (admins.error) throw admins.error;
  if (!texts.length) return Response.json({ sent: 0 });

  // LINE
  let line = 0;
  let failed = 0;
  const to = (admins.data ?? []).map((m) => m.line_user_id as string | null).filter((x): x is string => !!x);
  if (lineConfig().channelAccessToken && to.length) {
    const client = lineClient();
    const messages = texts.map((text) => ({ type: "text" as const, text }));
    const results = await Promise.allSettled(to.map((id) => client.pushMessage({ to: id, messages })));
    const bad = results.filter((r) => r.status === "rejected");
    bad.forEach((r) => console.error("[cron] reminder push failed", (r as PromiseRejectedResult).reason));
    line = to.length - bad.length;
    failed = bad.length;
  }

  // Phone notifications
  const devices = await sendPush(
    admin,
    (admins.data ?? []).map((m) => m.user_id as string),
    texts.map((t) => toPush(t, `${appUrl()}/`)),
  ).catch((e) => (console.error("[cron] phone notifications failed", e), 0));

  return Response.json({ sent: line, failed, devices, messages: texts.length });
}
