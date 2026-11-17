"use client";

// The restaurant extras' switches (company_settings.extras): everyone reads them, admins change them (RLS on the row).
// Until the column exists (before migration …004500) everything reads as off.

import { useEffect, useSyncExternalStore } from "react";
import { type FoodFeature, type FoodFeatures, menuFeatures, readFoodFeatures } from "./food-features";
import type { NavFeature } from "./nav-menu";
import { shared } from "./shared-load";
import { supabaseBrowser } from "./supabase/client";

type State = FoodFeatures & { loaded: boolean; menu: NavFeature[] };

const OFF: State = { ...readFoodFeatures({}), loaded: false, menu: [] };
let current: State = OFF;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const load = shared(async () => {
  const { data, error } = await supabaseBrowser().from("company_settings").select("extras").eq("id", 1).maybeSingle();
  const f = readFoodFeatures(error ? {} : data?.extras);
  current = { ...f, loaded: true, menu: menuFeatures(f) };
  emit();
});

export function useFoodFeatures(): State {
  useEffect(() => {
    if (!started) {
      started = true;
      void load();
    }
  }, []);
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
    () => OFF,
  );
}

/** Switch one extra on or off (admins; the database refuses others) */
export async function setFoodFeature(key: FoodFeature, on: boolean) {
  const db = supabaseBrowser();
  const { data } = await db.from("company_settings").select("extras").eq("id", 1).maybeSingle();
  const next = { ...((data?.extras as Record<string, unknown>) ?? {}), [key]: on };
  const { error } = await db.from("company_settings").update({ extras: next }).eq("id", 1);
  if (error) throw error;
  const f = readFoodFeatures(next);
  current = { ...f, loaded: true, menu: menuFeatures(f) };
  emit();
}
