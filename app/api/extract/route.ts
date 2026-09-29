// Step 6: read one document photo with Claude. Server only — the API key never reaches the browser.
// The upload screen sends up to 5 photos at once, one request per photo. The reading itself is in
// lib/extract-server.ts (shared with scripts/eval-extract.ts).

import { endIfExpired } from "@/lib/auth/session-guard";
import type { ExtractErrorCode } from "@/lib/extract-schema";
import { bulkSetup, BULK_FROM, extractDocument, IMAGE_TYPES, type ImageType, loadSharp, MAX_IMAGE_BYTES, readingFor, readingSetup, type SourceType } from "@/lib/extract-server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

// Per-person limit (by member). The app reads 5 at a time; continuous shooting can queue up to 30.
const LIMIT = 30;
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

/** Health check: reading model/effort and whether long slips can be cut into pieces (no data, no AI call) */
export async function GET() {
  return Response.json({ ...readingSetup(), bulk: { from: BULK_FROM, ...bulkSetup() }, slipPieces: !!(await loadSharp()) });
}

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

  // A photo, or the original PDF (the app keeps its own picture of the pages for the preview)
  const form = await req.formData().catch(() => null);
  const pdf = form?.get("pdf");
  const photo = form?.get("photo");
  const file = pdf instanceof File ? pdf : photo;
  const type = pdf instanceof File ? "application/pdf" : (file as File | null)?.type;
  const allowed = pdf instanceof File ? pdf.type === "application/pdf" || /\.pdf$/i.test(pdf.name) : IMAGE_TYPES.includes(type as ImageType);
  if (!(file instanceof File) || !allowed || file.size > MAX_IMAGE_BYTES) return fail("badImage", 400);

  const cutOut = form?.get("cutOut") === "1";
  // How many photos came in the same upload: 3 or more are read with the bulk setup
  const batch = Math.max(0, Math.min(99, Number(form?.get("batch")) || 0));
  const result = await extractDocument(Buffer.from(await file.arrayBuffer()), type as SourceType, { signal: req.signal, cutOut, ...readingFor(batch) });
  if (result.ok) return Response.json({ doc: result.doc });
  if (result.code === "aborted") return new Response(null, { status: 499 });
  if (result.detail) console.error(`extract: ${result.code}`, result.detail);
  return fail(result.code, result.status);
}
