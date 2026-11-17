// AI 결재 도우미 (lib/claim-review): the expenses screen sends the claims waiting for a decision; the model gives each a
// verdict and a reason. An answer with a figure not in the sheet is dropped. Admins. Nothing is saved or decided here —
// approving stays the admin's tap.

import { adminCaller } from "@/lib/api-admin-server";
import { isAiLang } from "@/lib/ai-sheet";
import { askJson } from "@/lib/ai-json-server";
import { QUICK_MODEL } from "@/lib/assistant";
import { CLAIM_REVIEW_SCHEMA, claimReviewPrompt, cleanClaimReview, cleanClaimSheet } from "@/lib/claim-review";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const who = await adminCaller({ full: false, perTenMinutes: 10, later: true });
  if (who instanceof Response) return who;
  const body = (await req.json().catch(() => null)) as { sheet?: unknown; lang?: unknown } | null;
  const sheet = cleanClaimSheet(body?.sheet);
  if (!sheet) return Response.json({ error: "sheet" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "noKey" }, { status: 503 });
  if (!who.spend()) return Response.json({ error: "rate" }, { status: 429 });
  const lang = isAiLang(body?.lang) ? body.lang : "ja";
  const raw = await askJson({ model: QUICK_MODEL, system: claimReviewPrompt(lang), payload: sheet, schema: CLAIM_REVIEW_SCHEMA, signal: req.signal });
  const review = raw ? cleanClaimReview(raw, sheet) : null;
  if (!review) console.warn("[expenses/review] answer dropped", raw ? "numbers or shape" : "no answer");
  return review ? Response.json({ review }) : Response.json({ error: "failed" }, { status: 502 });
}
