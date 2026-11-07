// Connection keys for an AI agent (Grok Bot), owners only (owner 2026-11-08).
//   GET     the keys (name, hint, made, last used) — never the keys themselves
//   POST    { name } → a new key, shown this once
//   DELETE  { id } → the key stops working at once

import { endIfExpired } from "@/lib/auth/session-guard";
import { hashKey, keyHint, makeKey } from "@/lib/bot-keys";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const fail = (error: string, status: number) => Response.json({ error }, { status });

async function owner() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (await endIfExpired(supabase))) return null;
  const { data: me } = await supabase.from("members").select("role, owner, disabled_at").eq("user_id", user.id).maybeSingle();
  return me?.role === "admin" && me.owner && !me.disabled_at ? user : null;
}

export async function GET() {
  if (!(await owner())) return fail("forbidden", 403);
  const { data, error } = await supabaseAdmin().from("bot_keys").select("id, name, hint, created_at, last_used_at").is("revoked_at", null).order("created_at");
  if (error) return fail(error.message, 502);
  return Response.json({ keys: data ?? [] });
}

export async function POST(req: Request) {
  const user = await owner();
  if (!user) return fail("forbidden", 403);
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const name = String(body.name ?? "Grok Bot").trim().slice(0, 40) || "Grok Bot";
  const admin = supabaseAdmin();
  const { count } = await admin.from("bot_keys").select("id", { count: "exact", head: true }).is("revoked_at", null);
  if ((count ?? 0) >= 5) return fail("tooMany", 409);
  const key = makeKey();
  const { data, error } = await admin.from("bot_keys").insert({ name, key_hash: hashKey(key), hint: keyHint(key), created_by: user.id }).select("id, name, hint, created_at, last_used_at").single();
  if (error) return fail(error.message, 502);
  return Response.json({ key, row: data });
}

export async function DELETE(req: Request) {
  if (!(await owner())) return fail("forbidden", 403);
  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = String(body.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("bad", 400);
  const { error } = await supabaseAdmin().from("bot_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null);
  if (error) return fail(error.message, 502);
  return Response.json({ ok: true });
}
