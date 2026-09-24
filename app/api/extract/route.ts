// Step 6: read one document photo with Claude. Server only — the API key never reaches the browser.
// The upload screen sends up to 5 photos at once, one request per photo.

import { readFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { type ExtractErrorCode, extractedToRaw, extractSchema, FIELD_BOX_RULE } from "@/lib/extract-schema";
import { normalize } from "@/lib/normalize";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
// Opus 5.5 defaults to "medium"; set explicitly so a model change does not silently change depth.
const EFFORT = (process.env.ANTHROPIC_EFFORT || "medium") as "low" | "medium" | "high" | "xhigh" | "max";
const PROMPT = `${readFileSync(path.join(process.cwd(), "docs/reference/extract-prompt.txt"), "utf8").trim()}\n${FIELD_BOX_RULE}`;
const TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_BYTES = 4.5 * 1024 * 1024; // base64 stays under the API's 5 MB per-image limit

// Per-person limit (by IP until login exists in step 5). Leaves room for a full batch of 5.
const LIMIT = 10;
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();
function limited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

const fail = (code: ExtractErrorCode, status: number) => Response.json({ error: code }, { status });

let client: Anthropic | null = null;

export async function POST(req: Request) {
  const who = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  if (limited(who)) return fail("rate", 429);

  const form = await req.formData().catch(() => null);
  const photo = form?.get("photo");
  if (!(photo instanceof File) || !TYPES.includes(photo.type as (typeof TYPES)[number]) || photo.size > MAX_BYTES) {
    return fail("badImage", 400);
  }

  try {
    client ??= new Anthropic({ maxRetries: 2 });
  } catch {
    return fail("noKey", 503);
  }

  try {
    const data = Buffer.from(await photo.arrayBuffer()).toString("base64");
    const response = await client.messages.parse(
      {
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: EFFORT, format: zodOutputFormat(extractSchema) },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: photo.type as (typeof TYPES)[number], data } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      },
      { signal: req.signal },
    );

    const parsed = response.parsed_output;
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens" || !parsed) {
      console.error("extract: no usable reading", response.stop_reason);
      return fail("aiFail", 502);
    }
    if (parsed.notDocument) return fail("notDoc", 422);
    return Response.json({ doc: normalize(extractedToRaw(parsed)) });
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) return new Response(null, { status: 499 });
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return fail("noKey", 503);
    if (error instanceof Anthropic.RateLimitError) return fail("rate", 429);
    if (error instanceof Anthropic.BadRequestError) {
      console.error("extract: bad request", error.message);
      return fail("badImage", 400);
    }
    if (error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionError) return fail("busy", 503);
    // No key, token or profile: the SDK throws a plain Error before sending anything
    if (error instanceof Error && /authentication method|API key/i.test(error.message)) return fail("noKey", 503);
    console.error("extract: failed", error);
    return fail("aiFail", 502);
  }
}
