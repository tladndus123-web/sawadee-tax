// Server only: translate document fields typed in one language into the other two (Thai / English / Japanese).
// Same model as the reading (readingSetup), effort "low": short fields, a few cents per save at most.

import Anthropic from "@anthropic-ai/sdk";
import { readingSetup } from "./extract-server";
import { FORM_LANGS, type FormLang } from "./types";

export type TranslateItem = { from: FormLang; text: string; to: FormLang[] };
export type TranslateResult = Partial<Record<FormLang, string>>;

export const MAX_TRANSLATE_ITEMS = 80;
export const MAX_TRANSLATE_CHARS = 500;

const NAMES: Record<FormLang, string> = { th: "Thai", en: "English", ja: "Japanese" };

const RULES = `You translate fields of a purchase document (tax invoice / receipt) for a company in Thailand's bookkeeping app.
Rules:
- Company and person names: transliterate by sound (katakana for Japanese, romanised for English); keep the legal form (บริษัท … จำกัด = Co., Ltd. = 株式会社, ห้างหุ้นส่วนจำกัด = Limited Partnership = 有限パートナーシップ). If the source already contains an official English name, use it.
- Addresses: the natural address style of each language; keep numbers, postcodes and codes exactly.
- Goods, units and notes: short, plain wording as printed on an invoice.
- Never add explanations. Keep every number, code, date and amount unchanged.
Reply with a JSON object {"items":[{"th":"","en":"","ja":""}, …]}, one entry per input in the same order; fill only the requested languages (others may be empty strings).`;

let client: Anthropic | null = null;

export async function translateFields(items: TranslateItem[], signal?: AbortSignal): Promise<TranslateResult[] | null> {
  if (!items.length) return [];
  client ??= new Anthropic({ maxRetries: 2 });
  const { model } = readingSetup();
  const list = items.map((it, i) => `${i + 1}. [${NAMES[it.from]} → ${it.to.map((l) => NAMES[l]).join(", ")}] ${it.text}`).join("\n");
  const response = await client.messages.create(
    {
      model,
      max_tokens: 8000,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: `${RULES}\n\nFields:\n${list}` }],
    },
    { signal },
  );
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    const parsed = JSON.parse(json) as { items?: unknown };
    if (!Array.isArray(parsed.items)) return null;
    return items.map((it, i) => {
      const r = (parsed.items as Record<string, unknown>[])[i] ?? {};
      const out: TranslateResult = {};
      for (const l of it.to) if (typeof r[l] === "string") out[l] = r[l] as string;
      return out;
    });
  } catch {
    return null;
  }
}

/** Checks the request body: a list of {from, text, to} within the limits, or null */
export function parseTranslateBody(body: unknown): TranslateItem[] | null {
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_TRANSLATE_ITEMS) return null;
  const isLang = (x: unknown): x is FormLang => (FORM_LANGS as readonly unknown[]).includes(x);
  const out: TranslateItem[] = [];
  for (const it of items as Record<string, unknown>[]) {
    const to = Array.isArray(it?.to) ? it.to.filter(isLang) : [];
    if (!isLang(it?.from) || typeof it.text !== "string" || !it.text.trim() || it.text.length > MAX_TRANSLATE_CHARS || !to.length) return null;
    out.push({ from: it.from, text: it.text, to: to.filter((l) => l !== it.from) });
  }
  return out;
}
