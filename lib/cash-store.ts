"use client";

// The cash box in Supabase (public.cash_moves): members of a branch record and read its lines, admins delete.
// Like the ledger, the list follows the branch the person works in. lib/petty-cash has the arithmetic.

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { ALL } from "./branches";
import { branchNow, subscribeBranch } from "./branch-store";
import type { FixedLine } from "./fixed-costs";
import { useFixedCosts } from "./fixed-store";
import { type CashKind, type CashMove, cashCostLines } from "./petty-cash";
import { supabaseBrowser } from "./supabase/client";
import { type Category, isCategoryKey } from "./types";

type Raw = { id: string; branch_id: string; day: string; kind: string; amount: number | string; category: string | null; receipt: boolean; memo: string; created_by: string | null; created_at: string };

let moves: CashMove[] = [];
let loaded = false;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function reload() {
  const { data, error } = await supabaseBrowser().from("cash_moves").select("id, branch_id, day, kind, amount, category, receipt, memo, created_by, created_at").order("day");
  if (error) throw error;
  moves = ((data ?? []) as Raw[]).map((r) => ({
    id: r.id,
    branchId: r.branch_id,
    day: r.day,
    kind: r.kind as CashKind,
    amount: Number(r.amount) || 0,
    category: r.category ? ((isCategoryKey(r.category) ? r.category : "other") as Category) : null,
    receipt: !!r.receipt,
    memo: r.memo ?? "",
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
  loaded = true;
  emit();
}

let viewKey: { moves: CashMove[]; branch: string } | null = null;
let view: CashMove[] = [];
function forBranch(): CashMove[] {
  const branch = branchNow();
  if (viewKey?.moves !== moves || viewKey.branch !== branch) {
    viewKey = { moves, branch };
    view = branch === ALL ? moves : moves.filter((m) => m.branchId === branch);
  }
  return view;
}

/** Cash lines of the branch the person works in; `all: true` = every branch they may see */
export function useCashMoves(opts: { all?: boolean } = {}): { moves: CashMove[]; loaded: boolean } {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      const off = subscribeBranch(l);
      return () => {
        listeners.delete(l);
        off();
      };
    },
    () => (opts.all ? moves : forBranch()),
    () => moves,
  );
  useEffect(() => {
    if (started) return;
    started = true;
    void reload().catch(() => {
      started = false;
      loaded = true;
      emit();
    });
  }, []);
  return { moves: snap, loaded };
}

/** The fixed costs plus cash spent without a receipt: what every cost figure counts besides the ledger */
export function useCostLines(opts: { all?: boolean } = {}): { lines: FixedLine[]; loaded: boolean } {
  const fixed = useFixedCosts(opts);
  const cash = useCashMoves(opts);
  const lines = useMemo(() => [...fixed.lines, ...cashCostLines(cash.moves)], [fixed.lines, cash.moves]);
  return { lines, loaded: fixed.loaded };
}

export type CashDraft = Pick<CashMove, "branchId" | "day" | "kind" | "amount" | "category" | "receipt" | "memo"> & { id?: string };

/** Add a line, or change one (not in a closed month) */
export async function saveCash(d: CashDraft) {
  const row = {
    branch_id: d.branchId,
    day: d.day,
    kind: d.kind,
    amount: Math.max(0, Math.round((d.amount || 0) * 100) / 100),
    category: d.kind === "out" ? d.category : null,
    receipt: d.kind === "out" ? d.receipt : false,
    memo: d.memo.trim().slice(0, 200),
  };
  const sb = supabaseBrowser();
  const { data, error } = d.id ? await sb.from("cash_moves").update(row).eq("id", d.id).select("id") : await sb.from("cash_moves").insert(row).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("not allowed");
  await reload();
}

/** Admins only (the database refuses others, and any line of a closed month) */
export async function deleteCash(id: string) {
  const { data, error } = await supabaseBrowser().from("cash_moves").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("not allowed");
  await reload();
}
