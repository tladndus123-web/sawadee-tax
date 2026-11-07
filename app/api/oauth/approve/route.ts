// The owner's answer on the "허용" page (/{locale}/connect), owners only.
//   GET   ?client_id&redirect_uri → { name } when the request is good (the page shows who is asking)
//   POST  { client_id, redirect_uri, code_challenge, state, allow } → { redirect } back to the agent
//         (with a one-time code valid 5 minutes, or error=access_denied)
import { newCode, redirectOk, sha256hex, withParams } from "@/lib/oauth";
import { ownerOf } from "@/lib/owner-server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function client(clientId: string, redirectUri: string) {
  if (!/^mcp_[A-Za-z0-9]{24}$/.test(clientId) || !redirectOk(redirectUri)) return null;
  const { data } = await supabaseAdmin().from("oauth_clients").select("name, redirect_uris").eq("client_id", clientId).maybeSingle();
  return data && (data.redirect_uris as string[]).includes(redirectUri) ? { name: data.name as string } : null;
}

export async function GET(req: Request) {
  if (!(await ownerOf())) return Response.json({ error: "owner" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const c = await client(q.get("client_id") ?? "", q.get("redirect_uri") ?? "");
  return c ? Response.json(c) : Response.json({ error: "bad" }, { status: 400 });
}

export async function POST(req: Request) {
  const me = await ownerOf();
  if (!me) return Response.json({ error: "owner" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const clientId = String(b.client_id ?? "");
  const redirectUri = String(b.redirect_uri ?? "");
  const challenge = String(b.code_challenge ?? "");
  const state = String(b.state ?? "").slice(0, 500);
  if (!(await client(clientId, redirectUri))) return Response.json({ error: "bad" }, { status: 400 });
  if (b.allow !== true) return Response.json({ redirect: withParams(redirectUri, { error: "access_denied", state }) });
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) return Response.json({ error: "bad" }, { status: 400 });
  const code = newCode();
  const admin = supabaseAdmin();
  await admin.from("oauth_codes").delete().lt("expires_at", new Date().toISOString());
  const { error } = await admin
    .from("oauth_codes")
    .insert({ code_hash: sha256hex(code), client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge, user_id: me.id, expires_at: new Date(Date.now() + 5 * 60_000).toISOString() });
  if (error) return Response.json({ error: "server" }, { status: 500 });
  return Response.json({ redirect: withParams(redirectUri, { code, state }) });
}
