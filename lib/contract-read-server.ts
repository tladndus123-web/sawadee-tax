// A contract read by the AI (lib/contract-read): the same model and client pattern as the calendar reading
// (lib/calendar-read-server: readingSetup().model, a PDF as a document block, a JSON answer). Used by
// /api/contracts/read (the app: the file is already in the contracts folder, so a long scan never passes through the
// request body — Vercel's limit is 4.5 MB) and by the LINE bot's contract mode. Server only.

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONTRACT_READ_SCHEMA, type ContractReading, cleanContractReading, contractSystemPrompt, type ReadLang } from "./contract-read";
import { type ContractFileType, isContractPath, MAX_FILE_BYTES, typeOfPath } from "./contracts";
import { readingSetup } from "./extract-server";

let client: Anthropic | null = null;

export type ContractReadOutcome = { ok: true; reading: ContractReading; model: string } | { ok: false; code: "noKey" | "none" | "failed" };

/** A contract's file from the contracts folder, read with the given client (the caller's session: admins only) */
export async function contractFile(db: SupabaseClient, path: string): Promise<{ buf: Buffer; type: ContractFileType } | null> {
  const type = typeOfPath(path);
  if (!isContractPath(path) || !type) return null;
  const { data, error } = await db.storage.from("documents").download(path);
  if (error || !data || data.size > MAX_FILE_BYTES) return null;
  return { buf: Buffer.from(await data.arrayBuffer()), type };
}

export async function readContract(file: { buf: Buffer; type: ContractFileType }, lang: ReadLang, today: string, signal?: AbortSignal): Promise<ContractReadOutcome> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, code: "noKey" };
  const model = readingSetup().model;
  try {
    client ??= new Anthropic({ maxRetries: 1, timeout: 180_000 });
    const data = file.buf.toString("base64");
    const source =
      file.type === "application/pdf"
        ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
        : { type: "image" as const, source: { type: "base64" as const, media_type: file.type, data } };
    const res = await client.messages.create(
      {
        model,
        max_tokens: 3000,
        output_config: { effort: "low", format: { type: "json_schema", schema: CONTRACT_READ_SCHEMA } },
        system: contractSystemPrompt(lang, today),
        messages: [{ role: "user", content: [source, { type: "text", text: "Fill in the register for this contract." }] }],
      },
      { signal },
    );
    if (res.stop_reason !== "end_turn") return { ok: false, code: "failed" };
    const reading = cleanContractReading(JSON.parse(res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")));
    return reading ? { ok: true, reading, model } : { ok: false, code: "none" };
  } catch (e) {
    if (signal?.aborted) throw e;
    console.error("[contract] reading failed:", e instanceof Error ? e.message : e);
    return { ok: false, code: "failed" };
  }
}
