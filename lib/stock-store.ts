"use client";

// Month-end stock in Supabase (public.stock_counts): one total per branch and month, typed in by admins
// (lib/stock.ts explains how it changes the food cost). Everyone reads; closed months are frozen.
// Like labour, the list follows the branch the person works in.

import { useEffect, useSyncExternalStore } from "react";
import { ALL } from "./branches";
import { branchNow, subscribeBranch } from "./branch-store";
import type { StockCount } from "./stock";
import { supabaseBrowser } from "./supabase/client";

type Raw = { branch_id: string; month: string; amount: number | string; note: string };

let counts: StockCount[] = [];
let loaded = false;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function reload() {
  const { data, error } = await supabaseBrowser().from("stock_counts").select("branch_id, month, amount, note");
  if (error) throw error;
  counts = ((data ?? []) as Raw[]).map((r) => ({ branchId: r.branch_id, month: r.month, amount: Number(r.amount) || 0, note: r.note ?? "" }));
  loaded = true;
  emit();
}

let viewKey: { counts: StockCount[]; branch: string } | null = null;
let view: StockCount[] = [];
function forBranch(): StockCount[] {
  const branch = branchNow();
  if (viewKey?.counts !== counts || viewKey.branch !== branch) {
    viewKey = { counts, branch };
    view = branch === ALL ? counts : counts.filter((c) => c.branchId === branch);
  }
  return view;
}

/** Stock counts of the branch the person works in; `all: true` = every branch */
export function useStock(opts: { all?: boolean } = {}): { counts: StockCount[]; loaded: boolean } {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      const off = subscribeBranch(l);
      return () => {
        listeners.delete(l);
        off();
      };
    },
    () => (opts.all ? counts : forBranch()),
    () => counts,
  );
  useEffect(() => {
    if (started) return;
    started = true;
    void reload().catch(() => (started = false));
  }, []);
  return { counts: snap, loaded };
}

/** Admin only; a closed month is refused by the database. One total per branch and month (a second save replaces it). */
export async function saveStock(c: StockCount) {
  const row = { ...(c.branchId ? { branch_id: c.branchId } : {}), month: c.month, amount: Math.max(0, c.amount || 0), note: c.note.trim().slice(0, 200) };
  const { error } = await supabaseBrowser().from("stock_counts").upsert(row, { onConflict: "branch_id,month" });
  if (error) throw error;
  await reload();
}
