"use client";

// Vendor dictionary in Supabase (public.vendors). Rows are created by a database trigger when
// documents are saved; members can correct names here. See lib/vendors.ts for how readings are tidied.

import { useEffect, useSyncExternalStore } from "react";
import { supabaseBrowser } from "./supabase/client";
import type { Tri } from "./types";
import { applyHistory, applyRule, applyVendor, SUGGEST_AFTER, suggestRule, toVendor, type Vendor, type VendorFix, type VendorHistory, type VendorRow, VENDOR_COLUMNS, vendorKey } from "./vendors";
import type { LedgerDoc } from "./types";

let vendors: Vendor[] = [];
let loaded = false;
const listeners = new Set<() => void>();

async function reload() {
  const { data, error } = await supabaseBrowser().from("vendors").select(VENDOR_COLUMNS).order("tax_id");
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

/** Admins only (the database refuses others): how to pay the vendor */
export async function saveVendorPay(id: string, pay: { pay_promptpay: string; pay_bank: string; pay_account: string; pay_name: string }) {
  const { data, error } = await supabaseBrowser().from("vendors").update({ ...pay, updated_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("not allowed");
  await reload();
}

/** Set a vendor's automatic registration rule (auto_register: admins only — the database refuses others) */
export async function saveVendorRule(
  id: string,
  patch: Partial<{ rule_category: string | null; rule_payment: string | null; auto_register: boolean }>,
) {
  const { data, error } = await supabaseBrowser().from("vendors").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("not allowed");
  await reload();
}

/** "Always do it this way?" for the seller of a just-saved document, or null */
export async function ruleSuggestionFor(doc: LedgerDoc): Promise<{ vendor: Vendor; rule: VendorHistory } | null> {
  const key = vendorKey(doc);
  if (!key) return null;
  try {
    const sb = supabaseBrowser();
    const { data: row } = await sb.from("vendors").select(VENDOR_COLUMNS).eq("tax_id", key).maybeSingle();
    if (!row) return null;
    const vendor = toVendor(row as VendorRow);
    const { data: recent } = await sb
      .from("documents")
      .select("category, payment")
      .eq("vendor_id", vendor.id)
      .eq("status", "reviewed")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(SUGGEST_AFTER);
    const rule = suggestRule((recent as VendorHistory[] | null) ?? [], vendor);
    return rule ? { vendor, rule } : null;
  } catch {
    return null;
  }
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

/**
 * Tidy a fresh AI reading with the dictionary, then the vendor's last saved choice, then its rule (the rule wins).
 * Never throws: without a match the reading is unchanged.
 */
export async function withVendor(doc: LedgerDoc): Promise<{ doc: LedgerDoc; fixed: VendorFix[]; vendor: Vendor | null }> {
  const key = vendorKey(doc);
  if (!key) return { doc, fixed: [], vendor: null };
  try {
    const { data } = await supabaseBrowser().from("vendors").select(VENDOR_COLUMNS).eq("tax_id", key).maybeSingle();
    const vendor = data ? toVendor(data as VendorRow) : null;
    const named = applyVendor(doc, vendor);
    if (!vendor) return { ...named, vendor: null };
    // The person's last saved category/payment carries over; a rule set for the vendor wins over both
    const hist = applyHistory(named.doc, await vendorHistory(vendor.id));
    const ruled = applyRule(hist.doc, vendor);
    const fixed = [...new Set([...named.fixed, ...hist.fixed, ...ruled.fixed])];
    return { doc: ruled.doc, fixed, vendor };
  } catch {
    return { doc, fixed: [], vendor: null };
  }
}
