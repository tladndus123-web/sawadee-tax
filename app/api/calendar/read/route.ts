// A document photo / PDF → the dates for the tax calendar (lib/calendar-read-server). Admins only; a few readings a
// minute per person, like the receipt reading.

import { endIfExpired } from "@/lib/auth/session-guard";
import { readDocumentDates } from "@/lib/calendar-read-server";
import { MAX_IMAGE_BYTES } from "@/lib/extract-server";
import { supabaseServer } from "@/lib/supabase/server";
import { todayBangkok } from "@/lib/thai-tax";

export const runtime = "nodejs";
export const maxDuration = 120;

const TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const hits = new Map<string, number[]>();

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (await endIfExpired(supabase))) return Response.json({ error: "signin" }, { status: 401 });
  const { data: member } = await supabase.from("members").select("role").eq("user_id", user.id).maybeSingle();
  if (member?.role !== "admin") return Response.json({ error: "admin" }, { status: 403 });
  const now = Date.now();
  const recent = (hits.get(user.id) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 5) return Response.json({ error: "rate" }, { status: 429 });
  hits.set(user.id, [...recent, now]);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const lang = String(form?.get("lang") ?? "ja");
  const type = file instanceof File ? (file.type === "" && /\.pdf$/i.test(file.name) ? "application/pdf" : file.type) : "";
  if (!(file instanceof File) || !(TYPES as readonly string[]).includes(type) || file.size > MAX_IMAGE_BYTES * 2) return Response.json({ error: "file" }, { status: 400 });

  const result = await readDocumentDates(Buffer.from(await file.arrayBuffer()), type as (typeof TYPES)[number], lang, todayBangkok(), req.signal);
  if (!result.ok) return Response.json({ error: result.code }, { status: result.code === "noKey" ? 503 : 422 });
  return Response.json(result);
}
