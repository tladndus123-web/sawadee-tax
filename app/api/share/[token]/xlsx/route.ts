// The month's purchase ledger as Excel, for an accountant's link (lib/month-end-server shareMonth). No sign-in: the
// token is the key, checked on every download, and it only ever opens that one month.

import { XLSX_TYPE } from "@/lib/export-xlsx";
import { ledger, monthXlsx } from "@/lib/line-ask-server";
import { shareMonth } from "@/lib/month-end-server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { guessingTooMuch, TOO_MANY, wrongGuess } from "@/lib/ip-limit";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // 30 wrong links a minute from one address, then refused before the lookup (lib/ip-limit)
  if (guessingTooMuch(req, "share", 30)) return TOO_MANY();
  const admin = supabaseAdmin();
  const share = await shareMonth(admin, token);
  if (!share) {
    wrongGuess(req, "share");
    return new Response("This link has expired or is not valid.", { status: 404 });
  }
  const { saved, taxId, excelFormat } = await ledger(admin);
  const { file } = await monthXlsx(saved, share.month, taxId, excelFormat);
  return new Response(new Uint8Array(file), {
    headers: {
      "content-type": XLSX_TYPE,
      "content-disposition": `attachment; filename="purchase-ledger-${share.month}.xlsx"`,
      "cache-control": "private, no-store",
    },
  });
}
