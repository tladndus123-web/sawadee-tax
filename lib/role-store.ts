"use client";

// The signed-in member (Supabase Auth + public.members). Role checks here only shape the UI;
// the database enforces the same rules with RLS (supabase/migrations).

import { useEffect, useSyncExternalStore } from "react";
import { routing } from "@/i18n/routing";
import { supabaseBrowser } from "./supabase/client";

export type Role = "admin" | "staff";
export interface Me {
  loaded: boolean;
  userId: string | null;
  email: string;
  name: string;
  role: Role;
  /** The branch an admin set as this person's usual one (first in the branch list after signing in) */
  homeBranch: string | null;
}

const SIGNED_OUT: Me = { loaded: false, userId: null, email: "", name: "", role: "staff", homeBranch: null };
let me: Me = SIGNED_OUT;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function load() {
  const supabase = supabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    me = { ...SIGNED_OUT, loaded: true };
    return emit();
  }
  const { data } = await supabase.from("members").select("name, role, email, home_branch").eq("user_id", user.id).maybeSingle();
  // Signed in but not an (active) member any more — e.g. an admin removed their access: sign out and say why
  if (!data && !/\/(login|auth)(\/|$)/.test(window.location.pathname)) {
    await supabase.auth.signOut();
    const locale = window.location.pathname.split("/")[1] || routing.defaultLocale;
    window.location.assign(`/${locale}/login?removed=1`);
    return;
  }
  me = {
    loaded: true,
    userId: user.id,
    email: data?.email ?? user.email ?? "",
    name: data?.name ?? "",
    role: data?.role === "admin" ? "admin" : "staff",
    homeBranch: (data?.home_branch as string | null) ?? null,
  };
  emit();
}

function start() {
  if (started) return;
  started = true;
  void load();
  supabaseBrowser().auth.onAuthStateChange((event: string) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") void load();
  });
}

export function useMe(): Me {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => me,
    () => SIGNED_OUT,
  );
  useEffect(start, []);
  return snap;
}

/** Change my display name (recorded in deletions etc.) */
export async function saveMyName(name: string) {
  if (!me.userId) return;
  const { error } = await supabaseBrowser().from("members").update({ name: name.trim().slice(0, 40) }).eq("user_id", me.userId);
  if (error) throw error;
  await load();
}

export async function signOut() {
  // Close the branch this sign-in opened, so the next person must choose (and type its PIN) again
  await import("./branch-lock").then((m) => m.lockBranch()).catch(() => undefined);
  await supabaseBrowser().auth.signOut();
  window.location.assign("/");
}
