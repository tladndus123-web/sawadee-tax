// Who may call an AI route on the expenses / calendar screens: a signed-in, active admin; the routes that read the
// whole books also need an admin no owner limited (lib/full-admin-server). Small per-person rate limit. Server only.

import { endIfExpired } from "./auth/session-guard";
import { isFullAdmin } from "./full-admin-server";
import { supabaseAdmin } from "./supabase/admin";
import { supabaseServer } from "./supabase/server";

const hits = new Map<string, number[]>();

export async function adminCaller(opts: { full: boolean; perTenMinutes: number }): Promise<{ userId: string } | Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (await endIfExpired(supabase))) return Response.json({ error: "signin" }, { status: 401 });
  const { data: member } = await supabase.from("members").select("role, disabled_at").eq("user_id", user.id).maybeSingle();
  if (member?.role !== "admin" || member.disabled_at) return Response.json({ error: "admin" }, { status: 403 });
  if (opts.full && !(await isFullAdmin(supabaseAdmin(), user.id))) return Response.json({ error: "admin" }, { status: 403 });
  const now = Date.now();
  const recent = (hits.get(user.id) ?? []).filter((t) => now - t < 600_000);
  if (recent.length >= opts.perTenMinutes) return Response.json({ error: "rate" }, { status: 429 });
  hits.set(user.id, [...recent, now]);
  return { userId: user.id };
}
