"use client";

// Vendor dictionary in Supabase (public.vendors). Rows are created by a database trigger when
// documents are saved; members can correct names here. See lib/vendors.ts for how readings are tidied.

import { useEffect, useSyncExternalStore } from "react";
import { supabaseBrowser } from "./supabase/client";
import type { Tri } from "./types";
import { applyHistory, applyVendor, toVendor, type Vendor, type VendorFix, type VendorHistory, type VendorRow, vendorKey } from "./vendors";
import type { LedgerDoc } from "./types";

let vendors: Vendor[] = [];
let loaded = false;
const listeners = new Set<() => void>();

async function reload() {
  const { data, error } = await supabaseBrowser().from("vendors").select("id, tax_id, name, address, branch, tel, fax").order("tax_id");
  if (error) throw error;
  vendors = (data as VendorRow[]).map(toVendor);
  loaded = true;
  listeners.forEach((l) => l());
}

export function useVendors(): { vendors: Vendor[]; loaded: boolean } {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => vendors,
    () => vendors,
  );
  useEffect(() => {
    void reload();
  }, []);
  return { vendors: snap, loaded };
}

export async function saveVendorName(id: string, name: Tri) {
  const { error } = await supabaseBrowser().from("vendors").update({ name, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  await reload();
}

/**
 * Admin only: remove a vendor from the directory. Its documents keep the seller as read (only the link is
 * cleared); a later document from the same tax ID registers it again.
 */
export async function deleteVendor(id: string) {
  const { data, error } = await supabaseBrowser().from("vendors").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("not allowed");
  await reload();
}

/** category/payment of the vendor's newest saved document (null when none, or on any error) */
export async function vendorHistory(vendorId: string): Promise<VendorHistory | null> {
  try {
    const { data } = await supabaseBrowser()
      .from("documents")
      .select("category, payment")
      .eq("vendor_id", vendorId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as VendorHistory | null) ?? null;
  } catch {
    return null;
  }
}

/** Tidy a fresh AI reading with the dictionary (never throws: without a match the reading is unchanged) */
export async function withVendor(doc: LedgerDoc): Promise<{ doc: LedgerDoc; fixed: VendorFix[] }> {
  const key = vendorKey(doc);
  if (!key) return { doc, fixed: [] };
  try {
    const { data } = await supabaseBrowser().from("vendors").select("id, tax_id, name, address, branch, tel, fax").eq("tax_id", key).maybeSingle();
    const named = applyVendor(doc, data ? toVendor(data as VendorRow) : null);
    if (!data) return named;
    // The person's last saved category/payment for this vendor carries over to the fresh reading
    const hist = applyHistory(named.doc, await vendorHistory((data as VendorRow).id));
    return { doc: hist.doc, fixed: [...named.fixed, ...hist.fixed] };
  } catch {
    return { doc, fixed: [] };
  }
}
