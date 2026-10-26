// Every photo of the link's month in one ZIP, for an accountant's link (owner, 2026-10-26). Named like the app's month
// pack (lib/month-pack): 003_2026-09-02_Makro_IV-123.jpg — the number is the row in the Excel file. A response from
// here cannot carry tens of MB, so the ZIP is put in the private line-exports bucket and the browser goes to a
// 10-minute signed link.

import { zipSync } from "fflate";
import { monthKey } from "@/lib/archive";
import { exportOrder } from "@/lib/export";
import { ledger } from "@/lib/line-ask-server";
import { shareMonth } from "@/lib/month-end-server";
import { packFileName } from "@/lib/month-pack";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

/** At most this much in one ZIP (the bucket's limit is 50 MB) */
const MAX_BYTES = 48 * 1024 * 1024;

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = supabaseAdmin();
  const share = await shareMonth(admin, token);
  if (!share) return new Response("This link has expired or is not valid.", { status: 404 });

  const { saved } = await ledger(admin);
  const docs = saved.filter((d) => monthKey(d.doc) === share.month).sort((a, b) => exportOrder(a.doc, b.doc));
  const { data: rows } = await admin.from("documents").select("id, photo_path").in("id", docs.length ? docs.map((d) => d.id) : ["00000000-0000-0000-0000-000000000000"]);
  const pathOf = new Map((rows ?? []).map((r) => [r.id as string, r.photo_path as string | null]));

  const files: Record<string, [Uint8Array, { level: 0 }]> = {};
  let bytes = 0;
  // A few at a time: fast enough, gentle on storage
  for (let i = 0; i < docs.length; i += 6) {
    const batch = docs.slice(i, i + 6);
    const got = await Promise.all(
      batch.map(async (d, j) => {
        const path = pathOf.get(d.id);
        if (!path) return null;
        const { data } = await admin.storage.from("documents").download(path);
        if (!data) return null;
        const ext = path.toLowerCase().endsWith(".pdf") ? "pdf" : "jpg";
        const vendor = d.doc.seller.name.en || d.doc.seller.name.th || "";
        return { name: packFileName(i + j + 1, d.doc, vendor, ext), body: new Uint8Array(await data.arrayBuffer()) };
      }),
    );
    for (const f of got) {
      if (!f || bytes + f.body.length > MAX_BYTES) continue;
      bytes += f.body.length;
      files[f.name] = [f.body, { level: 0 }]; // photos are already compressed
    }
  }
  if (!Object.keys(files).length) return new Response("No photos for this month.", { status: 404 });

  const zip = zipSync(files);
  const path = `share/${token}.zip`;
  const up = await admin.storage.from("line-exports").upload(path, Buffer.from(zip), { contentType: "application/zip", upsert: true });
  if (up.error) return new Response("Could not make the file. Please try again.", { status: 500 });
  const signed = await admin.storage.from("line-exports").createSignedUrl(path, 600, { download: `sawadee-tax-${share.month}-photos.zip` });
  if (signed.error || !signed.data) return new Response("Could not make the file. Please try again.", { status: 500 });
  return Response.redirect(signed.data.signedUrl, 302);
}
