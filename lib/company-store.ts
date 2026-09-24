"use client";

// Company-wide settings (public.company_settings, one row). Everyone reads; only admins can save (RLS).

import { useEffect, useSyncExternalStore } from "react";
import { supabaseBrowser } from "./supabase/client";

export interface CompanySettings {
  loaded: boolean;
  taxId: string;
  formConfig: unknown;
  stickerNames: Record<string, unknown>;
}

const EMPTY: CompanySettings = { loaded: false, taxId: "", formConfig: {}, stickerNames: {} };
let current: CompanySettings = EMPTY;
let started = false;
const listeners = new Set<() => void>();

async function load() {
  const { data } = await supabaseBrowser().from("company_settings").select("tax_id, form_config, sticker_names").eq("id", 1).maybeSingle();
  current = {
    loaded: true,
    taxId: data?.tax_id ?? "",
    formConfig: data?.form_config ?? {},
    stickerNames: (data?.sticker_names as Record<string, unknown>) ?? {},
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

/** Admin only (the database refuses anyone else). */
export async function saveCompany(patch: Partial<{ tax_id: string; form_config: unknown; sticker_names: unknown }>) {
  const { data, error } = await supabaseBrowser().from("company_settings").update(patch).eq("id", 1).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("not allowed");
  await load();
}
