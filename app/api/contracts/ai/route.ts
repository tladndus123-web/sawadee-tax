// AI on a kept contract (lib/contract-ai): POST {id, lang} writes the summary from the contract's own file and keeps it on
// the contract (ai_summary); POST {id, lang, question} answers a question about it (nothing kept). Owners and admins an
// owner did not limit (the contract box's rule); the contract and its file are read with the caller's own session, so
// the database decides. Sonnet reads the PDF / photo as it is.

import Anthropic from "@anthropic-ai/sdk";
import { adminCaller } from "@/lib/api-admin-server";
import { isAiLang } from "@/lib/ai-sheet";
import { DEEP_MODEL } from "@/lib/assistant";
import { cleanAnswer, cleanContractAi, CONTRACT_ANSWER_SCHEMA, CONTRACT_AI_SCHEMA, contractQuestionPrompt, contractSummaryPrompt } from "@/lib/contract-ai";
import { contractFile } from "@/lib/contract-read-server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

let client: Anthropic | null = null;

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

  const data = file.buf.toString("base64");
  const source =
    file.type === "application/pdf"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
      : { type: "image" as const, source: { type: "base64" as const, media_type: file.type, data } };
  const saved = `What the owner saved about it: ${JSON.stringify({ title: row.title, party: row.party, kind: row.kind, start: row.start_on, end: row.end_on, autoRenew: row.auto_renew, noticeDays: row.notice_days, note: row.note })}`;
  try {
    client ??= new Anthropic({ maxRetries: 1, timeout: 110_000 });
    const res = await client.messages.create(
      {
        model: DEEP_MODEL,
        max_tokens: question ? 1200 : 3000,
        output_config: { effort: "low", format: { type: "json_schema", schema: question ? CONTRACT_ANSWER_SCHEMA : CONTRACT_AI_SCHEMA } },
        system: question ? contractQuestionPrompt(lang) : contractSummaryPrompt(lang),
        messages: [{ role: "user", content: [source, { type: "text", text: question ? `${saved}\n\nQuestion: ${question}` : saved }] }],
      },
      { signal: req.signal },
    );
    const parsed = JSON.parse(res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""));
    if (question) {
      const a = cleanAnswer(parsed);
      return a ? Response.json({ answer: a }) : Response.json({ error: "failed" }, { status: 502 });
    }
    const summary = cleanContractAi(parsed, row.file_path as string);
    if (!summary) return Response.json({ error: "failed" }, { status: 502 });
    await db.from("contracts").update({ ai_summary: summary }).eq("id", id);
    return Response.json({ summary });
  } catch (e) {
    console.error("[contracts-ai] failed", e instanceof Error ? e.message : e);
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
