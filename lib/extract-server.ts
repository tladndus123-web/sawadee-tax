// Server only: read one document photo with Claude. Shared by /api/extract and scripts/eval-extract.ts
// so the accuracy check measures exactly what the app does. Never import this from client code.

import { readFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { type ExtractErrorCode, extractedToRaw, extractSchema, FIELD_BOX_RULE, parseReply } from "./extract-schema";
import { normalize } from "./normalize";
import type { LedgerDoc } from "./types";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
/** base64 stays under the API's 5 MB per-image limit */
export const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type ExtractOutcome =
  | {
      ok: true;
      doc: LedgerDoc;
      model: string;
      effort: Effort;
      inputTokens: number;
      outputTokens: number;
      ms: number;
      /** Fields in the reply that did not match extractSchema (normalize() still cleans them) */
      schemaIssues: string[];
    }
  | { ok: false; code: ExtractErrorCode | "aborted"; status: number; detail?: string };

let prompt: string | null = null;
const getPrompt = () =>
  (prompt ??= `${readFileSync(path.join(process.cwd(), "docs/reference/extract-prompt.txt"), "utf8").trim()}\n${FIELD_BOX_RULE}`);

let client: Anthropic | null = null;

export async function extractDocument(
  image: Buffer,
  type: ImageType,
  opts: { signal?: AbortSignal; model?: string; effort?: Effort } = {},
): Promise<ExtractOutcome> {
  const model = opts.model || process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
  // Opus 5.5 defaults to "medium"; set explicitly so a model change does not silently change depth.
  const effort = opts.effort || (process.env.ANTHROPIC_EFFORT as Effort | undefined) || "medium";
  try {
    client ??= new Anthropic({ maxRetries: 2 });
  } catch {
    return { ok: false, code: "noKey", status: 503 };
  }

  const started = Date.now();
  try {
    // Plain JSON by prompt (the prototype's proven approach). A structured-output schema this size is
    // rejected by the API ("compiled grammar is too large"), so the shape is checked with zod afterwards.
    const response = await client.messages.create(
      {
        model,
        max_tokens: 16000,
        output_config: { effort },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: type, data: image.toString("base64") } },
              { type: "text", text: getPrompt() },
            ],
          },
        ],
      },
      { signal: opts.signal },
    );
    const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const parsed = parseReply(text);
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens" || !parsed) {
      return { ok: false, code: "aiFail", status: 502, detail: `stop_reason=${response.stop_reason}; ${parsed ? "" : "no JSON in reply"}` };
    }
    if (parsed.notDocument === true) return { ok: false, code: "notDoc", status: 422 };
    const check = extractSchema.safeParse(parsed);
    return {
      ok: true,
      doc: normalize(extractedToRaw(parsed)),
      schemaIssues: check.success ? [] : check.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      model: response.model,
      effort,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      ms: Date.now() - started,
    };
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) return { ok: false, code: "aborted", status: 499 };
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return { ok: false, code: "noKey", status: 503, detail: error.message };
    }
    if (error instanceof Anthropic.RateLimitError) return { ok: false, code: "rate", status: 429, detail: error.message };
    // A 400 about the photo is the user's to fix; any other 400 is ours (request shape) → generic failure
    if (error instanceof Anthropic.BadRequestError) {
      return { ok: false, code: /image/i.test(error.message) ? "badImage" : "aiFail", status: 400, detail: error.message };
    }
    if (error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionError) {
      return { ok: false, code: "busy", status: 503, detail: error.message };
    }
    // No key, token or profile: the SDK throws a plain Error before sending anything
    if (error instanceof Error && /authentication method|API key/i.test(error.message)) return { ok: false, code: "noKey", status: 503 };
    return { ok: false, code: "aiFail", status: 502, detail: error instanceof Error ? error.message : String(error) };
  }
}
