"use client";

// TEMPORARY role until login exists (step 5): chosen in Settings, kept in localStorage.
// Step 5 replaces this with the signed-in member's role from company_members.

import { useSyncExternalStore } from "react";

export type Role = "admin" | "staff";
export interface Me {
  role: Role;
  /** Recorded as deleted_by on soft delete */
  name: string;
}

const KEY = "trl.me";
const DEFAULT: Me = { role: "admin", name: "" };
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: Me } | null = null;

function read(): Me {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (cache && cache.raw === raw) return cache.value;
  let v: Partial<Me> = {};
  try {
    v = raw ? (JSON.parse(raw) as Partial<Me>) : {};
  } catch {}
  cache = {
    raw,
    value: { role: v.role === "staff" ? "staff" : "admin", name: typeof v.name === "string" ? v.name.slice(0, 40) : "" },
  };
  return cache.value;
}

export function saveMe(me: Me) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ role: me.role, name: me.name.slice(0, 40) }));
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export const useMe = (): Me => useSyncExternalStore(subscribe, read, () => DEFAULT);
