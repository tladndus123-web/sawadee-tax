// The duplicates popup's list (owner 2026-11-18/19: "중복 안내 확인 부탁드립니다" — 문제없음 / 확인하기): ledger documents
// with the same seller tax ID and document number (lib/dup-groups) and sales reports in on two days (lib/sales-slips),
// each with a key that names exactly what was compared, so a "문제없음" (everyone) or "확인하기" (that person) covers
// those very lines and a new copy is asked about again. Worked out on the server (/api/dups), so the browser downloads
// a short list instead of every document and sales line. Pure.

import { dupGroups, likelyCopies } from "./dup-groups";
import type { Sale } from "./sales";
import { elsewherePairs } from "./sales-slips";
import { digitsOnly } from "./thai-tax";

export interface DupDocRow {
  id: string;
  tax: string | null;
  doc_no: string | null;
  doc_date: string | null;
  net: number | string | null;
  created_at: string;
}

export interface DupNotice {
  docs: { key: string; copies: number; extra: number }[];
  sales: { key: string; first: { id: string; date: string }; second: { id: string; date: string; gross: number } }[];
}

export function dupNotice(docRows: readonly DupDocRow[], sales: readonly Sale[], acked: ReadonlySet<string>): DupNotice {
  const groups = dupGroups(
    docRows.map((d) => ({ id: d.id, sellerTaxId: d.tax ?? "", docNo: d.doc_no ?? "", date: d.doc_date ?? "", total: Number(d.net) || 0, createdAt: Date.parse(d.created_at) || 0 })),
  );
  const copies = new Set(likelyCopies(groups));
  const docs = groups
    .map((g) => {
      const [tax, no] = g.key.split("|");
      return {
        key: `doc:${digitsOnly(tax)}|${no}|${g.items.map((x) => x.id).sort().join(",")}`,
        copies: g.items.filter((x) => copies.has(x.id)).length,
        extra: Math.round(g.items.filter((x) => copies.has(x.id)).reduce((a, x) => a + x.total, 0) * 100) / 100,
      };
    })
    .filter((d) => !acked.has(d.key));
  const salesOut = elsewherePairs(sales)
    .map(({ first, second }) => ({
      key: `sale:${[first.id, second.id].sort().join("|")}`,
      first: { id: first.id, date: first.date },
      second: { id: second.id, date: second.date, gross: second.gross },
    }))
    .filter((p) => !acked.has(p.key));
  return { docs, sales: salesOut };
}

/** The keys still to show one person: not marked fine by anyone, not checked by them */
export const notSeen = (n: DupNotice, seen: ReadonlySet<string>): DupNotice => ({ docs: n.docs.filter((d) => !seen.has(d.key)), sales: n.sales.filter((s) => !seen.has(s.key)) });

export const noticeKeys = (n: DupNotice): string[] => [...n.docs.map((d) => d.key), ...n.sales.map((s) => s.key)];
