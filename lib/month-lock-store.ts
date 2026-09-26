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
