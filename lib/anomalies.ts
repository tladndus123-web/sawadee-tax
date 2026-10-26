// 🔍 "Anything unusual?" for the 5-day LINE report (owner, 2026-10-26): the documents that came in during the last days,
// compared with "our usual shop" — the same receipt twice, a spend far above what that kind of cost usually is, and
// a supplier never bought from before (with whether its tax ID is valid).

import { toSatang } from "./money";
import { digitsOnly, taxIdOk } from "./thai-tax";
import type { LedgerDoc } from "./types";

export interface DatedDoc {
  id: string;
  doc: LedgerDoc;
  /** When it was saved, YYYY-MM-DD (Bangkok) */
  created: string;
}

export type Anomaly =
  | { kind: "dup"; id: string; otherId: string; vendor: LedgerDoc["seller"]["name"]; docNo: string; amount: number }
  | { kind: "big"; id: string; vendor: LedgerDoc["seller"]["name"]; category: string; amount: number; usual: number }
  | { kind: "new"; id: string; vendor: LedgerDoc["seller"]["name"]; taxId: string; taxIdValid: boolean; amount: number };

/** A spend counts as unusual from this many times the usual amount of its category … */
export const BIG_TIMES = 3;
/** … and from this amount (small receipts are never news) */
export const BIG_MIN = 5000;
/** The usual amount needs at least this many earlier documents of the category (within 90 days) */
export const BIG_HISTORY = 3;
export const MAX_ANOMALIES = 6;

const DAY = 86_400_000;
const daysBefore = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) - n * DAY).toISOString().slice(0, 10);

/** Documents saved from `from` to `to` (inclusive), against everything saved before them */
export function findAnomalies(all: DatedDoc[], from: string, to: string): Anomaly[] {
  const recent = all.filter((d) => d.created >= from && d.created <= to);
  const earlier = all.filter((d) => d.created < from);
  const out: Anomaly[] = [];

  // The same receipt twice: same seller tax ID and document number (each pair once)
  const seen = new Set<string>();
  for (const d of recent) {
    const tax = digitsOnly(d.doc.seller.taxId);
    if (!tax || !d.doc.docNo) continue;
    const other = all.find((x) => x.id !== d.id && x.doc.docNo === d.doc.docNo && digitsOnly(x.doc.seller.taxId) === tax);
    if (!other) continue;
    const key = [d.id, other.id].sort().join();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: "dup", id: d.id, otherId: other.id, vendor: d.doc.seller.name, docNo: d.doc.docNo, amount: d.doc.totals.net });
  }

  // Far above the usual for its category (average of the 90 days before)
  const history = earlier.filter((d) => d.created >= daysBefore(from, 90));
  for (const d of recent) {
    const same = history.filter((h) => h.doc.category === d.doc.category);
    if (same.length < BIG_HISTORY) continue;
    const usual = same.reduce((a, h) => a + toSatang(h.doc.totals.net), 0) / same.length / 100;
    if (d.doc.totals.net >= BIG_MIN && d.doc.totals.net >= usual * BIG_TIMES)
      out.push({ kind: "big", id: d.id, vendor: d.doc.seller.name, category: d.doc.category, amount: d.doc.totals.net, usual: Math.round(usual) });
  }

  // A supplier never bought from before (by tax ID)
  const known = new Set(earlier.map((d) => digitsOnly(d.doc.seller.taxId)).filter(Boolean));
  const newOnes = new Set<string>();
  for (const d of recent) {
    const tax = digitsOnly(d.doc.seller.taxId);
    if (!tax || known.has(tax) || newOnes.has(tax)) continue;
    newOnes.add(tax);
    out.push({ kind: "new", id: d.id, vendor: d.doc.seller.name, taxId: tax, taxIdValid: taxIdOk(tax), amount: d.doc.totals.net });
  }

  const order = { dup: 0, big: 1, new: 2 };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || b.amount - a.amount).slice(0, MAX_ANOMALIES);
}
