// Daily reminders (Vercel Cron, vercel.json — 09:00 Bangkok) to the admins (no daily bills-due list since 2026-10-01):
// the VAT return 3 days / 1 day before its deadline, payroll filings, staff documents (lib/reminders-server). Sent by LINE to admins who
// linked it, and as a phone notification to every device an admin turned notifications on for.
// Nothing is sent on days with nothing to say, so the monthly LINE message quota is barely touched.
// Every LINE message is in the reader's phone language (2026-10-26). Mondays also bring the weekly AI report card.

import { lineClient, lineConfig } from "@/lib/line";
import { noticeMessage } from "@/lib/line-dash";
import { appUrl } from "@/lib/line-bot";
import { inLang } from "@/lib/line-lang";
import { profileLang } from "@/lib/line-menu";
import { isReportDay, sendWeeklyReport } from "@/lib/weekly-report-server";
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
  const today = todayBangkok();
  const [texts, admins] = await Promise.all([reminderTexts(admin, today), admin.from("members").select("user_id, line_user_id").eq("role", "admin").is("disabled_at", null)]);
  if (admins.error) throw admins.error;
  const to = (admins.data ?? []).map((m) => m.line_user_id as string | null).filter((x): x is string => !!x);

  // Monday: the weekly AI report (its own message, whatever else there is to say)
  const weekly = lineConfig().channelAccessToken && isReportDay(today) ? await sendWeeklyReport(admin, appUrl(), today, to).catch((e) => (console.error("[cron] weekly report failed", e), 0)) : 0;
  if (!texts.length) return Response.json({ sent: 0, weekly });

  // LINE
  let line = 0;
  let failed = 0;
  if (lineConfig().channelAccessToken && to.length) {
    const client = lineClient();
    // One message with every reminder as a card (swipe for more), in the reader's language
    const results = await Promise.allSettled(to.map(async (id) => client.pushMessage({ to: id, messages: [noticeMessage(texts, "REMINDER", await profileLang(id))] })));
    const bad = results.filter((r) => r.status === "rejected");
    bad.forEach((r) => console.error("[cron] reminder push failed", (r as PromiseRejectedResult).reason));
    line = to.length - bad.length;
    failed = bad.length;
  }

  // Phone notifications
  const devices = await sendPush(
    admin,
    (admins.data ?? []).map((m) => m.user_id as string),
    // Phone notifications in Japanese (the app's first language)
    texts.map((t) => toPush(inLang(t, "ja"), `${appUrl()}/`)),
  ).catch((e) => (console.error("[cron] phone notifications failed", e), 0));

  return Response.json({ sent: line, failed, devices, messages: texts.length, weekly });
}
