// Accuracy on the company's own documents (owner, 2026-10-14): the saved, office-checked documents are the answers.
// Each one's photo is read again exactly as /api/extract does and compared field by field (lib/extract-eval).
// READ-ONLY on production: photos and rows are only fetched. Every reading is one paid API call.
//
//   npx tsx scripts/eval-real.ts                       # 10 documents, the live model / effort
//   npx tsx scripts/eval-real.ts --n 5 --effort low    # fewer, another effort
//
// Needs .env.deploy (production read access) and ANTHROPIC_API_KEY in .env.local. Results: eval-results/real-*.json

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const envFile = (f: string) =>
  Object.fromEntries(
    readFileSync(f, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
  );
const deploy = envFile(".env.deploy");
const local = envFile(".env.local");
// The reading runs against production's categories, like the live app
process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${deploy.SUPABASE_PROJECT_REF}.supabase.co`;
process.env.SUPABASE_SERVICE_ROLE_KEY = deploy.SUPABASE_SERVICE_ROLE_KEY;
process.env.ANTHROPIC_API_KEY = local.ANTHROPIC_API_KEY;

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const N = Math.max(1, Math.min(20, Number(arg("n") ?? 10)));
const effort = arg("effort") as "low" | "medium" | "high" | undefined;
const side = arg("side") ? Number(arg("side")) : undefined;
const pickFrom = arg("ids")?.split(",");

async function main() {
  const { supabaseAdmin } = await import("../lib/supabase/admin");
  const { rowToDoc } = await import("../lib/db-map");
  const { extractDocument } = await import("../lib/extract-server");
  const { compareDocs } = await import("../lib/extract-eval");
  const { applyVendor, toVendor, VENDOR_COLUMNS } = await import("../lib/vendors");
  const { applyOurCompany, ourCompanyFrom } = await import("../lib/our-company");
  const db = supabaseAdmin();

  // Saved documents with a photo, the office-checked ones first, one per vendor where possible
  const { data: rows, error } = await db
    .from("documents")
    .select("*, document_items(*)")
    .is("deleted_at", null)
    .eq("status", "reviewed")
    .not("photo_path", "is", null)
    .order("checked_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  const all = (rows ?? []).filter((r) => !String(r.photo_path).endsWith(".pdf"));
  const chosen: typeof all = [];
  const seen = new Set<string>();
  for (const r of pickFrom ? all.filter((x) => pickFrom.includes(x.id)) : all) {
    const vendor = String(r.seller?.taxId ?? r.id);
    if (!pickFrom && seen.has(vendor)) continue;
    seen.add(vendor);
    chosen.push(r);
    if (chosen.length >= N) break;
  }
  const { data: company } = await db.from("company_settings").select("tax_id").eq("id", 1).maybeSingle();
  const docs = all.map((r) => rowToDoc(r, r.document_items ?? []));
  const ours = ourCompanyFrom(docs, String(company?.tax_id ?? ""));
  const { data: vendorRows } = await db.from("vendors").select(VENDOR_COLUMNS);
  const vendors = (vendorRows ?? []).map(toVendor);

  const out: unknown[] = [];
  const total = { raw: { ok: 0, all: 0 }, fixed: { ok: 0, all: 0 }, fair: { ok: 0, all: 0 } };
  const tokens = { in: 0, cached: 0, out: 0 };
  const byGroup: Record<string, { ok: number; all: number }> = {};
  let cost = 0;
  for (const [i, r] of chosen.entries()) {
    const truth = rowToDoc(r, r.document_items ?? []);
    const { data: blob, error: e } = await db.storage.from("documents").download(r.photo_path);
    if (e || !blob) {
      console.log(`${i + 1}. photo missing — skipped`);
      continue;
    }
    const photo = Buffer.from(await blob.arrayBuffer());
    const type = /\.png$/i.test(r.photo_path) ? "image/png" : /\.webp$/i.test(r.photo_path) ? "image/webp" : "image/jpeg";
    const read = await extractDocument(photo, type, { ...(effort ? { effort } : {}), ...(side ? { maxSide: side } : {}) });
    if (!read.ok) {
      console.log(`${i + 1}. reading failed: ${read.code}${"detail" in read && read.detail ? ` — ${String(read.detail).slice(0, 420)}` : ""}`);
      continue;
    }
    // What the app does next: the vendor dictionary and our own company fill in known names
    const vendor = vendors.find((v) => v.taxId === read.doc.seller.taxId.replace(/\D/g, "")) ?? null;
    const fixed = applyOurCompany(applyVendor(read.doc, vendor).doc, ours);
    const raw = compareDocs(truth, read.doc);
    const after = compareDocs(truth, fixed);
    total.raw.ok += raw.score.all.ok;
    total.raw.all += raw.score.all.total;
    total.fixed.ok += after.score.all.ok;
    total.fixed.all += after.score.all.total;
    for (const g of ["exact", "thai", "english"] as const) {
      byGroup[g] ??= { ok: 0, all: 0 };
      byGroup[g].ok += after.score[g].ok;
      byGroup[g].all += after.score[g].total;
    }
    // Sonnet 5.5: $2 / MTok input, $0.20 cached, $10 output
    cost += ((read.inputTokens - read.cachedTokens) * 2 + read.cachedTokens * 0.2 + read.outputTokens * 10) / 1e6;
    tokens.in += read.inputTokens;
    tokens.cached += read.cachedTokens;
    tokens.out += read.outputTokens;
    // Our own name on saved documents was often never corrected, so the buyer fields are left out of this score
    const fair = after.fields.filter((f) => !f.path.startsWith("customer."));
    total.fair.ok += fair.filter((f) => f.ok).length;
    total.fair.all += fair.length;
    const miss = after.fields.filter((f) => !f.ok).map((f) => f.path);
    console.log(`${i + 1}. ${(read.ms / 1000).toFixed(0)}s  AI alone ${raw.score.all.ok}/${raw.score.all.total} → with app ${after.score.all.ok}/${after.score.all.total}  ${miss.length ? `✗ ${miss.join(", ")}` : "all match"}`);
    out.push({ id: r.id, raw: raw.score, fixed: after.score, misses: after.fields.filter((f) => !f.ok) });
  }
  const pct = (s: { ok: number; all: number }) => (s.all ? Math.round((s.ok / s.all) * 1000) / 10 : 0);
  console.log(`\nAI alone ${pct(total.raw)}% · with the app's fixes ${pct(total.fixed)}%`);
  console.log(`  numbers · codes · dates ${pct(byGroup.exact ?? { ok: 0, all: 0 })}% · Thai text ${pct(byGroup.thai ?? { ok: 0, all: 0 })}% · English ${pct(byGroup.english ?? { ok: 0, all: 0 })}%`);
  console.log(`  without our own (often uncorrected) buyer fields: ${pct(total.fair)}%`);
  console.log(`  tokens: ${tokens.in} in (${tokens.cached} from cache) / ${tokens.out} out · about $${cost.toFixed(2)} for ${out.length} readings`);
  mkdirSync("eval-results", { recursive: true });
  const file = path.join("eval-results", `real-${effort ?? "live"}${side ? `-${side}px` : ""}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ effort: effort ?? "live", results: out, total, byGroup, tokens, cost }, null, 2));
  console.log(`Saved ${file}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
