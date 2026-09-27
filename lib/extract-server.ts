// Server only: read one document photo with Claude. Shared by /api/extract and scripts/eval-extract.ts
// so the accuracy check measures exactly what the app does. Never import this from client code.

import { readFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { type ExtractErrorCode, extractedToRaw, extractSchema, FIELD_BOX_RULE, parseReply } from "./extract-schema";
import { normalize } from "./normalize";
import { isSlip, tileRects } from "./slip-tiles";
import type { LedgerDoc } from "./types";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
/** A document can also arrive as a PDF (e-Tax Invoice); the AI reads it directly, text layer included */
export type SourceType = ImageType | "application/pdf";
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

/** Model and effort the app reads with (Vercel env; defaults below). Low was chosen 2026-09-26: same tax fields as medium, ~40% cheaper, ~2× faster. */
export const readingSetup = () => ({
  model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
  // Opus 5.5 defaults to "medium"; set explicitly so a model change does not silently change depth.
  effort: ((process.env.ANTHROPIC_EFFORT || "").trim() || "medium") as Effort,
});

type ImageBlock = Anthropic.ImageBlockParam;
const imageBlock = (data: Buffer, type: ImageType): ImageBlock => ({
  type: "image",
  source: { type: "base64", media_type: type, data: data.toString("base64") },
});

/**
 * The photo as the AI sees it: one image for a normal document; for a long, narrow slip, overlapping
 * pieces top to bottom (see lib/slip-tiles.ts) with a note saying they are one receipt.
 * A photo that can't be measured is sent whole, as before.
 */
/** sharp is a native module; loaded on first use so a missing binary never stops the reading itself */
let sharpLoad: Promise<typeof import("sharp").default | null> | null = null;
export const loadSharp = () =>
  (sharpLoad ??= import("sharp")
    .then((m) => m.default)
    .catch((error: unknown) => {
      console.error("extract: sharp unavailable, long slips are sent whole", error);
      return null;
    }));

async function photoBlocks(image: Buffer, type: ImageType): Promise<Anthropic.ContentBlockParam[]> {
  const sharp = await loadSharp();
  if (!sharp) return [imageBlock(image, type)];
  try {
    const meta = await sharp(image).metadata();
    const turned = (meta.orientation ?? 1) >= 5;
    const width = (turned ? meta.height : meta.width) ?? 0;
    const height = (turned ? meta.width : meta.height) ?? 0;
    if (!width || !height || !isSlip(width, height)) return [imageBlock(image, type)];
    const upright = await sharp(image).rotate().toBuffer();
    const tiles = tileRects(width, height);
    const pieces = await Promise.all(
      tiles.map((t) =>
        sharp(upright)
          .extract(t)
          .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 88 })
          .toBuffer(),
      ),
    );
    return [
      {
        type: "text",
        text: `The photo is ONE long, narrow receipt, cut into ${pieces.length} overlapping pieces in reading order (first = top). Neighbouring pieces repeat a few lines where they overlap: count each printed line once.`,
      },
      ...pieces.map((p) => imageBlock(p, "image/jpeg")),
    ];
  } catch {
    return [imageBlock(image, type)];
  }
}

export async function extractDocument(
  image: Buffer,
  type: SourceType,
  opts: { signal?: AbortSignal; model?: string; effort?: Effort } = {},
): Promise<ExtractOutcome> {
  const model = opts.model || readingSetup().model;
  const effort = opts.effort || readingSetup().effort;
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
              ...(type === "application/pdf"
                ? [
                    { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: image.toString("base64") } },
                    { type: "text" as const, text: "The document is attached as a PDF (often an e-Tax Invoice / e-Receipt) instead of a photo: read it the same way." },
                  ]
                : await photoBlocks(image, type)),
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
