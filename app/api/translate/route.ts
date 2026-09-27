// Translate fields typed in one language into the other two when a document is saved (lib/translate-gaps.ts
// decides which). Members only — each call is a paid API call. The API key never reaches the browser.

import { endIfExpired } from "@/lib/auth/session-guard";
import { supabaseServer } from "@/lib/supabase/server";
import { parseTranslateBody, translateFields } from "@/lib/translate-server";

export const runtime = "nodejs";
export const maxDuration = 120;

// Per-person limit: one call per save, so this is generous
const LIMIT = 20;
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();
function limited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "signin" }, { status: 401 });
  if (await endIfExpired(supabase)) return Response.json({ error: "signin" }, { status: 401 });
  const { data: member } = await supabase.from("members").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!member) return Response.json({ error: "signin" }, { status: 403 });
  if (limited(user.id)) return Response.json({ error: "rate" }, { status: 429 });

  const items = parseTranslateBody(await req.json().catch(() => null));
  if (!items) return Response.json({ error: "bad" }, { status: 400 });
  try {
    const results = await translateFields(items, req.signal);
    if (!results) return Response.json({ error: "aiFail" }, { status: 502 });
    return Response.json({ items: results });
  } catch (error) {
    console.error("translate:", error instanceof Error ? error.message : error);
    return Response.json({ error: "busy" }, { status: 503 });
  }
}
