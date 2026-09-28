// A category's name into the other screen languages (settings → categories). Admins only — each call is a paid
// (small) API call.

import { endIfExpired } from "@/lib/auth/session-guard";
import { supabaseServer } from "@/lib/supabase/server";
import { LABEL_LANGS, type LabelLang, translateLabel } from "@/lib/translate-server";

export const runtime = "nodejs";

const hits = new Map<string, number[]>();

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "signin" }, { status: 401 });
  if (await endIfExpired(supabase)) return Response.json({ error: "signin" }, { status: 401 });
  const { data: member } = await supabase.from("members").select("role").eq("user_id", user.id).maybeSingle();
  if (member?.role !== "admin") return Response.json({ error: "admin" }, { status: 403 });
  const now = Date.now();
  const recent = (hits.get(user.id) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 20) return Response.json({ error: "rate" }, { status: 429 });
  hits.set(user.id, [...recent, now]);

  const body = (await req.json().catch(() => null)) as { text?: unknown; from?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const from = body?.from as LabelLang;
  if (!text || text.length > 40 || !(LABEL_LANGS as readonly string[]).includes(from)) return Response.json({ error: "bad" }, { status: 400 });
  const names = await translateLabel(text, from, req.signal).catch(() => null);
  if (!names) return Response.json({ error: "aiFail" }, { status: 502 });
  return Response.json({ names });
}
