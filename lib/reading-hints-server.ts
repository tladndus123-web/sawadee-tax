// Server only: what the AI reading is told about the company before it looks at a photo (owner, 2026-10-14), and
// our own name / branch addresses for fixing the buyer afterwards (lib/our-company). Cached for 10 minutes; any
// error just means no hints.

import { normalize } from "./normalize";
import { type OurCompany, ourCompanyFrom } from "./our-company";
import { supabaseAdmin } from "./supabase/admin";

const TTL = 10 * 60_000;
const MAX_VENDORS = 120;
let cache: { at: number; vendors: string; ours: OurCompany | null } | null = null;

/** One line per known vendor, the most used first: tax ID | Thai name | English name */
export function vendorHintText(rows: { tax_id: string | null; name: { th?: string; en?: string } | null; uses: number }[]): string {
  const lines = rows
    .filter((r) => r.tax_id && (r.name?.th || r.name?.en))
    .sort((a, b) => b.uses - a.uses)
    .slice(0, MAX_VENDORS)
    .map((r) => `${r.tax_id} | ${(r.name?.th ?? "").trim()} | ${(r.name?.en ?? "").trim()}`);
  if (!lines.length) return "";
  return [
    "Known sellers of this company (tax ID | Thai name | English name), as saved after a person checked them.",
    "If the seller on the photo has one of these tax IDs, or clearly the same name, copy that seller's Thai and English names exactly as listed here instead of re-spelling them. Never copy a tax ID from this list: read it from the photo.",
    ...lines,
  ].join("\n");
}

async function load() {
  const db = supabaseAdmin();
  const [vendors, docs, company] = await Promise.all([
    db.from("vendors").select("id, tax_id, name"),
    db.from("documents").select("vendor_id, customer").is("deleted_at", null).eq("status", "reviewed"),
    db.from("company_settings").select("tax_id").eq("id", 1).maybeSingle(),
  ]);
  const uses = new Map<string, number>();
  for (const d of docs.data ?? []) if (d.vendor_id) uses.set(d.vendor_id as string, (uses.get(d.vendor_id as string) ?? 0) + 1);
  const vendorText = vendorHintText(
    ((vendors.data ?? []) as { id: string; tax_id: string | null; name: { th?: string; en?: string } | null }[]).map((v) => ({ ...v, uses: uses.get(v.id) ?? 0 })),
  );
  const asDocs = (docs.data ?? []).map((d) => normalize({ customer: d.customer }));
  const ours = company.data?.tax_id ? ourCompanyFrom(asDocs, String(company.data.tax_id)) : null;
  return { at: Date.now(), vendors: vendorText, ours };
}

/** The known-vendor hint for the prompt and our company for fixing the buyer (both may be empty) */
export async function readingHints(): Promise<{ vendors: string; ours: OurCompany | null }> {
  if (cache && Date.now() - cache.at < TTL) return cache;
  try {
    cache = await load();
  } catch {
    cache = { at: Date.now(), vendors: cache?.vendors ?? "", ours: cache?.ours ?? null };
  }
  return cache;
}
