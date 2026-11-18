// AI on a kept contract (lib/contract-ai): POST {id, lang} writes the summary from the contract's own file and keeps it on
// the contract (ai_summary); POST {id, lang, question} answers a question about it (nothing kept). Owners and admins an
// owner did not limit (the contract box's rule); the contract and its file are read with the caller's own session, so
// the database decides. Sonnet reads the PDF / photo as it is.

import { adminCaller } from "@/lib/api-admin-server";
import { isAiLang } from "@/lib/ai-sheet";
import { cleanAnswer, cleanContractAi } from "@/lib/contract-ai";
import { askContract } from "@/lib/contract-ai-server";
import { contractFile } from "@/lib/contract-read-server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const who = await adminCaller({ full: true, perTenMinutes: 15, later: true });
  if (who instanceof Response) return who;
  const body = (await req.json().catch(() => null)) as { id?: unknown; lang?: unknown; question?: unknown } | null;
  const id = typeof body?.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, 500) : "";
  const lang = isAiLang(body?.lang) ? body.lang : "ja";
  if (!id) return Response.json({ error: "id" }, { status: 400 });
  const db = await supabaseServer();
  const { data: row } = await db.from("contracts").select("id, title, party, kind, start_on, end_on, auto_renew, notice_days, amount, note, file_path").eq("id", id).maybeSingle();
  if (!row) return Response.json({ error: "notFound" }, { status: 404 });
  if (!row.file_path) return Response.json({ error: "noFile" }, { status: 400 });
  const file = await contractFile(db, row.file_path as string);
  if (!file) return Response.json({ error: "noFile" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "noKey" }, { status: 503 });
  if (!who.spend()) return Response.json({ error: "rate" }, { status: 429 });

  const parsed = await askContract(file, row, lang, question, req.signal);
  if (question) {
    const a = parsed ? cleanAnswer(parsed) : null;
    return a ? Response.json({ answer: a }) : Response.json({ error: "failed" }, { status: 502 });
  }
  const summary = parsed ? cleanContractAi(parsed, row.file_path as string) : null;
  if (!summary) return Response.json({ error: "failed" }, { status: 502 });
  await db.from("contracts").update({ ai_summary: summary }).eq("id", id);
  return Response.json({ summary });
}
