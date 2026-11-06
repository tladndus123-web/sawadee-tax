// The month's sales, looked over by the AI (lib/insights-server salesReport, Sonnet): how it is going, three findings,
// what to do. Kept until the sales change (or 6 hours). Admins nobody limited (all branches).

import { adminCaller } from "@/lib/api-admin-server";
import { AiBusy, langOf, salesReport } from "@/lib/insights-server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { todayBangkok } from "@/lib/thai-tax";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const who = await adminCaller({ full: true, perTenMinutes: 20, later: true });
  if (who instanceof Response) return who;
  const body = (await req.json().catch(() => ({}))) as { month?: unknown; lang?: unknown };
  const today = todayBangkok();
  const month = typeof body.month === "string" && /^\d{4}-\d{2}$/.test(body.month) && body.month <= today.slice(0, 7) ? body.month : today.slice(0, 7);
  try {
    const r = await salesReport(supabaseAdmin(), month, today, langOf(body.lang), who.spend);
    return Response.json(r ?? { body: null });
  } catch (e) {
    if (e instanceof AiBusy) return Response.json({ error: "rate" }, { status: 429 });
    console.error("[sales] insights failed:", e instanceof Error ? e.message : e);
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
