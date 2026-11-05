// A work-schedule photo → the attendance sheet to confirm (lib/schedule-read-server). Admins only; the staff list
// is read with the caller's own session, so only the employees they may see are matched. A few readings a minute.

import { endIfExpired } from "@/lib/auth/session-guard";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, type SourceType } from "@/lib/extract-server";
import { readSchedule } from "@/lib/schedule-read-server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 180;

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
  if (recent.length >= 8) return Response.json({ error: "rate" }, { status: 429 });
  hits.set(user.id, [...recent, now]);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const month = String(form?.get("month") ?? "");
  const ids = String(form?.get("ids") ?? "").split(",").filter((s) => /^[0-9a-f-]{36}$/.test(s));
  const batch = Math.max(1, Math.min(99, Number(form?.get("batch")) || 1));
  const pdf = file instanceof File && (file.type === "application/pdf" || /\.pdf$/i.test(file.name));
  if (!(file instanceof File) || file.size > MAX_IMAGE_BYTES || !(pdf || (IMAGE_TYPES as readonly string[]).includes(file.type)) || !/^\d{4}-\d{2}$/.test(month))
    return Response.json({ error: "file" }, { status: 400 });

  const { data: rows } = ids.length ? await supabase.from("employees").select("id, name, nickname").in("id", ids) : { data: [] };
  const order = new Map(ids.map((id, i) => [id, i]));
  const staff = (rows ?? [])
    .map((r) => ({ id: r.id as string, name: (r.name as string) ?? "", nickname: (r.nickname as string) ?? "" }))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const result = await readSchedule(Buffer.from(await file.arrayBuffer()), (pdf ? "application/pdf" : file.type) as SourceType, month, staff, batch, req.signal).catch(() => null);
  if (!result) return new Response(null, { status: 499 });
  if (!result.ok) return Response.json({ error: result.code }, { status: result.code === "noKey" ? 503 : 422 });
  return Response.json(result.sheet);
}
