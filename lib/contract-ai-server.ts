// Claude on a contract's own file (lib/contract-ai): the summary (kept on the contract as ai_summary) or the answer to a
// question. Used by /api/contracts/ai (a tap in the contract box) and by LINE (a contract sent on LINE gets its summary
// at once, owner 2026-11-18: "라인으로 보내면 분석해서 자동으로 넣어 주면 돼"). Sonnet reads the PDF / photo as it is.

import Anthropic from "@anthropic-ai/sdk";
import type { AiLang } from "./ai-sheet";
import { DEEP_MODEL } from "./assistant";
import type { ContractFileType } from "./contracts";
import { CONTRACT_ANSWER_SCHEMA, CONTRACT_AI_SCHEMA, contractQuestionPrompt, contractSummaryPrompt } from "./contract-ai";

let client: Anthropic | null = null;

export interface ContractFacts {
  title: unknown;
  party: unknown;
  kind: unknown;
  start_on: unknown;
  end_on: unknown;
  auto_renew: unknown;
  notice_days: unknown;
  note: unknown;
}

/** The model's JSON (summary, or answer when `question` is given); null when it failed. Throws only on abort. */
export async function askContract(file: { buf: Buffer; type: ContractFileType }, row: ContractFacts, lang: AiLang, question: string, signal?: AbortSignal): Promise<unknown> {
  const data = file.buf.toString("base64");
  const source =
    file.type === "application/pdf"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
      : { type: "image" as const, source: { type: "base64" as const, media_type: file.type, data } };
  const saved = `What the owner saved about it: ${JSON.stringify({ title: row.title, party: row.party, kind: row.kind, start: row.start_on, end: row.end_on, autoRenew: row.auto_renew, noticeDays: row.notice_days, note: row.note })}`;
  try {
    client ??= new Anthropic({ maxRetries: 1, timeout: 110_000 });
    const res = await client.messages.create(
      {
        model: DEEP_MODEL,
        max_tokens: question ? 1200 : 3000,
        output_config: { effort: "low", format: { type: "json_schema", schema: question ? CONTRACT_ANSWER_SCHEMA : CONTRACT_AI_SCHEMA } },
        system: question ? contractQuestionPrompt(lang) : contractSummaryPrompt(lang),
        messages: [{ role: "user", content: [source, { type: "text", text: question ? `${saved}\n\nQuestion: ${question}` : saved }] }],
      },
      { signal },
    );
    return JSON.parse(res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""));
  } catch (e) {
    if (signal?.aborted) throw e;
    console.error("[contracts-ai] failed", e instanceof Error ? e.message : e);
    return null;
  }
}
