// AI 신고 전 점검 (lib/tax-check): the tax hub sends the month's facts, Sonnet writes the check list, an answer with a
// figure not in the sheet is dropped. Admins (the hub's own rule: ledger + sales screens). Nothing is saved.

import { adminCaller } from "@/lib/api-admin-server";
import { isAiLang } from "@/lib/ai-sheet";
import { askJson } from "@/lib/ai-json-server";
import { DEEP_MODEL } from "@/lib/assistant";
import { cleanTaxCheck, cleanTaxSheet, TAX_CHECK_SCHEMA, taxCheckPrompt } from "@/lib/tax-check";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const who = await adminCaller({ full: false, perTenMinutes: 10, later: true });
  if (who instanceof Response) return who;
  const body = (await req.json().catch(() => null)) as { sheet?: unknown; lang?: unknown } | null;
  const sheet = cleanTaxSheet(body?.sheet);
  if (!sheet) return Response.json({ error: "sheet" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "noKey" }, { status: 503 });
  if (!who.spend()) return Response.json({ error: "rate" }, { status: 429 });
  const lang = isAiLang(body?.lang) ? body.lang : "ja";
  const raw = await askJson({ model: DEEP_MODEL, system: taxCheckPrompt(lang), payload: sheet, schema: TAX_CHECK_SCHEMA, signal: req.signal });
  const check = raw ? cleanTaxCheck(raw, sheet) : null;
  // A dropped answer is logged (which figure was not in the sheet) so the prompt can be tuned; no books data beyond it
  if (raw && !check) console.error("[tax-check] answer dropped:", JSON.stringify(raw).slice(0, 600));
  return check ? Response.json({ check }) : Response.json({ error: "failed" }, { status: 502 });
}
