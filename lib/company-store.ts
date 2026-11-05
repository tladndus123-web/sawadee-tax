"use client";

// Company-wide settings (public.company_settings, one row). Everyone reads; only admins can save (RLS).

import { useEffect, useSyncExternalStore } from "react";
import { type ExcelFormat, readExcelFormat } from "./excel-format";
import { supabaseBrowser } from "./supabase/client";

export interface CompanySettings {
  loaded: boolean;
  taxId: string;
  /** The company's own name, address and branch number as typed in the settings (empty = not typed) */
  name: { th: string; en: string };
  address: { th: string; en: string };
  branch: string;
  formConfig: unknown;
  stickerNames: Record<string, unknown>;
  /** Delivery-app commission rates in percent per channel (lib/app-fees) */
  appFees: Record<string, unknown>;
  /** Target shares of sales: food / labour / rent (lib/cost-control) */
  costTargets: Record<string, unknown>;
  /** The company's names for sales channels (e.g. "other" → "Wongnai") */
  channelNames: Record<string, string>;
  /** Social security rate, floor and ceiling (lib/payroll: payrollSettingsOf) */
  payrollSettings: Record<string, unknown>;
  /** POS export columns remembered from an import (lib/pos-import posColumnsOf) */
  posColumns: Record<string, unknown>;
  /** The accountant's Excel column layout (lib/excel-format), or null = the usual one */
  excelFormat: ExcelFormat | null;
}

const EMPTY: CompanySettings = { loaded: false, taxId: "", name: { th: "", en: "" }, address: { th: "", en: "" }, branch: "", formConfig: {}, stickerNames: {}, appFees: {}, costTargets: {}, channelNames: {}, payrollSettings: {}, posColumns: {}, excelFormat: null };
let current: CompanySettings = EMPTY;
let started = false;
const listeners = new Set<() => void>();

async function load() {
  const { data } = await supabaseBrowser().from("company_settings").select("tax_id, name, address, branch, form_config, sticker_names, app_fees, cost_targets, channel_names, payroll_settings, pos_columns, excel_format").eq("id", 1).maybeSingle();
  current = {
    loaded: true,
    taxId: data?.tax_id ?? "",
    name: thEn(data?.name),
    address: thEn(data?.address),
    branch: (data?.branch as string) ?? "",
    formConfig: data?.form_config ?? {},
    stickerNames: (data?.sticker_names as Record<string, unknown>) ?? {},
    appFees: (data?.app_fees as Record<string, unknown>) ?? {},
    costTargets: (data?.cost_targets as Record<string, unknown>) ?? {},
    channelNames: (data?.channel_names as Record<string, string>) ?? {},
    payrollSettings: (data?.payroll_settings as Record<string, unknown>) ?? {},
    posColumns: (data?.pos_columns as Record<string, unknown>) ?? {},
    excelFormat: readExcelFormat(data?.excel_format),
  };
  listeners.forEach((l) => l());
}

const thEn = (v: unknown) => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { th: typeof o.th === "string" ? o.th : "", en: typeof o.en === "string" ? o.en : "" };
};

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
export async function saveCompany(patch: Partial<{ tax_id: string; name: unknown; address: unknown; branch: string; form_config: unknown; sticker_names: unknown; app_fees: unknown; cost_targets: unknown; channel_names: unknown; payroll_settings: unknown; pos_columns: unknown; excel_format: unknown }>) {
  const { data, error } = await supabaseBrowser().from("company_settings").update(patch).eq("id", 1).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("not allowed");
  await load();
}
