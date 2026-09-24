// Step 6: read one document photo with Claude. Server only — the API key never reaches the browser.
// The upload screen sends up to 5 photos at once, one request per photo. The reading itself is in
// lib/extract-server.ts (shared with scripts/eval-extract.ts).

import type { ExtractErrorCode } from "@/lib/extract-schema";
import { extractDocument, IMAGE_TYPES, type ImageType, MAX_IMAGE_BYTES } from "@/lib/extract-server";

export const runtime = "nodejs";
export const maxDuration = 300;

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

export async function POST(req: Request) {
  const who = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  if (limited(who)) return fail("rate", 429);

  const form = await req.formData().catch(() => null);
  const photo = form?.get("photo");
  if (!(photo instanceof File) || !IMAGE_TYPES.includes(photo.type as ImageType) || photo.size > MAX_IMAGE_BYTES) {
    return fail("badImage", 400);
  }

  const result = await extractDocument(Buffer.from(await photo.arrayBuffer()), photo.type as ImageType, { signal: req.signal });
  if (result.ok) return Response.json({ doc: result.doc });
  if (result.code === "aborted") return new Response(null, { status: 499 });
  if (result.detail) console.error(`extract: ${result.code}`, result.detail);
  return fail(result.code, result.status);
}
