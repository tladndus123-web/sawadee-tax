// A GrabFood / LINE MAN / foodpanda / ShopeeFood / Robinhood settlement read by the AI (lib/settlement-read-server):
// admins, only while the restaurant extra "배달앱 정산서" is switched on (Settings → 음식점 기능). Nothing is saved here —
// the screen shows the figures to check, then saves the sales line and the fee purchase with the person's session.

import { adminCaller } from "@/lib/api-admin-server";
import { readFoodFeatures } from "@/lib/food-features";
import { readSettlement, sheetText } from "@/lib/settlement-read-server";
import { supabaseServer } from "@/lib/supabase/server";
import { todayBangkok } from "@/lib/thai-tax";

export const runtime = "nodejs";
export const maxDuration = 180;

const PICTURES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
// Vercel takes request bodies up to about 4.5 MB (the screen shrinks photos first)
const MAX = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const who = await adminCaller({ full: false, perTenMinutes: 20, later: true });
  if (who instanceof Response) return who;
  const { data: settings } = await (await supabaseServer()).from("company_settings").select("extras").eq("id", 1).maybeSingle();
  if (!readFoodFeatures(settings?.extras).delivery) return Response.json({ error: "off" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX) return Response.json({ error: "file" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  const type = file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : "");
  let input: Parameters<typeof readSettlement>[0];
  if ((PICTURES as readonly string[]).includes(type)) input = { buf, type: type as (typeof PICTURES)[number] };
  else if (/\.(xlsx|csv|txt)$/i.test(file.name)) {
    const sheet = await sheetText(buf, file.name);
    if (!sheet) return Response.json({ error: "file" }, { status: 400 });
    input = { buf, sheet };
  } else return Response.json({ error: "file" }, { status: 400 });
  if (!who.spend()) return Response.json({ error: "rate" }, { status: 429 });
  const out = await readSettlement(input, todayBangkok(), req.signal);
  if (!out.ok) return Response.json({ error: out.code }, { status: out.code === "noKey" ? 503 : 422 });
  return Response.json({ settlement: out.settlement });
}
