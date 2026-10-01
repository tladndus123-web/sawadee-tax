// "Send a test" (settings → LINE): the reminders as they would look today — bills due, and the VAT return
// reminder even when today is not one of its days — pushed only to the admin who pressed the button.

import { endIfExpired } from "@/lib/auth/session-guard";
import { langMessages, lineClient, lineConfig } from "@/lib/line";
import { reminderTexts } from "@/lib/reminders-server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { todayBangkok } from "@/lib/thai-tax";

export const runtime = "nodejs";

// A test is a real LINE message (counted in the monthly quota): a few per person per 10 minutes
const LIMIT = 3;
const WINDOW_MS = 600_000;
const hits = new Map<string, number[]>();

export async function POST() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "signin" }, { status: 401 });
  if (await endIfExpired(supabase)) return Response.json({ error: "signin" }, { status: 401 });
  const { data: member } = await supabase.from("members").select("role, line_user_id").eq("user_id", user.id).maybeSingle();
  if (member?.role !== "admin") return Response.json({ error: "admin" }, { status: 403 });
  if (!member.line_user_id) return Response.json({ error: "notLinked" }, { status: 400 });
  if (!lineConfig().channelAccessToken) return Response.json({ error: "noLine" }, { status: 503 });

  const now = Date.now();
  const recent = (hits.get(user.id) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) return Response.json({ error: "rate" }, { status: 429 });
  hits.set(user.id, [...recent, now]);

  const texts = await reminderTexts(supabaseAdmin(), todayBangkok(), { test: true });
  if (!texts.length) return Response.json({ sent: 0 });
  await lineClient().pushMessage({
    to: member.line_user_id as string,
    messages: langMessages(texts, `🧪 TEST\n`),
  });
  return Response.json({ sent: texts.length });
}
