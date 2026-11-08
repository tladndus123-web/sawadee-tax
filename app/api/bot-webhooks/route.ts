// Where the books send events to Grok Bot (owners only): a routine's webhook URL + key pasted in settings.
//   GET     the hooks (name, host, made, last send and its status) — never the key
//   POST    { name, url, key } → adds one (at most 3)
//   PUT     { id } → sends a test event there and answers with the status
//   DELETE  { id } → removes it
import { testEvent } from "@/lib/bot-events-server";
import { appUrl } from "@/lib/app-url";
import { ownerOf } from "@/lib/owner-server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const fail = (error: string, status: number) => Response.json({ error }, { status });
const isId = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function GET() {
  if (!(await ownerOf())) return fail("forbidden", 403);
  const { data, error } = await supabaseAdmin().from("bot_webhooks").select("id, name, url, created_at, last_sent_at, last_status").order("created_at");
  if (error) return fail(error.message, 502);
  return Response.json({ hooks: (data ?? []).map((h) => ({ ...h, url: undefined, host: new URL(h.url as string).host })) });
}

export async function POST(req: Request) {
  const me = await ownerOf();
  if (!me) return fail("forbidden", 403);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const url = String(b.url ?? "").trim();
  const key = String(b.key ?? "").trim();
  const name = String(b.name ?? "Grok Bot").trim().slice(0, 60) || "Grok Bot";
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return fail("url", 400);
  }
  if (u.protocol !== "https:" || url.length > 500) return fail("url", 400);
  if (key.length < 8 || key.length > 300 || /\s/.test(key)) return fail("key", 400);
  const admin = supabaseAdmin();
  const { count } = await admin.from("bot_webhooks").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= 3) return fail("tooMany", 409);
  const { data, error } = await admin.from("bot_webhooks").insert({ name, url, key, created_by: me.id }).select("id, name, created_at").single();
  if (error) return fail(error.message, 502);
  return Response.json({ hook: { ...data, host: u.host, last_sent_at: null, last_status: null } });
}

export async function PUT(req: Request) {
  if (!(await ownerOf())) return fail("forbidden", 403);
  const b = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (!isId(b.id)) return fail("bad", 400);
  const admin = supabaseAdmin();
  const { data: h } = await admin.from("bot_webhooks").select("id, url, key").eq("id", b.id as string).maybeSingle();
  if (!h) return fail("bad", 404);
  // Only this hook: a one-row copy of sendBotEvent's loop
  let status = 0;
  try {
    const r = await fetch(h.url as string, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${h.key as string}`, "user-agent": "SawadeeTAX/1.0" }, body: JSON.stringify({ source: "Sawadee TAX", at: new Date().toISOString(), ...testEvent(appUrl()), text: testEvent(appUrl()).lines.join("\n") }), signal: AbortSignal.timeout(8000), redirect: "manual" });
    status = r.status;
  } catch {
    status = -1;
  }
  await admin.from("bot_webhooks").update({ last_sent_at: new Date().toISOString(), last_status: status }).eq("id", h.id);
  return Response.json({ status, ok: status >= 200 && status < 300 });
}

export async function DELETE(req: Request) {
  if (!(await ownerOf())) return fail("forbidden", 403);
  const b = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (!isId(b.id)) return fail("bad", 400);
  const { error } = await supabaseAdmin().from("bot_webhooks").delete().eq("id", b.id as string);
  if (error) return fail(error.message, 502);
  return Response.json({ ok: true });
}


