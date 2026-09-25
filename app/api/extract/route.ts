// Step 6: read one document photo with Claude. Server only — the API key never reaches the browser.
// The upload screen sends up to 5 photos at once, one request per photo. The reading itself is in
// lib/extract-server.ts (shared with scripts/eval-extract.ts).

import { endIfExpired } from "@/lib/auth/session-guard";
import type { ExtractErrorCode } from "@/lib/extract-schema";
import { extractDocument, IMAGE_TYPES, type ImageType, MAX_IMAGE_BYTES } from "@/lib/extract-server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

// Per-person limit (by member). Leaves room for a full batch of 5.
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
  // Members only: each reading is a paid API call
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "signin" }, { status: 401 });
  // Signed in more than 12 hours ago on this device: this session is over
  if (await endIfExpired(supabase)) return Response.json({ error: "signin" }, { status: 401 });
  const { data: member } = await supabase.from("members").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!member) return Response.json({ error: "signin" }, { status: 403 });
  if (limited(user.id)) return fail("rate", 429);

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
