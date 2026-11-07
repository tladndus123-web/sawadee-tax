// The signed-in owner making this request (or null): an active admin with owner = true (…003200_owners.sql)

import { endIfExpired } from "./auth/session-guard";
import { supabaseServer } from "./supabase/server";

export async function ownerOf(): Promise<{ id: string } | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (await endIfExpired(supabase))) return null;
  const { data: me } = await supabase.from("members").select("role, owner, disabled_at").eq("user_id", user.id).maybeSingle();
  return me?.role === "admin" && me.owner && !me.disabled_at ? { id: user.id } : null;
}

/** This site's address as the caller reached it (metadata and redirects use it) */
export function originOf(req: Request): string {
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? u.host;
  const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  return `${proto}://${host}`;
}
