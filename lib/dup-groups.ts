// The "중복 의심" review (owner 2026-11-08: "중복 목록 확인 후 여러 개 선택해서 삭제"): saved documents with the same seller
// tax ID and document number — the duplicate check's own rule (lib/checks "dup") — grouped, oldest first. The ones saved
// after the first of each group are pre-ticked as the likely copies; a person checks and moves them to the trash.

import { monthKey } from "./archive";
import { digitsOnly } from "./thai-tax";
import type { LedgerDoc } from "./types";

export interface DupItem {
  id: string;
  sellerTaxId: string;
  docNo: string;
  date: string;
  total: number;
  /** When it was saved (ms) */
  createdAt: number;
}

export interface DupGroup<T extends DupItem> {
  key: string;
  items: T[];
  /** Same date and same total as the first — very likely the very same paper */
  identical: boolean;
}

export function dupGroups<T extends DupItem>(items: readonly T[]): DupGroup<T>[] {
  const by = new Map<string, T[]>();
  for (const it of items) {
    const tax = digitsOnly(it.sellerTaxId);
    const no = it.docNo.trim();
    if (!tax || !no) continue;
    const k = `${tax}|${no}`;
    const list = by.get(k) ?? [];
    list.push(it);
    by.set(k, list);
  }
  return [...by.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => {
      const items = [...list].sort((a, b) => a.createdAt - b.createdAt);
      return { key, items, identical: items.every((x) => x.date === items[0].date && Math.round(x.total * 100) === Math.round(items[0].total * 100)) };
    })
    .sort((a, b) => b.items[0].date.localeCompare(a.items[0].date));
}

/** The pre-ticked ones: every document after the first in a group where all are identical */
export const likelyCopies = <T extends DupItem>(groups: readonly DupGroup<T>[]): string[] => groups.filter((g) => g.identical).flatMap((g) => g.items.slice(1).map((x) => x.id));

/**
 * Closing a month (owner 2026-11-08: "마감 버튼을 누를 때 중복이 남아 있으면 먼저 알려"): how many duplicate groups have a
 * document in that tax month. Saved documents only (no drafts, nothing in the trash).
 */
export function dupGroupsIn(docs: readonly { id: string; doc: LedgerDoc }[], month: string): number {
  const groups = dupGroups(docs.map((e, i) => ({ id: e.id, sellerTaxId: e.doc.seller.taxId, docNo: e.doc.docNo, date: e.doc.date, total: e.doc.totals.net, createdAt: i, month: monthKey(e.doc) })));
  return groups.filter((g) => g.items.some((x) => x.month === month)).length;
}
