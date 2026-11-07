// An AI agent sends the owner here to sign in: the request is checked, then the owner sees our "허용" page
// (/{locale}/connect, signed in as usual). Nothing is granted on this step.
import { cookies } from "next/headers";
import { routing } from "@/i18n/routing";
import { readAuthRequest, withParams } from "@/lib/oauth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const r = readAuthRequest(q);
  if ("error" in r) return new Response(`Sign-in request refused: ${r.error}`, { status: 400 });
  const { data: client } = await supabaseAdmin().from("oauth_clients").select("redirect_uris").eq("client_id", r.clientId).maybeSingle();
  if (!client) return new Response("Sign-in request refused: unknown client", { status: 400 });
  if (!(client.redirect_uris as string[]).includes(r.redirectUri)) return new Response("Sign-in request refused: redirect_uri was not registered", { status: 400 });
  const saved = (await cookies()).get("NEXT_LOCALE")?.value ?? "";
  const locale = (routing.locales as readonly string[]).includes(saved) ? saved : routing.defaultLocale;
  const page = new URL(`/${locale}/connect`, req.url);
  return Response.redirect(withParams(page.toString(), { client_id: r.clientId, redirect_uri: r.redirectUri, code_challenge: r.challenge, state: r.state }), 302);
}
