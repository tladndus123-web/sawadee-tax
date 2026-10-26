// After a claim is added, decided or paid back in the app: tell the admins (new) or the member (decided / paid) on
// LINE. The caller must be able to see the claim (RLS); the sending itself is lib/expense-line-server.

import { endIfExpired } from "@/lib/auth/session-guard";
import { notifyClaimant, notifyNewClaim } from "@/lib/expense-line-server";
import { appUrl } from "@/lib/line-bot";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

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
  try {
    const sent = c.status === "pending" ? await notifyNewClaim(id, appUrl()) : (await notifyClaimant(id)) ? 1 : 0;
    return Response.json({ sent });
  } catch (e) {
    console.error("[expenses] notify:", e instanceof Error ? e.message : e);
    return Response.json({ sent: 0 });
  }
}
