// A delivery-app settlement read by the AI (lib/settlement-read explains it): a PDF or photo goes to the model as is; the
// app's CSV / Excel export is turned into text first (lib/pos-read-server), at most 400 rows. Same model and client
// pattern as the other readers (readingSetup, one retry, a time limit, a JSON answer). Server only.

import Anthropic from "@anthropic-ai/sdk";
import { readingSetup } from "./extract-server";
import { readPosBuffer } from "./pos-read-server";
import { cleanSettlement, type Settlement, SETTLEMENT_SCHEMA, settlementSystemPrompt } from "./settlement-read";

export type SettlementFile = { buf: Buffer; type: "application/pdf" | "image/jpeg" | "image/png" | "image/webp" } | { buf: Buffer; sheet: string };
export type SettlementOutcome = { ok: true; settlement: Settlement } | { ok: false; code: "noKey" | "none" | "failed" };

let client: Anthropic | null = null;

/** A spreadsheet / CSV export as tab-separated text the model can read (first 400 rows) */
export async function sheetText(buf: Buffer, fileName: string): Promise<string | null> {
  const rows = await readPosBuffer(buf, fileName).catch(() => null);
  if (!rows?.length) return null;
  return rows
    .slice(0, 400)
    .map((r) => r.map((c) => String(c ?? "").replace(/\s+/g, " ").trim()).join("\t"))
    .join("\n")
    .slice(0, 60_000);
}

export async function readSettlement(file: SettlementFile, today: string, signal?: AbortSignal): Promise<SettlementOutcome> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, code: "noKey" };
  try {
    client ??= new Anthropic({ maxRetries: 1, timeout: 180_000 });
    const content: Anthropic.ContentBlockParam[] =
      "sheet" in file
        ? [{ type: "text", text: `The app's export, tab-separated:\n\n${file.sheet}` }]
        : file.type === "application/pdf"
          ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: file.buf.toString("base64") } }]
          : [{ type: "image", source: { type: "base64", media_type: file.type, data: file.buf.toString("base64") } }];
    const res = await client.messages.create(
      {
        model: readingSetup().model,
        max_tokens: 2000,
        output_config: { effort: "low", format: { type: "json_schema", schema: SETTLEMENT_SCHEMA } },
        system: settlementSystemPrompt(today),
        messages: [{ role: "user", content: [...content, { type: "text", text: "Read this settlement." }] }],
      },
      { signal },
    );
    if (res.stop_reason !== "end_turn") return { ok: false, code: "failed" };
    const s = cleanSettlement(JSON.parse(res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")));
    return s ? { ok: true, settlement: s } : { ok: false, code: "none" };
  } catch (e) {
    if (signal?.aborted) throw e;
    console.error("[settlement] reading failed", e instanceof Error ? e.message : e);
    return { ok: false, code: "failed" };
  }
}
