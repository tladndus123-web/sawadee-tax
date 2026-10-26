// The AI assistant inside the app (owner, 2026-10-27): an admin's question → a card from the books and the calendar
// (lib/assistant-server answerInApp, Sonnet 5.5). Admins only, like on LINE; 20 questions per 10 minutes per person.
// The books are read with the service role on the server, after the admin check.

import { answerInApp } from "@/lib/assistant-server";
import { endIfExpired } from "@/lib/auth/session-guard";
import { appUrl } from "@/lib/line-bot";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const hits = new Map<string, number[]>();

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (await endIfExpired(supabase))) return Response.json({ error: "signin" }, { status: 401 });
  const { data: member } = await supabase.from("members").select("role, disabled_at").eq("user_id", user.id).maybeSingle();
  if (member?.role !== "admin" || member.disabled_at) return Response.json({ error: "admin" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "noKey" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { question?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, 2000) : "";
  if (!question) return Response.json({ error: "empty" }, { status: 400 });
  const now = Date.now();
  const recent = (hits.get(user.id) ?? []).filter((t) => now - t < 600_000);
  if (recent.length >= 20) return Response.json({ error: "rate" }, { status: 429 });
  hits.set(user.id, [...recent, now]);
  try {
    const a = await answerInApp(supabaseAdmin(), user.id, question, appUrl());
    return Response.json(a);
  } catch (e) {
    console.error("[assistant] app answer failed:", e instanceof Error ? e.message : e);
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
