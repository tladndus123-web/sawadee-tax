// This week's three things to do, from the calendar and the books (lib/insights-server weekBrief). Made at most a few
// times a day (kept while the calendar is unchanged). Admins nobody limited.

import { adminCaller } from "@/lib/api-admin-server";
import { AiBusy, langOf, weekBrief } from "@/lib/insights-server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { todayBangkok } from "@/lib/thai-tax";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const who = await adminCaller({ full: true, perTenMinutes: 20, later: true });
  if (who instanceof Response) return who;
  const body = (await req.json().catch(() => ({}))) as { lang?: unknown };
  try {
    const r = await weekBrief(supabaseAdmin(), todayBangkok(), langOf(body.lang), who.spend);
    return Response.json(r ?? { body: null });
  } catch (e) {
    if (e instanceof AiBusy) return Response.json({ error: "rate" }, { status: 429 });
    console.error("[calendar] brief failed:", e instanceof Error ? e.message : e);
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
