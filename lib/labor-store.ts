"use client";

// Labour costs in Supabase (public.labor_costs): one line per branch and month, typed in by admins (Thai payroll:
// wages, the employer's social security share, other staff costs). Everyone reads; closed months are frozen.
// Like the ledger and sales, the list follows the branch the person works in.

import { useEffect, useSyncExternalStore } from "react";
import { ALL } from "./branches";
import { branchNow, subscribeBranch } from "./branch-store";
import type { LaborLine } from "./cost-control";
import { supabaseBrowser } from "./supabase/client";

type Raw = { branch_id: string; month: string; wages: number | string; social_security: number | string; other: number | string; note: string };

let lines: LaborLine[] = [];
let loaded = false;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function reload() {
  const { data, error } = await supabaseBrowser().from("labor_costs").select("branch_id, month, wages, social_security, other, note");
  if (error) throw error;
  lines = ((data ?? []) as Raw[]).map((r) => ({
    branchId: r.branch_id,
    month: r.month,
    wages: Number(r.wages) || 0,
    socialSecurity: Number(r.social_security) || 0,
    other: Number(r.other) || 0,
    note: r.note ?? "",
  }));
  loaded = true;
  emit();
}

let viewKey: { lines: LaborLine[]; branch: string } | null = null;
let view: LaborLine[] = [];
function forBranch(): LaborLine[] {
  const branch = branchNow();
  if (viewKey?.lines !== lines || viewKey.branch !== branch) {
    viewKey = { lines, branch };
    view = branch === ALL ? lines : lines.filter((l) => l.branchId === branch);
  }
  return view;
}

/** Labour lines of the branch the person works in; `all: true` = every branch */
export function useLabor(opts: { all?: boolean } = {}): { lines: LaborLine[]; loaded: boolean } {
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

/** Admin only; a closed month is refused by the database. One line per branch and month (a second save replaces it). */
export async function saveLabor(l: LaborLine) {
  const row = {
    ...(l.branchId ? { branch_id: l.branchId } : {}),
    month: l.month,
    wages: Math.max(0, l.wages || 0),
    social_security: Math.max(0, l.socialSecurity || 0),
    other: Math.max(0, l.other || 0),
    note: l.note.trim().slice(0, 200),
  };
  const { error } = await supabaseBrowser().from("labor_costs").upsert(row, { onConflict: "branch_id,month" });
  if (error) throw error;
  await reload();
}
