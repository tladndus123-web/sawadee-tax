// Server only: read a POS closing report (Z report) or a delivery app's sales summary with Claude.
// Same model and effort as the document reading (readingSetup). Returns one entry per day and channel (lib/sales-reading).

import Anthropic from "@anthropic-ai/sdk";
import { readingSetup, type SourceType } from "./extract-server";
import { parseSalesReply, type SalesReading } from "./sales-reading";

export type { SalesReading };

const PROMPT = `You are a bookkeeping assistant for a shop in Thailand. The attached file is a sales summary: usually a POS closing report (Z report / X report / สรุปยอดขาย / ปิดยอด / Daily Sales Report) of one day, or a delivery app summary (Grab Merchant, LINE MAN Wongnai, foodpanda, ShopeeFood, Robinhood) of one or more days.

Reply with ONLY one JSON object, no prose:
{"notReport": false, "entries": [{"date": "YYYY-MM-DD", "channel": "store" | "grab" | "lineman" | "foodpanda" | "shopee" | "robinhood" | "other", "docFrom": "", "docTo": "", "bills": 0, "gross": 0, "vat": 0, "exempt": 0, "confidence": "high" | "medium" | "low", "unclear": []}]}

Rules:
- One entry per business day and sales channel. Never count the same money twice.
- If a POS report breaks its sales down by delivery app (e.g. Grab / LINE MAN / foodpanda lines, or order types named after the apps), give one entry per app, and the "store" entry as the shop's own sales only (the total minus those app lines). With no such breakdown, give one "store" entry for the total.
- Payment methods (cash / เงินสด, card / บัตร, QR, PromptPay, transfer) are NOT channels: never split by them.
- A summary covering several days with a line per day: one entry per day. At most 31 entries.
- date: the business day the sales belong to. Gregorian; a Buddhist Era year (e.g. 2569) minus 543. Thai dates are day/month/year.
- channel: "store" for the shop's own POS sales; the delivery app's name otherwise.
- gross: sales INCLUDING VAT, after discounts and refunds/voids (ยอดขายสุทธิ / Net Sales / Grand Total). For a delivery app: the food sales BEFORE the platform's commission (GP).
- vat: the VAT amount printed for that entry (ภาษีมูลค่าเพิ่ม / VAT 7%). If none is printed for it, give null.
- exempt: sales without VAT (ยกเว้นภาษี / Non-VAT) if printed, else 0.
- docFrom / docTo: first and last receipt (abbreviated tax invoice) numbers of the day if printed (e.g. "ABB2609-0001"), else "".
- bills: number of receipts / bills / orders if printed, else 0.
- Numbers: plain numbers, no commas.
- unclear: field names you are unsure about.
- If the file is not a sales summary, reply {"notReport": true}.`;

let client: Anthropic | null = null;

export type SalesOutcome = { ok: true; readings: SalesReading[] } | { ok: false; code: "notReport" | "aiFail" | "busy"; status: number; detail?: string };


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
      { model, max_tokens: 8000, output_config: { effort }, messages: [{ role: "user", content: [source, { type: "text", text: PROMPT }] }] },
      { signal },
    );
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return { ok: false, code: "aiFail", status: 502, detail: `stop_reason=${res.stop_reason}` };
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Record<string, unknown>;
    const parsed = parseSalesReply(json);
    if (parsed.notReport) return { ok: false, code: "notReport", status: 422 };
    return { ok: true, readings: parsed.readings };
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) throw error;
    if (error instanceof SyntaxError) return { ok: false, code: "aiFail", status: 502, detail: "no JSON in reply" };
    return { ok: false, code: "busy", status: 503, detail: error instanceof Error ? error.message : String(error) };
  }
}
