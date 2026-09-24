"use client";

// TEMPORARY storage for the company form settings until Supabase exists (step 5):
// kept in localStorage and shared between components through a small subscription.

import { useSyncExternalStore } from "react";
import { DEFAULT_FORM_CONFIG, type FormConfig, sanitizeFormConfig } from "./form-config";
import { LABEL_KEYS } from "./form-labels";

const KEY = "trl.formConfig";
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: FormConfig } | null = null;

function read(): FormConfig {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (cache && cache.raw === raw) return cache.value;
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {}
  cache = { raw, value: sanitizeFormConfig(parsed, LABEL_KEYS) };
  return cache.value;
}

export function saveFormConfig(cfg: FormConfig) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sanitizeFormConfig(cfg, LABEL_KEYS)));
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

export function useStoredFormConfig(): FormConfig {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_FORM_CONFIG);
}
