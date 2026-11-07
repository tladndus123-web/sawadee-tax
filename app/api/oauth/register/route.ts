// An AI agent registers itself before signing in (RFC 7591, public client, no secret). Limited per address.
import { newClientId, redirectOk } from "@/lib/oauth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const CORS = { "access-control-allow-origin": "*", "cache-control": "no-store" };
const hits = new Map<string, number[]>();

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  recent.push(now);
  hits.set(ip, recent);
  if (recent.length > 20) return Response.json({ error: "slow_down" }, { status: 429, headers: CORS });
  const body = (await req.json().catch(() => null)) as { redirect_uris?: unknown; client_name?: unknown } | null;
  const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length || uris.length > 5 || !uris.every(redirectOk)) return Response.json({ error: "invalid_redirect_uri" }, { status: 400, headers: CORS });
  const name = (typeof body?.client_name === "string" && body.client_name.trim() ? body.client_name.trim() : "AI agent").slice(0, 80);
  const clientId = newClientId();
  const { error } = await supabaseAdmin().from("oauth_clients").insert({ client_id: clientId, name, redirect_uris: uris });
  if (error) return Response.json({ error: "server_error" }, { status: 500, headers: CORS });
  return Response.json(
    { client_id: clientId, client_id_issued_at: Math.floor(now / 1000), client_name: name, redirect_uris: uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code"], response_types: ["code"] },
    { status: 201, headers: CORS },
  );
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "*" } });
}
