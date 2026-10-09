// Read a POS closing report (or a delivery app's daily summary) with Claude. Members only — each reading is a paid
// API call. The API key never reaches the browser.

import { endIfExpired } from "@/lib/auth/session-guard";
import { IMAGE_TYPES, type ImageType, MAX_IMAGE_BYTES, type SourceType } from "@/lib/extract-server";
import { readSalesReport } from "@/lib/extract-sales";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const LIMIT = 20;
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

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "signin" }, { status: 401 });
  if (await endIfExpired(supabase)) return Response.json({ error: "signin" }, { status: 401 });
  const { data: member } = await supabase.from("members").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!member) return Response.json({ error: "signin" }, { status: 403 });
  if (limited(user.id)) return Response.json({ error: "rate" }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size > MAX_IMAGE_BYTES) return Response.json({ error: "badImage" }, { status: 400 });
  const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!pdf && !IMAGE_TYPES.includes(file.type as ImageType)) return Response.json({ error: "badImage" }, { status: 400 });

  try {
    const out = await readSalesReport(Buffer.from(await file.arrayBuffer()), (pdf ? "application/pdf" : file.type) as SourceType, req.signal);
    if (out.ok) return Response.json({ readings: out.readings });
    if (out.detail) console.error(`extract-sales: ${out.code}`, out.detail);
    return Response.json({ error: out.code }, { status: out.status });
  } catch {
    return new Response(null, { status: 499 });
  }
}
