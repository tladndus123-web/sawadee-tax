// The P&L's one-line AI conclusion (lib/pl-ai): the table sends its facts, Sonnet writes a headline and reasons; an answer
// with a figure not in the sheet is dropped. Admins. Nothing is saved.

import { adminCaller } from "@/lib/api-admin-server";
import { isAiLang } from "@/lib/ai-sheet";
import { askJson } from "@/lib/ai-json-server";
import { DEEP_MODEL } from "@/lib/assistant";
import { cleanConclusion, cleanPlSheet, PL_SCHEMA, plPrompt } from "@/lib/pl-ai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const who = await adminCaller({ full: false, perTenMinutes: 10, later: true });
  if (who instanceof Response) return who;
  const body = (await req.json().catch(() => null)) as { sheet?: unknown; lang?: unknown } | null;
  const sheet = cleanPlSheet(body?.sheet);
  if (!sheet) return Response.json({ error: "sheet" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "noKey" }, { status: 503 });
  if (!who.spend()) return Response.json({ error: "rate" }, { status: 429 });
  const lang = isAiLang(body?.lang) ? body.lang : "ja";
  const raw = await askJson({ model: DEEP_MODEL, system: plPrompt(lang), payload: sheet, schema: PL_SCHEMA, signal: req.signal });
  const conclusion = raw ? cleanConclusion(raw, sheet) : null;
  if (raw && !conclusion) console.error("[pl-insight] answer dropped:", JSON.stringify(raw).slice(0, 500));
  return conclusion ? Response.json({ conclusion }) : Response.json({ error: "failed" }, { status: 502 });
}
