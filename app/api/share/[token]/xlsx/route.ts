// The month's purchase ledger as Excel, for an accountant's link (lib/month-end-server shareMonth). No sign-in: the
// token is the key, checked on every download, and it only ever opens that one month.

import { XLSX_TYPE } from "@/lib/export-xlsx";
import { ledger, monthXlsx } from "@/lib/line-ask-server";
import { shareMonth } from "@/lib/month-end-server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = supabaseAdmin();
  const share = await shareMonth(admin, token);
  if (!share) return new Response("This link has expired or is not valid.", { status: 404 });
  const { saved, taxId } = await ledger(admin);
  const { file } = await monthXlsx(saved, share.month, taxId);
  return new Response(new Uint8Array(file), {
    headers: {
      "content-type": XLSX_TYPE,
      "content-disposition": `attachment; filename="purchase-ledger-${share.month}.xlsx"`,
      "cache-control": "private, no-store",
    },
  });
}
