// After a claim is added, decided or paid back in the app: tell the admins (new) or the member (decided / paid) on
// LINE. The caller must be able to see the claim (RLS); the sending itself is lib/expense-line-server.

import { endIfExpired } from "@/lib/auth/session-guard";
import { notifyClaimant, notifyNewClaim } from "@/lib/expense-line-server";
import { appUrl } from "@/lib/line-bot";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

// The same claim is told about at most once a minute, and one person sends at most 10 notices a minute (security
// check 2026-11-07: re-sending one's own claim again and again repeated the admins' LINE message)
const sent = new Map<string, number>();
const byUser = new Map<string, number[]>();
function tooOften(userId: string, claimId: string, status: string): boolean {
  const now = Date.now();
  const key = `${claimId}:${status}`;
  if (now - (sent.get(key) ?? 0) < 60_000) return true;
  const recent = (byUser.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 10) return true;
  sent.set(key, now);
  byUser.set(userId, [...recent, now]);
  if (sent.size > 5000) for (const [k, t] of sent) if (now - t > 60_000) sent.delete(k);
  return false;
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (await endIfExpired(supabase))) return Response.json({ error: "signin" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
  if (!id) return Response.json({ error: "id" }, { status: 400 });
  const { data: c } = await supabase.from("expense_claims").select("id, status").eq("id", id).maybeSingle();
  if (!c) return Response.json({ error: "id" }, { status: 404 });
  if (tooOften(user.id, c.id as string, c.status as string)) return Response.json({ sent: 0, skipped: "rate" });
  try {
    const sent = c.status === "pending" ? await notifyNewClaim(id, appUrl()) : (await notifyClaimant(id)) ? 1 : 0;
    return Response.json({ sent });
  } catch (e) {
    console.error("[expenses] notify:", e instanceof Error ? e.message : e);
    return Response.json({ sent: 0 });
  }
}
