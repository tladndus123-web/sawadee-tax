// The books for a connected AI agent (Grok Bot, owner 2026-11-08): an MCP server over HTTP (lib/mcp.ts, tools in
// lib/bot-server.ts). The agent sends "Authorization: Bearer sk_sawa_…" — a key an owner made in settings
// (/api/bot-keys). Every call is limited per key; a wrong key gets 401 and nothing else.

import { appUrl } from "@/lib/app-url";
import { BOT_INFO, botTools, keyOwner } from "@/lib/bot-server";
import { connectorIcons, handleBody } from "@/lib/mcp";
import { originOf } from "@/lib/owner-server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const LIMIT = 60;
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();
function tooMany(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > LIMIT;
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  const admin = supabaseAdmin();
  const who = await keyOwner(admin, req.headers.get("authorization"));
  // No key: the header tells an MCP client where to sign in (lib/oauth, the owner's "허용" page)
  if (!who)
    return Response.json(
      { error: "A Sawadee TAX connection is needed: sign in, or a key from Settings → Grok Bot." },
      { status: 401, headers: { "cache-control": "no-store", "www-authenticate": `Bearer resource_metadata="${originOf(req)}/.well-known/oauth-protected-resource"` } },
    );
  if (tooMany(who.id)) return json({ error: "Too many calls. Try again in a minute." }, 429);
  const body = await req.json().catch(() => undefined);
  const origin = originOf(req);
  const info = { ...BOT_INFO, title: "Sawadee TAX", websiteUrl: origin, icons: connectorIcons(origin) };
  const out = await handleBody(body, botTools(admin, appUrl(), undefined, who), info);
  return out === null ? new Response(null, { status: 202 }) : json(out);
}

// No server-sent stream: the agent gets every answer in the POST reply
export function GET() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
export function DELETE() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
