// After the app saves a document: tell Grok Bot's webhook when the receipt is worth a look (lib/bot-events-server).
// The caller must be able to see the document (RLS); the event itself is built with the service role. 30 a minute
// per person; nothing is sent for an ordinary receipt.
import { endIfExpired } from "@/lib/auth/session-guard";
import { appUrl } from "@/lib/app-url";
import { documentEvent, sendBotEvent } from "@/lib/bot-events-server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
const hits = new Map<string, number[]>();

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (await endIfExpired(supabase))) return Response.json({ error: "signin" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
  if (!id) return Response.json({ error: "id" }, { status: 400 });
  const now = Date.now();
  const recent = (hits.get(user.id) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(user.id, recent);
  if (recent.length > 30) return Response.json({ sent: 0, skipped: "rate" });
  const { data: d } = await supabase.from("documents").select("id, status").eq("id", id).maybeSingle();
  if (!d || d.status !== "reviewed") return Response.json({ sent: 0 });
  const admin = supabaseAdmin();
  const { count } = await admin.from("bot_webhooks").select("id", { count: "exact", head: true }).eq("enabled", true);
  if (!count) return Response.json({ sent: 0 });
  try {
    const ev = await documentEvent(admin, id, appUrl());
    return Response.json({ sent: ev ? await sendBotEvent(admin, ev) : 0 });
  } catch (e) {
    console.error("bot-events:", e instanceof Error ? e.message : e);
    return Response.json({ sent: 0, error: "failed" }, { status: 502 });
  }
}
