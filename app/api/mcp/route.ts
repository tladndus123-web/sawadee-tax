// The books for a connected AI agent (Grok Bot, owner 2026-11-08): an MCP server over HTTP (lib/mcp.ts, tools in
// lib/bot-server.ts). The agent sends "Authorization: Bearer sk_sawa_…" — a key an owner made in settings
// (/api/bot-keys). Every call is limited per key; a wrong key gets 401 and nothing else.

import { appUrl } from "@/lib/app-url";
import { BOT_INFO, botTools, keyOwner } from "@/lib/bot-server";
import { handleBody } from "@/lib/mcp";
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
  if (!who) return json({ error: "A Sawadee TAX connection key is needed (Settings → Grok Bot)." }, 401);
  if (tooMany(who.id)) return json({ error: "Too many calls. Try again in a minute." }, 429);
  const body = await req.json().catch(() => undefined);
  const out = await handleBody(body, botTools(admin, appUrl()), BOT_INFO);
  return out === null ? new Response(null, { status: 202 }) : json(out);
}

// No server-sent stream: the agent gets every answer in the POST reply
export function GET() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
export function DELETE() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
