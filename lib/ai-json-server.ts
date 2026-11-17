// One JSON answer from Claude for the "AI words the program's facts" features (lib/ai-sheet): a system prompt, the sheet
// as the message, a JSON schema for the answer. Null on any failure (the screen then offers to try again). Server only.

import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export async function askJson(o: { model: string; system: string; payload: unknown; schema: Record<string, unknown>; maxTokens?: number; signal?: AbortSignal }): Promise<unknown | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    client ??= new Anthropic({ maxRetries: 1, timeout: 60_000 });
    const res = await client.messages.create(
      {
        model: o.model,
        max_tokens: o.maxTokens ?? 3000,
        output_config: { format: { type: "json_schema", schema: o.schema } },
        system: o.system,
        messages: [{ role: "user", content: JSON.stringify(o.payload) }],
      },
      { signal: o.signal },
    );
    if (res.stop_reason !== "end_turn") {
      console.error("[ai-json] stopped:", res.stop_reason);
      return null;
    }
    return JSON.parse(res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""));
  } catch (e) {
    if (o.signal?.aborted) return null;
    console.error("[ai-json] failed", e instanceof Error ? e.message : e);
    return null;
  }
}
