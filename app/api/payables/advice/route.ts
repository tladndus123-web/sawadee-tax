// AI 지급 순서 추천 (lib/pay-advice): the "to pay" screen sends its bills, the model says what to pay first and which
// bills to pick; an answer with a figure not in the sheet is dropped. Admins. Nothing is saved.

import { adminCaller } from "@/lib/api-admin-server";
import { isAiLang } from "@/lib/ai-sheet";
import { askJson } from "@/lib/ai-json-server";
import { QUICK_MODEL } from "@/lib/assistant";
import { cleanPayAdvice, cleanPaySheet, PAY_ADVICE_SCHEMA, payAdvicePrompt } from "@/lib/pay-advice";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const who = await adminCaller({ full: false, perTenMinutes: 10, later: true });
  if (who instanceof Response) return who;
  const body = (await req.json().catch(() => null)) as { sheet?: unknown; lang?: unknown } | null;
  const sheet = cleanPaySheet(body?.sheet);
  if (!sheet) return Response.json({ error: "sheet" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "noKey" }, { status: 503 });
  if (!who.spend()) return Response.json({ error: "rate" }, { status: 429 });
  const lang = isAiLang(body?.lang) ? body.lang : "ja";
  const raw = await askJson({ model: QUICK_MODEL, system: payAdvicePrompt(lang), payload: sheet, schema: PAY_ADVICE_SCHEMA, signal: req.signal });
  const advice = raw ? cleanPayAdvice(raw, sheet) : null;
  return advice ? Response.json({ advice }) : Response.json({ error: "failed" }, { status: 502 });
}
