"use client";

// Branches in Supabase (public.branches; admins keep the list) and the branch the person is working in — kept on
// this device ("all" or a branch id). The ledger and sales stores read the choice to show one branch's books.

import { useEffect, useSyncExternalStore } from "react";
import { ALL, type Branch, sortBranches } from "./branches";
import { supabaseBrowser } from "./supabase/client";

const KEY = "trl.branch";

let branches: Branch[] = [];
let loaded = false;
let started = false;
let selected: string = ALL;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  try {
    selected = localStorage.getItem(KEY) || ALL;
  } catch {}
}

const toBranch = (r: { id: string; no: string; name: string; sort: number }): Branch => ({ id: r.id, no: r.no, name: r.name ?? "", sort: Number(r.sort) || 0 });

async function reload() {
  const { data, error } = await supabaseBrowser().from("branches").select("id, no, name, sort");
  if (error) throw error;
  branches = sortBranches((data ?? []).map(toBranch));
  // A branch that was removed on another device
  if (selected !== ALL && !branches.some((b) => b.id === selected)) setBranch(ALL);
  loaded = true;
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useBranches(): { branches: Branch[]; loaded: boolean } {
  const snap = useSyncExternalStore(subscribe, () => branches, () => branches);
  useEffect(() => {
    if (started) return;
    started = true;
    void reload().catch(() => (started = false));
  }, []);
  return { branches: snap, loaded };
}

/** The branch the person is working in ("all" = every branch together) */
export function useBranch(): string {
  return useSyncExternalStore(subscribe, () => selected, () => ALL);
}

export function setBranch(id: string) {
  selected = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {}
  emit();
}

/** Other stores re-filter when the choice changes */
export const subscribeBranch = subscribe;

/** For code outside React (the upload queue): the lists as they are right now */
export const branchesNow = () => branches;
export const branchNow = () => selected;

/** Admin only (the database refuses anyone else) */
export async function saveBranch(b: { id?: string; no: string; name: string; sort?: number }) {
  const row = { no: b.no, name: b.name.trim(), ...(b.sort !== undefined ? { sort: b.sort } : {}) };
  const q = b.id ? supabaseBrowser().from("branches").update(row).eq("id", b.id).select("id") : supabaseBrowser().from("branches").insert(row).select("id");
  const { data, error } = await q;
  if (error) throw error;
  if (!data?.length) throw new Error("not allowed");
  await reload();
}

/** Admin only; the database refuses the head office and a branch that has books */
export async function deleteBranch(id: string) {
  const { data, error } = await supabaseBrowser().from("branches").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("not allowed");
  await reload();
}
