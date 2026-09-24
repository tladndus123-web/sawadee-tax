"use client";

// Vendor dictionary in Supabase (public.vendors). Rows are created by a database trigger when
// documents are saved; members can correct names here. See lib/vendors.ts for how readings are tidied.

import { useEffect, useSyncExternalStore } from "react";
import { normalize } from "./normalize";
import { supabaseBrowser } from "./supabase/client";
import type { Tri } from "./types";
import { applyVendor, type Vendor, type VendorFix, vendorKey } from "./vendors";
import type { LedgerDoc } from "./types";

interface VendorRow {
  id: string;
  tax_id: string;
  name: unknown;
  address: unknown;
  branch: unknown;
  tel: string;
  fax: string;
}

/** Rows through normalize() so any stored shape becomes clean {th, en, ja} */
function toVendor(r: VendorRow): Vendor {
  const s = normalize({ seller: { name: r.name, address: r.address, branch: r.branch } }).seller;
  return { id: r.id, taxId: r.tax_id, name: s.name, address: s.address, branch: s.branch, tel: r.tel ?? "", fax: r.fax ?? "" };
}

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

/** Tidy a fresh AI reading with the dictionary (never throws: without a match the reading is unchanged) */
export async function withVendor(doc: LedgerDoc): Promise<{ doc: LedgerDoc; fixed: VendorFix[] }> {
  const key = vendorKey(doc);
  if (!key) return { doc, fixed: [] };
  try {
    const { data } = await supabaseBrowser().from("vendors").select("id, tax_id, name, address, branch, tel, fax").eq("tax_id", key).maybeSingle();
    return applyVendor(doc, data ? toVendor(data as VendorRow) : null);
  } catch {
    return { doc, fixed: [] };
  }
}
