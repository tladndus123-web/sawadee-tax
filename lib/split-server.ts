// Server only: find where each receipt / invoice is on a photo of several laid out together. Only positions —
// the reading itself stays the normal one, per cut-out (lib/split-boxes.ts).
// Model tested 2026-09-28 on 3 invoices side by side: Haiku 4.5 found 2 of 3 with wrong boxes, Sonnet 5 all 3
// (loose), the reading model (Opus) all 3 tight. A wrong box spoils the whole reading, so the reading model at
// low effort on a small copy: ~960 tokens in, ~80 out — about 10 KRW per photo, once per photo, not per receipt.

import Anthropic from "@anthropic-ai/sdk";
import { loadSharp, readingSetup } from "./extract-server";
import { type Box, cleanBoxes, MAX_PER_PHOTO } from "./split-boxes";

const finderModel = () => process.env.ANTHROPIC_FINDER_MODEL || readingSetup().model;
/** The finder only needs to see paper shapes, not read text */
const FINDER_SIDE = 1024;

const PROMPT = `The photo shows one or more separate paper receipts, tax invoices or bills laid out on a surface.
Find each separate document. Give the tight bounding box of each whole paper (all printed text of it inside the box).
Reply with JSON only: {"documents":[{"box":[x,y,w,h]}]} where x,y is the top-left corner and w,h the size, as fractions 0-1 of the image width and height.
Do not split one document into parts; a long receipt is one document. If there is no document, reply {"documents":[]}.`;

let client: Anthropic | null = null;

export type FindOutcome = { ok: true; boxes: Box[]; more: boolean; inputTokens: number; outputTokens: number } | { ok: false; status: number };

export async function findDocuments(image: Buffer, signal?: AbortSignal): Promise<FindOutcome> {
  const sharp = await loadSharp();
  let small = image;
  if (sharp) {
    try {
      small = await sharp(image).rotate().resize({ width: FINDER_SIDE, height: FINDER_SIDE, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    } catch {
      return { ok: false, status: 400 };
    }
  }
  try {
    client ??= new Anthropic({ maxRetries: 2 });
    const res = await client.messages.create(
      {
        model: finderModel(),
        max_tokens: 600,
        output_config: { effort: "low" },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: small.toString("base64") } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      },
      { signal },
    );
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    const parsed = json ? (JSON.parse(json) as { documents?: unknown }) : null;
    const boxes = cleanBoxes(parsed?.documents);
    return { ok: true, boxes: boxes.slice(0, MAX_PER_PHOTO), more: boxes.length > MAX_PER_PHOTO, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return { ok: false, status: 429 };
    if (error instanceof SyntaxError) return { ok: true, boxes: [], more: false, inputTokens: 0, outputTokens: 0 };
    console.error("split: finder failed", error);
    return { ok: false, status: 502 };
  }
}
