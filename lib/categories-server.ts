// Server only: the company's categories (public.categories) for the AI's instructions and for which input VAT is
// not claimable. Cached for a minute; without a database (the accuracy script) the built-in ones only.

import { type PromptCategory } from "./category-prompt";
import { setBlockedCategories } from "./checks";
import { supabaseAdmin } from "./supabase/admin";

let cache: { at: number; rows: PromptCategory[] } | null = null;

export async function serverCategories(): Promise<PromptCategory[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.rows;
  try {
    const { data, error } = await supabaseAdmin().from("categories").select("key, builtin, name, hint, hidden, vat_blocked");
    if (error) throw error;
    const rows = (data ?? []) as (PromptCategory & { vat_blocked: boolean })[];
    setBlockedCategories(rows.filter((r) => r.vat_blocked).map((r) => r.key));
    cache = { at: Date.now(), rows: rows.map((r) => ({ key: r.key, builtin: r.builtin, name: r.name ?? {}, hint: r.hint ?? "", hidden: r.hidden })) };
    return cache.rows;
  } catch {
    return cache?.rows ?? [];
  }
}
