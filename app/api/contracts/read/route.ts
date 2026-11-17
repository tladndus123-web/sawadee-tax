// A contract photo / PDF → the contract box's form (lib/contract-read-server). Admins only (adminCaller: signed in,
// active admin, a few AI readings per 10 minutes). Nothing is saved here: the person checks the form and saves it.
// Two ways in: JSON { path, lang } for a file already put in the contracts folder (the app does this, so a 15 MB scan
// never passes through the request body), or a small multipart "file" (≤ 4 MB) with "lang".

import { adminCaller } from "@/lib/api-admin-server";
import { readLangOf } from "@/lib/contract-read";
import { contractFile, readContract } from "@/lib/contract-read-server";
import { checkFile, type ContractFileType } from "@/lib/contracts";
import { supabaseServer } from "@/lib/supabase/server";
import { todayBangkok } from "@/lib/thai-tax";

export const runtime = "nodejs";
export const maxDuration = 120;

const DIRECT_MAX = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const who = await adminCaller({ full: false, perTenMinutes: 20 });
  if (who instanceof Response) return who;
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "noKey" }, { status: 503 });

  let file: { buf: Buffer; type: ContractFileType } | null = null;
  let lang = readLangOf(undefined);
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const f = form?.get("file");
    lang = readLangOf(form?.get("lang"));
    const ok = f instanceof File ? checkFile(f) : null;
    if (f instanceof File && ok?.ok && f.size <= DIRECT_MAX) file = { buf: Buffer.from(await f.arrayBuffer()), type: ok.type };
  } else {
    const body = (await req.json().catch(() => ({}))) as { path?: unknown; lang?: unknown };
    lang = readLangOf(body.lang);
    // Read with the caller's own session: the storage rules let admins read the contracts folder
    if (typeof body.path === "string") file = await contractFile(await supabaseServer(), body.path);
  }
  if (!file) return Response.json({ error: "file" }, { status: 400 });

  const result = await readContract(file, lang, todayBangkok(), req.signal);
  if (!result.ok) return Response.json({ error: result.code }, { status: result.code === "noKey" ? 503 : 422 });
  return Response.json({ reading: result.reading, model: result.model });
}
