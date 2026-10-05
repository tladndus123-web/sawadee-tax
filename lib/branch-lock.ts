"use client";

// Branch PINs on the client (the database decides: supabase/migrations/20260929001000_branch_pins.sql). Staff open
// one branch per sign-in with its PIN; admins open any branch without one. The branch chosen at this sign-in is
// remembered on the device against the sign-in time, so a new sign-in asks again.

import { useEffect, useSyncExternalStore } from "react";
import { supabaseBrowser } from "./supabase/client";

const CHOSEN_KEY = "trl.branch.signin";

let pins: ReadonlySet<string> = new Set();
let loaded = false;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function reload() {
  const { data, error } = await supabaseBrowser().rpc("branches_with_pin");
  if (error) throw error;
  pins = new Set(((data ?? []) as unknown[]).map(String));
  loaded = true;
  emit();
}

/** Which branches have a PIN (lock icons; never the PINs) */
export function useBranchPins(): { pins: ReadonlySet<string>; loaded: boolean } {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pins,
    () => pins,
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
  return { pins: snap, loaded };
}

export type UnlockResult = "ok" | "wrong" | "wait";

/** Open a branch (staff: with its PIN; it closes the one opened before) */
export async function unlockBranch(branchId: string, pin: string): Promise<UnlockResult> {
  const { data, error } = await supabaseBrowser().rpc("unlock_branch", { p_branch: branchId, p_pin: pin });
  if (error) {
    if (/too_many_tries/.test(error.message)) return "wait";
    throw error;
  }
  return data ? "ok" : "wrong";
}

/** Close the branch I opened (signing out) — best effort */
export async function lockBranch() {
  await supabaseBrowser().rpc("lock_branch").then(
    () => undefined,
    () => undefined,
  );
  try {
    localStorage.removeItem(CHOSEN_KEY);
  } catch {}
}

/** The branch I have open on the database side, if it is still open */
export async function myUnlock(): Promise<{ branchId: string; expiresAt: number } | null> {
  const { data } = await supabaseBrowser().from("branch_unlocks").select("branch_id, expires_at").maybeSingle();
  if (!data) return null;
  const expiresAt = Date.parse(data.expires_at as string);
  return expiresAt > Date.now() ? { branchId: data.branch_id as string, expiresAt } : null;
}

/** Admins only: set, change or remove ("") a branch's PIN */
export async function setBranchPin(branchId: string, pin: string) {
  const { error } = await supabaseBrowser().rpc("set_branch_pin", { p_branch: branchId, p_pin: pin });
  if (error) throw error;
  await reload();
}

/** This sign-in (its time): a new sign-in asks for the branch again */
export async function signInMark(): Promise<string> {
  const { data } = await supabaseBrowser().auth.getSession();
  return data.session?.user.last_sign_in_at ?? data.session?.user.id ?? "";
}

export const chosenFor = (): string => {
  try {
    return localStorage.getItem(CHOSEN_KEY) ?? "";
  } catch {
    return "";
  }
};

export const markChosen = (mark: string) => {
  try {
    localStorage.setItem(CHOSEN_KEY, mark);
  } catch {}
};
