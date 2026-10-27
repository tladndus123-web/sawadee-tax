// Saved ledger views (owner, 2026-10-27: "장부 보기 저장 — 이번 달 미지급만 …"): a name for a set of filters and a search,
// opened again with one tap. Kept per person (lib/user-prefs), at most MAX_VIEWS.

import type { ArchiveFilter } from "./archive";
import { STICKERS, type Sticker } from "./types";

export interface SavedView {
  name: string;
  filter: ArchiveFilter;
  query: string;
}

export const MAX_VIEWS = 12;

const readFilter = (v: unknown): ArchiveFilter => {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const stickers = (Array.isArray(o.stickers) ? o.stickers : []).filter((s): s is Sticker => (STICKERS as readonly unknown[]).includes(s));
  return {
    stickers,
    unpaidOnly: o.unpaidOnly === true,
    ...(typeof o.category === "string" && o.category ? { category: o.category.slice(0, 40) } : {}),
    ...(o.period === "this" || o.period === "last" ? { period: o.period } : {}),
  };
};

/** Whatever was stored → clean views (bad ones out, names trimmed, no two with the same name) */
export function readViews(v: unknown): SavedView[] {
  const out: SavedView[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 30) : "";
    if (!name || out.some((w) => w.name === name)) continue;
    out.push({ name, filter: readFilter(o.filter), query: typeof o.query === "string" ? o.query.slice(0, 80) : "" });
  }
  return out.slice(0, MAX_VIEWS);
}

/** The view now on screen, saved under a name (the same name is replaced) */
export function addView(views: SavedView[], name: string, filter: ArchiveFilter, query: string): SavedView[] {
  const v = readViews([{ name, filter, query }])[0];
  if (!v) return views;
  return [...views.filter((w) => w.name !== v.name), v].slice(-MAX_VIEWS);
}

/** Is this view the one on screen now? */
export const isOn = (v: SavedView, filter: ArchiveFilter, query: string) =>
  JSON.stringify(readFilter(filter)) === JSON.stringify(v.filter) && query.trim() === v.query.trim();
