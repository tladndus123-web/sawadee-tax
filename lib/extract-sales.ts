// Server only: read a POS closing report (Z report) or a delivery app's sales summary with Claude.
// Same model and effort as the document reading (readingSetup). Returns one day of one channel.

import Anthropic from "@anthropic-ai/sdk";
import { readingSetup, type SourceType } from "./extract-server";
import { CHANNELS, type Channel } from "./sales";

export type SalesReading = {
  date: string;
  channel: Channel;
  docFrom: string;
  docTo: string;
  bills: number;
  gross: number;
  vat: number;
  exempt: number;
  confidence: "high" | "medium" | "low";
  unclear: string[];
};

const PROMPT = `You are a bookkeeping assistant for a shop in Thailand. The attached file is a sales summary of ONE day: usually a POS closing report (Z report / X report / สรุปยอดขาย / ปิดยอด / Daily Sales Report), or a delivery app summary (Grab Merchant, LINE MAN Wongnai, foodpanda, ShopeeFood, Robinhood).

Reply with ONLY one JSON object, no prose:
{"notReport": false, "date": "YYYY-MM-DD", "channel": "store" | "grab" | "lineman" | "foodpanda" | "shopee" | "robinhood" | "other", "docFrom": "", "docTo": "", "bills": 0, "gross": 0, "vat": 0, "exempt": 0, "confidence": "high" | "medium" | "low", "unclear": []}

Rules:
- date: the business day the sales belong to. Gregorian; a Buddhist Era year (e.g. 2569) minus 543. Thai dates are day/month/year.
- channel: "store" for a shop POS; the delivery app's name otherwise.
- gross: total sales INCLUDING VAT, after discounts and refunds/voids (ยอดขายสุทธิ / Net Sales / Grand Total). For a delivery app: the food sales total BEFORE the platform's commission (GP).
- vat: the VAT amount printed (ภาษีมูลค่าเพิ่ม / VAT 7%). If none is printed, give gross × 7 / 107 rounded to 2 decimals and add "vat" to unclear.
- exempt: sales without VAT (ยกเว้นภาษี / Non-VAT) if printed, else 0.
- docFrom / docTo: first and last receipt (abbreviated tax invoice) numbers of the day if printed (e.g. "ABB2609-0001"), else "".
- bills: number of receipts / bills / orders if printed, else 0.
- Numbers: plain numbers, no commas.
- unclear: field names you are unsure about.
- If the file is not a sales summary, reply {"notReport": true}.`;

let client: Anthropic | null = null;

export type SalesOutcome = { ok: true; reading: SalesReading } | { ok: false; code: "notReport" | "aiFail" | "busy"; status: number; detail?: string };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v * 100) / 100) : Number(String(v ?? "").replace(/,/g, "")) || 0);

export async function readSalesReport(file: Buffer, type: SourceType, signal?: AbortSignal): Promise<SalesOutcome> {
  client ??= new Anthropic({ maxRetries: 2 });
  const { model, effort } = readingSetup();
  const data = file.toString("base64");
  const source: Anthropic.ContentBlockParam =
    type === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: type, data } };
  try {
    const res = await client.messages.create(
      { model, max_tokens: 4000, output_config: { effort }, messages: [{ role: "user", content: [source, { type: "text", text: PROMPT }] }] },
      { signal },
    );
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return { ok: false, code: "aiFail", status: 502, detail: `stop_reason=${res.stop_reason}` };
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Record<string, unknown>;
    if (json.notReport === true) return { ok: false, code: "notReport", status: 422 };
    const date = typeof json.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(json.date) ? json.date : "";
    const channel = (CHANNELS as readonly string[]).includes(String(json.channel)) ? (json.channel as Channel) : "store";
    const reading: SalesReading = {
      date,
      channel,
      docFrom: String(json.docFrom ?? "").trim(),
      docTo: String(json.docTo ?? "").trim(),
      bills: Math.round(num(json.bills)),
      gross: num(json.gross),
      vat: num(json.vat),
      exempt: num(json.exempt),
      confidence: json.confidence === "high" || json.confidence === "low" ? json.confidence : "medium",
      unclear: Array.isArray(json.unclear) ? json.unclear.map(String) : [],
    };
    if (!date) reading.unclear.push("date");
    return { ok: true, reading };
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) throw error;
    if (error instanceof SyntaxError) return { ok: false, code: "aiFail", status: 502, detail: "no JSON in reply" };
    return { ok: false, code: "busy", status: 503, detail: error instanceof Error ? error.message : String(error) };
  }
}
