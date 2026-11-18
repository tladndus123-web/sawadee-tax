// AI search (lib/ai-search): a sentence → a ledger filter (Haiku sees only the sentence, today and the category names) →
// the documents read with the caller's own session (RLS: branches kept out, staff rules), newest first, at most 30, with
// their count and total. Any signed-in member; 15 searches in 10 minutes per person.

import { isAiLang } from "@/lib/ai-sheet";
import { askJson } from "@/lib/ai-json-server";
import { cleanFilter, SEARCH_SCHEMA, searchPrompt, triIlike } from "@/lib/ai-search";
import { QUICK_MODEL } from "@/lib/assistant";
import { endIfExpired } from "@/lib/auth/session-guard";
import { supabaseServer } from "@/lib/supabase/server";
import { todayBangkok } from "@/lib/thai-tax";
import { CATEGORIES } from "@/lib/types";
import { allRows } from "@/lib/fetch-all";

export const runtime = "nodejs";
export const maxDuration = 60;

const hits = new Map<string, number[]>();

export async function POST(req: Request) {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user || (await endIfExpired(db))) return Response.json({ error: "signin" }, { status: 401 });
  const { data: member } = await db.from("members").select("user_id, disabled_at").eq("user_id", user.id).maybeSingle();
  if (!member || member.disabled_at) return Response.json({ error: "signin" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { q?: unknown; lang?: unknown; branch?: unknown } | null;
  // The branch the person works in (the screens' choice); none = every branch they may see
  const branch = typeof body?.branch === "string" && /^[0-9a-f-]{36}$/i.test(body.branch) ? body.branch : null;
  const q = typeof body?.q === "string" ? body.q.trim().slice(0, 200) : "";
  if (q.length < 2) return Response.json({ error: "q" }, { status: 400 });
  const now = Date.now();
  const recent = (hits.get(user.id) ?? []).filter((t) => now - t < 600_000);
  if (recent.length >= 15) return Response.json({ error: "rate" }, { status: 429 });
  hits.set(user.id, [...recent, now]);
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "noKey" }, { status: 503 });

  const lang = isAiLang(body?.lang) ? body.lang : "ja";
  const { data: own } = await db.from("categories").select("key, name");
  const cats = [
    ...CATEGORIES.map((k) => ({ key: k as string, name: k as string })),
    ...((own ?? []) as { key: string; name: Record<string, string> | null }[]).filter((c) => !(CATEGORIES as readonly string[]).includes(c.key)).map((c) => ({ key: c.key, name: c.name?.en || c.name?.th || c.name?.ja || c.key })),
  ];
  const today = todayBangkok();
  const raw = await askJson({ model: QUICK_MODEL, system: searchPrompt(today, lang, cats), payload: { search: q }, schema: SEARCH_SCHEMA, maxTokens: 600, signal: req.signal });
  const f = raw ? cleanFilter(raw, cats.map((c) => c.key)) : null;
  if (!f) return Response.json({ error: "none" }, { status: 422 });

  // A question that needs thinking: the screen hands it to the AI assistant
  if (f.kind === "ask") return Response.json({ filter: f, ask: true });
  // Sales of a period (no dates = this month): the same "sales without VAT" as the dashboard and the P&L
  if (f.kind === "sales") {
    const from = f.from || `${today.slice(0, 7)}-01`;
    const to = f.to || today;
    const { data: rows, error: sErr } = await allRows<{ sale_date: string; gross: number; vat: number }>(() => {
      let sq = db.from("sales").select("id, sale_date, gross, vat").gte("sale_date", from).lte("sale_date", to);
      if (branch) sq = sq.eq("branch_id", branch);
      return sq;
    });
    if (sErr || !rows) {
      console.error("[search-ai] sales", sErr instanceof Error ? sErr.message : sErr);
      return Response.json({ error: "failed" }, { status: 502 });
    }
    const sat = (n: number) => Math.round((Number(n) || 0) * 100);
    const gross = rows.reduce((a, r) => a + sat(r.gross), 0);
    const vat = rows.reduce((a, r) => a + sat(r.vat), 0);
    return Response.json({ filter: { ...f, from, to }, sales: { from, to, value: (gross - vat) / 100, gross: gross / 100, days: new Set(rows.map((r) => r.sale_date)).size } });
  }

  let query = db
    .from("documents")
    .select(f.item ? "id, doc_no, doc_date, seller, net, paid, document_items!inner(desc)" : "id, doc_no, doc_date, seller, net, paid", { count: "exact" })
    .is("deleted_at", null)
    .neq("status", "draft");
  if (branch) query = query.eq("branch_id", branch);
  if (f.from) query = query.gte("doc_date", f.from);
  if (f.to) query = query.lte("doc_date", f.to);
  if (f.seller) query = query.or(triIlike("seller->name", f.seller));
  if (f.item) query = query.or(triIlike("desc", f.item), { referencedTable: "document_items" });
  if (f.category) query = query.eq("category", f.category);
  if (f.minAmount !== null) query = query.gte("net", f.minAmount);
  if (f.maxAmount !== null) query = query.lte("net", f.maxAmount);
  if (f.paid !== "any") query = query.eq("paid", f.paid === "paid");
  if (f.docNo) query = query.ilike("doc_no", `*${f.docNo}*`);
  const { data, count, error } = await query.order("doc_date", { ascending: false, nullsFirst: false }).limit(30);
  if (error) {
    console.error("[search-ai] query", error.message);
    return Response.json({ error: "failed" }, { status: 502 });
  }
  const docs = ((data ?? []) as unknown as { id: string; doc_no: string; doc_date: string | null; seller: { name?: Record<string, string> } | null; net: number; paid: boolean }[]).map((d) => ({
    id: d.id,
    docNo: d.doc_no,
    date: d.doc_date,
    seller: d.seller?.name ?? {},
    net: Number(d.net) || 0,
    paid: d.paid,
  }));
  return Response.json({ filter: f, docs, count: count ?? docs.length, shownTotal: Math.round(docs.reduce((a, d) => a + d.net, 0) * 100) / 100 });
}
