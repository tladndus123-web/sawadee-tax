// Calendar subscriptions for Google Calendar / the iPhone calendar (lib/calendar-feed-server):
//   GET ?t=<secret>&lang=ko               company dates (tax deadlines, bills, company dates)
//   GET ?t=<secret>&lang=ko&who=staff[&emp=<employee id>]   the staff work schedule (everyone, or one person)
// No sign-in (calendar apps cannot sign in); the secret in the address is checked instead, and admins can renew it.

import { feedIcs, feedStaffIds, feedTokenOk, staffFeedIcs } from "@/lib/calendar-feed-server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { guessingTooMuch, TOO_MANY, wrongGuess } from "@/lib/ip-limit";
import { todayBangkok } from "@/lib/thai-tax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const admin = supabaseAdmin();
  const staff = url.searchParams.get("who") === "staff";
  if (guessingTooMuch(req, "feed", 30)) return TOO_MANY();
  if (!(await feedTokenOk(admin, url.searchParams.get("t") ?? "", staff ? 2 : 1))) {
    wrongGuess(req, "feed");
    return new Response("not found", { status: 404 });
  }
  const lang = url.searchParams.get("lang") ?? "ja";
  try {
    let ics: string;
    if (staff) {
      const emp = url.searchParams.get("emp") ?? "";
      if (emp && !(/^[0-9a-f-]{36}$/.test(emp) && (await feedStaffIds(admin)).has(emp))) return new Response("not found", { status: 404 });
      ics = await staffFeedIcs(admin, lang, todayBangkok(), emp || undefined);
    } else ics = await feedIcs(admin, lang, todayBangkok());
    return new Response(ics, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `inline; filename="${staff ? "sawadee-staff" : "sawadee-tax"}.ics"`,
        "cache-control": "private, max-age=900",
      },
    });
  } catch (e) {
    console.error("[calendar] feed failed:", e instanceof Error ? e.message : e);
    return new Response("unavailable", { status: 503 });
  }
}
