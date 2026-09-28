"use client";

// Categories in Supabase (public.categories): the 12 built-in ones (renamed or hidden by admins) and the company's
// own (key "c_…"). Everyone reads; only admins change them (RLS). Names are kept per screen language.

import { useEffect, useSyncExternalStore } from "react";
import { setBlockedCategories } from "./checks";
import { supabaseBrowser } from "./supabase/client";
import { CATEGORIES, type Category } from "./types";

export const UI_LANGS = ["ko", "th", "en", "ja"] as const;
export type UiLang = (typeof UI_LANGS)[number];

export interface CategoryRow {
  key: Category;
  builtin: boolean;
  /** Per screen language; "" = the built-in name */
  name: Partial<Record<UiLang, string>>;
  hint: string;
  icon: string;
  color: string;
  vatBlocked: boolean;
  hidden: boolean;
  sort: number;
}

/** Until the table has loaded (or if it cannot): the built-in list */
const DEFAULTS: CategoryRow[] = CATEGORIES.map((key, i) => ({
  key,
  builtin: true,
  name: {},
  hint: "",
  icon: "",
  color: "",
  vatBlocked: key === "entertainment",
  hidden: false,
  sort: (i + 1) * 10,
}));

let rows: CategoryRow[] = DEFAULTS;
let loaded = false;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

type Raw = { key: string; builtin: boolean; name: Record<string, string> | null; hint: string; icon: string; color: string; vat_blocked: boolean; hidden: boolean; sort: number };

const toRow = (r: Raw): CategoryRow => ({
  key: r.key as Category,
  builtin: !!r.builtin,
  name: (r.name ?? {}) as CategoryRow["name"],
  hint: r.hint ?? "",
  icon: r.icon ?? "",
  color: r.color ?? "",
  vatBlocked: !!r.vat_blocked,
  hidden: !!r.hidden,
  sort: Number(r.sort) || 0,
});

async function reload() {
  const { data, error } = await supabaseBrowser().from("categories").select("key, builtin, name, hint, icon, color, vat_blocked, hidden, sort");
  if (error) throw error;
  const list = (data as Raw[]).map(toRow);
  // Built-in ones missing from the table (should not happen) still exist
  for (const d of DEFAULTS) if (!list.some((r) => r.key === d.key)) list.push(d);
  rows = list.sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key));
  setBlockedCategories(rows.filter((r) => r.vatBlocked).map((r) => r.key));
  loaded = true;
  emit();
}

export function useCategories(): { rows: CategoryRow[]; loaded: boolean } {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => rows,
    () => DEFAULTS,
  );
  useEffect(() => {
    if (started) return;
    started = true;
    void reload().catch(() => (started = false));
  }, []);
  return { rows: snap, loaded };
}

/** A new key for a company category: "c_" + 6 letters/digits */
export const newCategoryKey = (): Category => `c_${Math.random().toString(36).slice(2, 8).padEnd(6, "0")}`;

/** Admin only (the database refuses anyone else) */
export async function saveCategory(r: Omit<CategoryRow, "builtin"> & { isNew?: boolean }) {
  const row = { key: r.key, name: r.name, hint: r.hint.trim().slice(0, 300), icon: r.icon, color: r.color, vat_blocked: r.vatBlocked, hidden: r.hidden, sort: r.sort };
  const q = r.isNew ? supabaseBrowser().from("categories").insert(row).select("key") : supabaseBrowser().from("categories").update(row).eq("key", r.key).select("key");
  const { data, error } = await q;
  if (error) throw error;
  if (!data?.length) throw new Error("not allowed");
  await reload();
}

/** Admin only; the database refuses built-in and used categories (hide those instead) */
export async function deleteCategory(key: string) {
  const { data, error } = await supabaseBrowser().from("categories").delete().eq("key", key).select("key");
  if (error) throw error;
  if (!data?.length) throw new Error("not allowed");
  await reload();
}
