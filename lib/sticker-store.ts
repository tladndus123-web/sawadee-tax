"use client";

// Sticker names: company-wide, stored in company_settings.sticker_names (step 5).
// An empty name falls back to the colour name in the screen language.

import { useMemo } from "react";
import { saveCompany, useCompany } from "./company-store";
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

/** Only known colours, trimmed, max 20 characters */
function clean(v: Record<string, unknown>): StickerNames {
  const names: StickerNames = {};
  for (const c of STICKERS) if (typeof v[c] === "string" && (v[c] as string).trim()) names[c] = (v[c] as string).trim().slice(0, 20);
  return names;
}

/** Admin only (RLS). Throws when the database refuses. */
export const saveStickerNames = (names: StickerNames) => saveCompany({ sticker_names: clean(names as Record<string, unknown>) });

export function useStickerNames(): StickerNames {
  const { stickerNames } = useCompany();
  return useMemo(() => clean(stickerNames), [stickerNames]);
}
