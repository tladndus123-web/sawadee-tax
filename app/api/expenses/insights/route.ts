// The month's expense claims, looked over by the AI (lib/insights-server expenseReport): a short report and a line per
// claim worth a look. Kept until the claims change. Admins nobody limited.

import { adminCaller } from "@/lib/api-admin-server";
import { AiBusy, expenseReport, langOf } from "@/lib/insights-server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { todayBangkok } from "@/lib/thai-tax";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const who = await adminCaller({ full: true, perTenMinutes: 20, later: true });
  if (who instanceof Response) return who;
  const body = (await req.json().catch(() => ({}))) as { month?: unknown; lang?: unknown };
  const month = typeof body.month === "string" && /^\d{4}-\d{2}$/.test(body.month) ? body.month : todayBangkok().slice(0, 7);
  try {
    const r = await expenseReport(supabaseAdmin(), month, langOf(body.lang), who.spend);
    return Response.json(r ?? { body: null });
  } catch (e) {
    if (e instanceof AiBusy) return Response.json({ error: "rate" }, { status: 429 });
    console.error("[expenses] insights failed:", e instanceof Error ? e.message : e);
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
