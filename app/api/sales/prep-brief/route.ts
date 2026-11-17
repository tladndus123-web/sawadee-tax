// The AI prep brief (lib/prep-brief): the browser sends the sheet the program worked out (lib/prep-forecast), the model
// words it, and a reply with a figure not in the sheet is dropped (the screen then shows its own template). Admins, only
// while the restaurant extra "AI 재료 준비량 예측" is on. Nothing is saved.

import Anthropic from "@anthropic-ai/sdk";
import { adminCaller } from "@/lib/api-admin-server";
import { QUICK_MODEL } from "@/lib/assistant";
import { readFoodFeatures } from "@/lib/food-features";
import { BRIEF_SCHEMA, cleanBrief, cleanSheet, isBriefLang, prepSystemPrompt } from "@/lib/prep-brief";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

let client: Anthropic | null = null;

export async function POST(req: Request) {
  const who = await adminCaller({ full: false, perTenMinutes: 10, later: true });
  if (who instanceof Response) return who;
  const { data: settings } = await (await supabaseServer()).from("company_settings").select("extras").eq("id", 1).maybeSingle();
  if (!readFoodFeatures(settings?.extras).prep) return Response.json({ error: "off" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { sheet?: unknown; lang?: unknown } | null;
  const sheet = cleanSheet(body?.sheet);
  const lang = isBriefLang(body?.lang) ? body.lang : "ja";
  if (!sheet) return Response.json({ error: "sheet" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "noKey" }, { status: 503 });
  if (!who.spend()) return Response.json({ error: "rate" }, { status: 429 });
  try {
    client ??= new Anthropic({ maxRetries: 1, timeout: 45_000 });
    const res = await client.messages.create(
      {
        model: QUICK_MODEL,
        max_tokens: 600,
        output_config: { format: { type: "json_schema", schema: BRIEF_SCHEMA } },
        system: prepSystemPrompt(lang),
        messages: [{ role: "user", content: JSON.stringify(sheet) }],
      },
      { signal: req.signal },
    );
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const brief = cleanBrief(JSON.parse(text), sheet);
    return brief ? Response.json({ brief }) : Response.json({ error: "check" }, { status: 422 });
  } catch (e) {
    console.error("[prep-brief] failed", e instanceof Error ? e.message : e);
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
