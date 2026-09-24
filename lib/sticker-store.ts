"use client";

// TEMPORARY sticker names (company-wide setting from step 5), kept in localStorage.
// An empty name falls back to the colour name in the screen language.

import { useSyncExternalStore } from "react";
import { STICKERS, type Sticker } from "./types";

export type StickerNames = Partial<Record<Sticker, string>>;

/** Swatch colours (Apple system palette) */
export const STICKER_HEX: Record<Sticker, string> = {
  red: "#ff3b30",
  orange: "#ff9500",
  yellow: "#ffcc00",
  green: "#34c759",
  blue: "#007aff",
  purple: "#af52de",
  gray: "#8e8e93",
};

const KEY = "trl.stickerNames";
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: StickerNames } | null = null;
const EMPTY: StickerNames = {};

function read(): StickerNames {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (cache && cache.raw === raw) return cache.value;
  let v: Record<string, unknown> = {};
  try {
    v = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {}
  const names: StickerNames = {};
  for (const c of STICKERS) if (typeof v[c] === "string" && (v[c] as string).trim()) names[c] = (v[c] as string).trim().slice(0, 20);
  cache = { raw, value: names };
  return names;
}

export function saveStickerNames(names: StickerNames) {
  try {
    localStorage.setItem(KEY, JSON.stringify(names));
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

export const useStickerNames = (): StickerNames => useSyncExternalStore(subscribe, read, () => EMPTY);
