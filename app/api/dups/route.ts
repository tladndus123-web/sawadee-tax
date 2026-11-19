// The duplicates popup (lib/dup-notice, components/layout/TwiceNotice): GET = the possible duplicates nobody marked
// "문제없음", worked out here so the browser gets a short list instead of every document and sales line; POST {keys} =
// "문제없음" — those duplicates are fine, nobody is asked about them again. Admins; the books are read with the caller's
// own session, so branches they are kept out of stay out.

import { endIfExpired } from "@/lib/auth/session-guard";
import { type DupDocRow, dupNotice } from "@/lib/dup-notice";
import { allRows } from "@/lib/fetch-all";
import { CHANNELS, type Channel, type Sale } from "@/lib/sales";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function admin() {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user || (await endIfExpired(db))) return null;
  const { data: me } = await db.from("members").select("role, disabled_at").eq("user_id", user.id).maybeSingle();
  return me && !me.disabled_at && me.role === "admin" ? db : null;
}

type SaleRow = { id: string; branch_id: string | null; sale_date: string; channel: string; doc_from: string | null; doc_to: string | null; bills: number | null; gross: number | string; vat: number | string };

export async function GET() {
  const db = await admin();
  if (!db) return Response.json({ error: "signin" }, { status: 401 });
  const [docs, sales, acks] = await Promise.all([
    allRows<DupDocRow>(() => db.from("documents").select("id, tax:seller->>taxId, doc_no, doc_date, net, created_at").is("deleted_at", null).eq("status", "reviewed")),
    allRows<SaleRow>(() => db.from("sales").select("id, branch_id, sale_date, channel, doc_from, doc_to, bills, gross, vat")),
    allRows<{ key: string }>(() => db.from("dup_acks").select("key"), "key"),
  ]);
  if (docs.error || sales.error || acks.error) return Response.json({ error: "failed" }, { status: 502 });
  const lines: Sale[] = (sales.data ?? []).map((r) => ({
    id: r.id,
    branchId: r.branch_id ?? "",
    date: r.sale_date,
    channel: (CHANNELS as readonly string[]).includes(r.channel) ? (r.channel as Channel) : "other",
    docFrom: r.doc_from ?? "",
    docTo: r.doc_to ?? "",
    bills: Number(r.bills) || 0,
    gross: Number(r.gross) || 0,
    vat: Number(r.vat) || 0,
    exempt: 0,
    note: "",
    photoPath: null,
    source: "photo",
  }));
  const notice = dupNotice(docs.data ?? [], lines, new Set((acks.data ?? []).map((a) => a.key)));
  return Response.json(notice, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const db = await admin();
  if (!db) return Response.json({ error: "signin" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { keys?: unknown } | null;
  const keys = (Array.isArray(body?.keys) ? body.keys : []).filter((k): k is string => typeof k === "string" && /^(doc|sale):/.test(k) && k.length <= 2000).slice(0, 200);
  if (!keys.length) return Response.json({ error: "keys" }, { status: 400 });
  const { error } = await db.from("dup_acks").upsert(
    keys.map((key) => ({ key })),
    { onConflict: "key", ignoreDuplicates: true },
  );
  if (error) return Response.json({ error: "failed" }, { status: 502 });
  return Response.json({ ok: true });
}
