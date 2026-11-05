// The calendar subscription for Google Calendar / the iPhone calendar (lib/calendar-feed-server): GET ?t=<secret>&lang=ko.
// No sign-in (calendar apps cannot sign in); the secret in the address is checked instead, and admins can renew it.

import { feedIcs, feedTokenOk } from "@/lib/calendar-feed-server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { todayBangkok } from "@/lib/thai-tax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const admin = supabaseAdmin();
  if (!(await feedTokenOk(admin, url.searchParams.get("t") ?? ""))) return new Response("not found", { status: 404 });
  try {
    const ics = await feedIcs(admin, url.searchParams.get("lang") ?? "ja", todayBangkok());
    return new Response(ics, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": 'inline; filename="sawadee-tax.ics"',
        "cache-control": "private, max-age=900",
      },
    });
  } catch (e) {
    console.error("[calendar] feed failed:", e instanceof Error ? e.message : e);
    return new Response("unavailable", { status: 503 });
  }
}
