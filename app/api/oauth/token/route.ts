// The agent swaps the one-time code for its key (PKCE checked, the code works once). The key is an ordinary bot_keys
// row: listed in settings and disconnected there. Connecting again from the same agent replaces its old key.
import { hashKey, keyHint, makeKey } from "@/lib/bot-keys";
import { pkceOk, sha256hex } from "@/lib/oauth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const CORS = { "access-control-allow-origin": "*", "cache-control": "no-store", pragma: "no-cache" };
const fail = (error: string, status = 400) => Response.json({ error }, { status, headers: CORS });

async function form(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v ?? "")]));
  }
  return Object.fromEntries(new URLSearchParams(await req.text()));
}

export async function POST(req: Request) {
  const f = await form(req);
  if (f.grant_type !== "authorization_code") return fail("unsupported_grant_type");
  if (!f.code || !f.code_verifier || !f.client_id || !f.redirect_uri) return fail("invalid_request");
  const admin = supabaseAdmin();
  // Take the code once: only an unused, unexpired one is marked used
  const { data: code } = await admin
    .from("oauth_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", sha256hex(f.code))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("client_id, redirect_uri, code_challenge, user_id")
    .maybeSingle();
  if (!code || code.client_id !== f.client_id || code.redirect_uri !== f.redirect_uri || !pkceOk(f.code_verifier, code.code_challenge as string)) return fail("invalid_grant");
  const { data: client } = await admin.from("oauth_clients").select("name").eq("client_id", f.client_id).maybeSingle();
  await admin.from("bot_keys").update({ revoked_at: new Date().toISOString() }).eq("client_id", f.client_id).is("revoked_at", null);
  const key = makeKey();
  const { error } = await admin
    .from("bot_keys")
    .insert({ name: String(client?.name ?? "AI agent").slice(0, 40), key_hash: hashKey(key), hint: keyHint(key), created_by: code.user_id, client_id: f.client_id });
  if (error) return fail("server_error", 500);
  return Response.json({ access_token: key, token_type: "Bearer", scope: "books" }, { headers: CORS });
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "*" } });
}
