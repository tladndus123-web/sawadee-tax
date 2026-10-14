// Server only: read one document photo with Claude. Shared by /api/extract and scripts/eval-extract.ts
// so the accuracy check measures exactly what the app does. Never import this from client code.

import { readFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { type ExtractErrorCode, extractedToRaw, extractSchema, FIELD_BOX_RULE, parseReply } from "./extract-schema";
import { normalize } from "./normalize";
import { isSlip, tileRects } from "./slip-tiles";
import { categoryPrompt } from "./category-prompt";
import { serverCategories } from "./categories-server";
import { applyOurCompany, ourCompanyHint } from "./our-company";
import { readingHints } from "./reading-hints-server";
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
      /** Of inputTokens, read from the prompt cache (a tenth of the price) */
      cachedTokens: number;
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

/** A piece cut from a photo of several receipts (lib/split-boxes.ts): its edges may show the neighbours */
const CUT_OUT_NOTE =
  "This image was cut from a photo of several receipts laid out together. Its edges may show parts of neighbouring receipts: read only the one document that fills most of the image and ignore the others.";

/**
 * Model and effort the app reads with (Vercel env ANTHROPIC_MODEL / ANTHROPIC_EFFORT; defaults below).
 * 2026-09-29, owner's choice: Sonnet 5.5 at medium — same tax fields as Opus 5.5 low on the sample (20/21), ~52%
 * cheaper ($2/$10 per MTok vs $4/$20) and ~30% faster; a few more slips in names' spelling (82% vs 88% of all fields).
 */
export const readingSetup = () => ({
  model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
  // Opus 5.5 defaults to "medium"; set explicitly so a model change does not silently change depth.
  effort: ((process.env.ANTHROPIC_EFFORT || "").trim() || "medium") as Effort,
});

/** From this many receipts in ONE photo (cut apart in "several" mode), the reading switches to the bulk setup */
export const BULK_FROM = 3;

/**
 * 2026-09-30, owner's choice: photos taken or picked one by one → the normal setup above (Sonnet 5.5, medium), however
 * many; a photo with 3 or more receipts on it, cut apart → each piece read by Opus 5.5 at low (Vercel env
 * ANTHROPIC_BULK_MODEL / ANTHROPIC_BULK_EFFORT to change it).
 */
export const bulkSetup = () => ({
  model: process.env.ANTHROPIC_BULK_MODEL || "claude-opus-5-5",
  effort: ((process.env.ANTHROPIC_BULK_EFFORT || "").trim() || "low") as Effort,
});

/** The setup for a receipt cut from a photo of `batch` receipts (0 / 1 / unknown = a photo of its own) */
export const readingFor = (batch: number) => (batch >= BULK_FROM ? bulkSetup() : readingSetup());

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

/** Long side a normal photo is sent at (tokens grow with the pixels: 2400 px ≈ 4,200 tokens, 1568 px ≈ 1,800) */
export const readSide = () => Number(process.env.READ_MAX_SIDE) || 0;

async function photoBlocks(image: Buffer, type: ImageType, maxSide = readSide()): Promise<Anthropic.ContentBlockParam[]> {
  const sharp = await loadSharp();
  if (!sharp) return [imageBlock(image, type)];
  try {
    const meta = await sharp(image).metadata();
    const turned = (meta.orientation ?? 1) >= 5;
    const width = (turned ? meta.height : meta.width) ?? 0;
    const height = (turned ? meta.width : meta.height) ?? 0;
    if (!width || !height) return [imageBlock(image, type)];
    if (!isSlip(width, height)) {
      // A normal photo larger than the reading size is scaled down first: the same text for fewer tokens
      if (!maxSide || Math.max(width, height) <= maxSide) return [imageBlock(image, type)];
      const small = await sharp(image).rotate().resize({ width: maxSide, height: maxSide, fit: "inside" }).jpeg({ quality: 90 }).toBuffer();
      return [imageBlock(small, "image/jpeg")];
    }
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
  opts: { signal?: AbortSignal; model?: string; effort?: Effort; cutOut?: boolean; maxSide?: number } = {},
): Promise<ExtractOutcome> {
  const model = opts.model || readingSetup().model;
  const effort = opts.effort || readingSetup().effort;
  try {
    client ??= new Anthropic({ maxRetries: 2 });
  } catch {
    return { ok: false, code: "noKey", status: 503 };
  }

  const started = Date.now();
  // The company's own categories (settings) and the sellers it already knows, added to the instructions
  const [categories, hints] = await Promise.all([serverCategories(), readingHints()]);
  const extra = categoryPrompt(categories);
  try {
    // Plain JSON by prompt (the prototype's proven approach). A structured-output schema this size is
    // rejected by the API ("compiled grammar is too large"), so the shape is checked with zod afterwards.
    const response = await client.messages.create(
      {
        model,
        max_tokens: 16000,
        output_config: { effort },
        // The instructions go first and are cached: every photo after the first within 5 minutes pays a tenth for
        // them (owner, 2026-10-14). The company's own part (categories, known sellers) is a second cached block.
        system: [
          { type: "text", text: getPrompt(), cache_control: { type: "ephemeral" } },
          ...(extra || hints.vendors || hints.ours
            ? [{ type: "text" as const, text: [extra, ourCompanyHint(hints.ours), hints.vendors].filter(Boolean).join("\n\n"), cache_control: { type: "ephemeral" as const } }]
            : []),
        ],
        messages: [
          {
            role: "user",
            content: [
              ...(type === "application/pdf"
                ? [
                    { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: image.toString("base64") } },
                    { type: "text" as const, text: "The document is attached as a PDF (often an e-Tax Invoice / e-Receipt) instead of a photo: read it the same way." },
                  ]
                : await photoBlocks(image, type, opts.maxSide ?? readSide())),
              ...(opts.cutOut ? [{ type: "text" as const, text: CUT_OUT_NOTE }] : []),
              { type: "text", text: "Read this document following the instructions." },
            ],
          },
        ],
      },
      { signal: opts.signal },
    );
    const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const parsed = parseReply(text);
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens" || !parsed) {
      return { ok: false, code: "aiFail", status: 502, detail: `stop_reason=${response.stop_reason}; ${parsed ? "" : `no JSON in reply: ${text.slice(0, 300).replace(/\s+/g, " ")}`}` };
    }
    if (parsed.notDocument === true) return { ok: false, code: "notDoc", status: 422 };
    const check = extractSchema.safeParse(parsed);
    return {
      ok: true,
      // The buyer is usually us: our known name and branch address replace a misread (lib/our-company)
      doc: hints.ours ? applyOurCompany(normalize(extractedToRaw(parsed)), hints.ours) : normalize(extractedToRaw(parsed)),
      schemaIssues: check.success ? [] : check.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      model: response.model,
      effort,
      inputTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
      cachedTokens: response.usage.cache_read_input_tokens ?? 0,
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
