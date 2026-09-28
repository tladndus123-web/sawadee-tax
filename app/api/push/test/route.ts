// "Send a test" (settings → phone notifications): today's reminders — the VAT one even when today is not one of
// its days — to the devices of the admin who pressed the button, nobody else.

import { endIfExpired } from "@/lib/auth/session-guard";
import { appUrl } from "@/lib/line-bot";
import { pushConfigured, sendPush, toPush } from "@/lib/push-server";
import { reminderTexts } from "@/lib/reminders-server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { todayBangkok } from "@/lib/thai-tax";

export const runtime = "nodejs";

const LIMIT = 5;
const WINDOW_MS = 600_000;
const hits = new Map<string, number[]>();

export async function POST() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "signin" }, { status: 401 });
  if (await endIfExpired(supabase)) return Response.json({ error: "signin" }, { status: 401 });
  const { data: member } = await supabase.from("members").select("role").eq("user_id", user.id).maybeSingle();
  if (member?.role !== "admin") return Response.json({ error: "admin" }, { status: 403 });
  if (!pushConfigured()) return Response.json({ error: "noPush" }, { status: 503 });
  const now = Date.now();
  const recent = (hits.get(user.id) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) return Response.json({ error: "rate" }, { status: 429 });
  hits.set(user.id, [...recent, now]);

  const admin = supabaseAdmin();
  const texts = await reminderTexts(admin, todayBangkok(), { test: true });
  const messages = texts.map((t) => toPush(t, `${appUrl()}/`));
  if (messages[0]) messages[0] = { ...messages[0], title: `🧪 ${messages[0].title}` };
  const devices = await sendPush(admin, [user.id], messages);
  return Response.json({ devices });
}
