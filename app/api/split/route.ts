// Where are the receipts on this photo? (continuous shooting, "several" mode). Members only — a paid API call,
// though a small one. Returns boxes; the phone cuts them out at full resolution and reads each one as usual.

import { endIfExpired } from "@/lib/auth/session-guard";
import { IMAGE_TYPES, type ImageType, MAX_IMAGE_BYTES } from "@/lib/extract-server";
import { findDocuments } from "@/lib/split-server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const LIMIT = 20;
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "signin" }, { status: 401 });
  if (await endIfExpired(supabase)) return Response.json({ error: "signin" }, { status: 401 });
  const { data: member } = await supabase.from("members").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!member) return Response.json({ error: "signin" }, { status: 403 });
  const now = Date.now();
  const recent = (hits.get(user.id) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) return Response.json({ error: "rate" }, { status: 429 });
  hits.set(user.id, [...recent, now]);

  const form = await req.formData().catch(() => null);
  const photo = form?.get("photo");
  if (!(photo instanceof File) || !IMAGE_TYPES.includes(photo.type as ImageType) || photo.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: "badImage" }, { status: 400 });
  }
  const r = await findDocuments(Buffer.from(await photo.arrayBuffer()), req.signal);
  if (!r.ok) return Response.json({ error: r.status === 429 ? "rate" : "aiFail" }, { status: r.status });
  return Response.json({ boxes: r.boxes, more: r.more });
}
