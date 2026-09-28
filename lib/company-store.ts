"use client";

// Company-wide settings (public.company_settings, one row). Everyone reads; only admins can save (RLS).

import { useEffect, useSyncExternalStore } from "react";
import { supabaseBrowser } from "./supabase/client";

export interface CompanySettings {
  loaded: boolean;
  taxId: string;
  formConfig: unknown;
  stickerNames: Record<string, unknown>;
  /** Delivery-app commission rates in percent per channel (lib/app-fees) */
  appFees: Record<string, unknown>;
  /** Target shares of sales: food / labour / rent (lib/cost-control) */
  costTargets: Record<string, unknown>;
  /** The company's names for sales channels (e.g. "other" → "Wongnai") */
  channelNames: Record<string, string>;
}

const EMPTY: CompanySettings = { loaded: false, taxId: "", formConfig: {}, stickerNames: {}, appFees: {}, costTargets: {}, channelNames: {} };
let current: CompanySettings = EMPTY;
let started = false;
const listeners = new Set<() => void>();

async function load() {
  const { data } = await supabaseBrowser().from("company_settings").select("tax_id, form_config, sticker_names, app_fees, cost_targets, channel_names").eq("id", 1).maybeSingle();
  current = {
    loaded: true,
    taxId: data?.tax_id ?? "",
    formConfig: data?.form_config ?? {},
    stickerNames: (data?.sticker_names as Record<string, unknown>) ?? {},
    appFees: (data?.app_fees as Record<string, unknown>) ?? {},
    costTargets: (data?.cost_targets as Record<string, unknown>) ?? {},
    channelNames: (data?.channel_names as Record<string, string>) ?? {},
  };
  listeners.forEach((l) => l());
}

export function useCompany(): CompanySettings {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => EMPTY,
  );
  useEffect(() => {
    if (started) return;
    started = true;
    void load();
  }, []);
  return snap;
}

/** The company's tax ID, loading the settings first if nothing has yet */
export async function companyTaxId(): Promise<string> {
  if (!current.loaded) await load();
  return current.taxId;
}

/** Admin only (the database refuses anyone else). */
export async function saveCompany(patch: Partial<{ tax_id: string; form_config: unknown; sticker_names: unknown; app_fees: unknown; cost_targets: unknown; channel_names: unknown }>) {
  const { data, error } = await supabaseBrowser().from("company_settings").update(patch).eq("id", 1).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("not allowed");
  await load();
}
