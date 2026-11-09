// One document's photo for an accountant's link: only documents of the link's month, through a short signed URL.

import { monthKey } from "@/lib/archive";
import { type DocumentRow, rowToDoc } from "@/lib/db-map";
import { shareMonth } from "@/lib/month-end-server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { guessingTooMuch, TOO_MANY, wrongGuess } from "@/lib/ip-limit";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  if (guessingTooMuch(req, "share", 30)) return TOO_MANY();
  const admin = supabaseAdmin();
  const share = await shareMonth(admin, token);
  if (!share || !/^[0-9a-f-]{36}$/i.test(id)) {
    if (!share) wrongGuess(req, "share");
    return new Response("This link has expired or is not valid.", { status: 404 });
  }
  const { data } = await admin.from("documents").select("*").eq("id", id).is("deleted_at", null).eq("status", "reviewed").maybeSingle();
  const row = data as (DocumentRow & { photo_path: string | null }) | null;
  if (!row?.photo_path || monthKey(rowToDoc(row, [])) !== share.month) return new Response("Not found", { status: 404 });
  const signed = await admin.storage.from("documents").createSignedUrl(row.photo_path, 300);
  if (signed.error || !signed.data) return new Response("Not found", { status: 404 });
  return Response.redirect(signed.data.signedUrl, 302);
}
