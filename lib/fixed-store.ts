"use client";

// Fixed costs in Supabase (public.fixed_costs): everyone reads (they are in the cost figures), admins write.
// Like the ledger, the list follows the branch the person works in. A closed month keeps its lines: to change an
// amount the app ends the old line and starts a new one from the chosen month (changeAmount).

import { useEffect, useSyncExternalStore } from "react";
import { ALL } from "./branches";
import { branchNow, subscribeBranch } from "./branch-store";
import { type FixedLine, prevMonth } from "./fixed-costs";
import { supabaseBrowser } from "./supabase/client";
import { type Category, isCategoryKey } from "./types";

type Raw = { id: string; branch_id: string; category: string; name: string; amount: number | string; from_month: string; to_month: string | null; note: string };

let lines: FixedLine[] = [];
let loaded = false;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function reload() {
  const { data, error } = await supabaseBrowser().from("fixed_costs").select("id, branch_id, category, name, amount, from_month, to_month, note").order("from_month");
  if (error) throw error;
  lines = ((data ?? []) as Raw[]).map((r) => ({
    id: r.id,
    branchId: r.branch_id,
    category: (isCategoryKey(r.category) ? r.category : "other") as Category,
    name: r.name,
    amount: Number(r.amount) || 0,
    fromMonth: r.from_month,
    toMonth: r.to_month,
    note: r.note ?? "",
  }));
  loaded = true;
  emit();
}

let viewKey: { lines: FixedLine[]; branch: string } | null = null;
let view: FixedLine[] = [];
function forBranch(): FixedLine[] {
  const branch = branchNow();
  if (viewKey?.lines !== lines || viewKey.branch !== branch) {
    viewKey = { lines, branch };
    view = branch === ALL ? lines : lines.filter((l) => l.branchId === branch);
  }
  return view;
}

/** Fixed-cost lines of the branch the person works in; `all: true` = every branch */
export function useFixedCosts(opts: { all?: boolean } = {}): { lines: FixedLine[]; loaded: boolean } {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      const off = subscribeBranch(l);
      return () => {
        listeners.delete(l);
        off();
      };
    },
    () => (opts.all ? lines : forBranch()),
    () => lines,
  );
  useEffect(() => {
    if (started) return;
    started = true;
    void reload().catch(() => (started = false));
  }, []);
  return { lines: snap, loaded };
}

const row = (l: Omit<FixedLine, "id">) => ({
  ...(l.branchId ? { branch_id: l.branchId } : {}),
  category: l.category,
  name: l.name.trim().slice(0, 60),
  amount: Math.max(0, l.amount || 0),
  from_month: l.fromMonth,
  to_month: l.toMonth,
  note: l.note.trim().slice(0, 200),
});

/** Admin only. A new line, or the name / note / end month of an existing one (its amount is history: see changeAmount) */
export async function saveFixed(l: Omit<FixedLine, "id"> & { id?: string }) {
  const sb = supabaseBrowser();
  const q = l.id ? sb.from("fixed_costs").update(row(l)).eq("id", l.id).select("id") : sb.from("fixed_costs").insert(row(l)).select("id");
  const { data, error } = await q;
  if (error) throw error;
  if (!data?.length) throw new Error("not allowed");
  await reload();
}

/** A new amount from a month on: the old line ends the month before, a new one starts (a closed month keeps its old amount) */
export async function changeAmount(old: FixedLine, amount: number, fromMonth: string) {
  const sb = supabaseBrowser();
  if (fromMonth <= old.fromMonth) {
    // Nothing of the old line would remain: replace it
    const { error } = await sb.from("fixed_costs").update({ amount: Math.max(0, amount || 0), from_month: fromMonth }).eq("id", old.id);
    if (error) throw error;
  } else {
    const ended = await sb.from("fixed_costs").update({ to_month: prevMonth(fromMonth) }).eq("id", old.id).select("id");
    if (ended.error) throw ended.error;
    const { error } = await sb.from("fixed_costs").insert(row({ ...old, amount, fromMonth, toMonth: old.toMonth && old.toMonth < fromMonth ? null : old.toMonth }));
    if (error) throw error;
  }
  await reload();
}

/** Admin only; refused while the line covers a closed month (end it instead) */
export async function deleteFixed(id: string) {
  const { error } = await supabaseBrowser().from("fixed_costs").delete().eq("id", id);
  if (error) throw error;
  await reload();
}
