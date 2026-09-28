// One-off (2026-09-28): give documents saved before photo fingerprints existed their fingerprint (lib/photo-hash),
// so a re-upload of an older photo is caught too. Reads each photo, writes only documents.photo_hash.
//   npx.cmd tsx scripts/backfill-photo-hash.ts          → local database (.env.local)
//   npx.cmd tsx scripts/backfill-photo-hash.ts --cloud  → the live database (.env.deploy)
// Prints counts only, no secrets. Safe to run again (documents that have one are skipped).

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { photoHashServer } from "@/lib/photo-hash-server";

const cloud = process.argv.includes("--cloud");
const env = Object.fromEntries(
  readFileSync(cloud ? ".env.deploy" : ".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const url = cloud ? `https://${env.SUPABASE_PROJECT_REF}.supabase.co` : env.NEXT_PUBLIC_SUPABASE_URL;
const db = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

(async () => {
  const { data, error } = await db.from("documents").select("id, photo_path").is("photo_hash", null).not("photo_path", "is", null);
  if (error) throw error;
  let done = 0;
  let failed = 0;
  for (const d of data ?? []) {
    const file = await db.storage.from("documents").download(d.photo_path as string);
    const hash = file.data ? await photoHashServer(Buffer.from(await file.data.arrayBuffer())) : null;
    if (!hash) {
      failed++;
      continue;
    }
    const up = await db.from("documents").update({ photo_hash: hash }).eq("id", d.id);
    if (up.error) failed++;
    else done++;
  }
  console.log(`${cloud ? "cloud" : "local"}: ${data?.length ?? 0} without a fingerprint → ${done} filled, ${failed} failed`);
})();
