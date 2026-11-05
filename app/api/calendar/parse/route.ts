// One sentence → a calendar date to confirm (lib/insights-server eventFromText). Nothing is saved here. Admins.

import { adminCaller } from "@/lib/api-admin-server";
import { eventFromText, langOf } from "@/lib/insights-server";
import { todayBangkok } from "@/lib/thai-tax";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const who = await adminCaller({ full: false, perTenMinutes: 30 });
  if (who instanceof Response) return who;
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "noKey" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { text?: unknown; lang?: unknown };
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 500) : "";
  if (!text) return Response.json({ error: "empty" }, { status: 400 });
  try {
    const event = await eventFromText(text, todayBangkok(), langOf(body.lang));
    return event ? Response.json({ event }) : Response.json({ error: "none" }, { status: 422 });
  } catch (e) {
    console.error("[calendar] parse failed:", e instanceof Error ? e.message : e);
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
