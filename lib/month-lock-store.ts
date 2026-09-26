"use client";

// Closed tax months (public.month_locks, "YYYY-MM"). Everyone reads; only admins close or reopen. The rule
// itself lives in the database (triggers): a closed month's saved documents can't change, except payment
// and stickers. This store only shows it and offers the admin buttons.

import { useEffect, useSyncExternalStore } from "react";
import { supabaseBrowser } from "./supabase/client";

let locked: ReadonlySet<string> = new Set();
let loadedAt = 0;
const listeners = new Set<() => void>();
const FRESH_MS = 30_000;

async function load() {
  const { data, error } = await supabaseBrowser().from("month_locks").select("month");
  if (error) return;
  locked = new Set((data ?? []).map((r) => r.month as string));
  loadedAt = Date.now();
  listeners.forEach((l) => l());
}

/** The closed months, e.g. has("2026-08") */
export function useMonthLocks(): ReadonlySet<string> {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => locked,
    () => locked,
  );
  useEffect(() => {
    if (Date.now() - loadedAt > FRESH_MS) void load();
  }, []);
  return snap;
}

/** The closed months, fresh enough to decide a save (loads them if the screen never did) */
export async function lockedMonths(): Promise<ReadonlySet<string>> {
  if (Date.now() - loadedAt > FRESH_MS) await load();
  return locked;
}

/** "2026-08" → "2026-09" */
export const nextMonth = (ym: string): string => {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 1));
  return d.toISOString().slice(0, 7);
};

/**
 * Claim month for an invoice whose own month is closed (already filed): the first month after it that is still
 * open. "" when the invoice month itself is open (the usual case).
 */
export function openClaimMonth(invoiceMonth: string, closed: ReadonlySet<string>): string {
  if (!/^\d{4}-\d{2}$/.test(invoiceMonth) || !closed.has(invoiceMonth)) return "";
  let m = nextMonth(invoiceMonth);
  while (closed.has(m)) m = nextMonth(m);
  return m;
}

/** Admin only (the database refuses anyone else) */
export async function closeMonth(month: string) {
  const { error } = await supabaseBrowser().from("month_locks").insert({ month });
  if (error) throw error;
  await load();
}

/** Admin only */
export async function reopenMonth(month: string) {
  const { error } = await supabaseBrowser().from("month_locks").delete().eq("month", month);
  if (error) throw error;
  await load();
}

/** The database refused a change because the document's tax month is closed */
export const isMonthLocked = (e: unknown): boolean => /month_locked/.test(String((e as { message?: string } | null)?.message ?? e));
