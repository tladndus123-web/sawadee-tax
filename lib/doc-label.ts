// What to call a document in a list: the seller, else its number, else — for a document typed by hand without a
// seller (a cash summary, a cost with no invoice) — its first item line and how many more lines there are.
// Found 2026-09-30: such documents showed only "—" in the ledger.

import type { LedgerDoc } from "./types";

type Lang = "th" | "en" | "ja";

const pickTri = (t: { th: string; en: string; ja: string }, lang: Lang) => (t[lang] || t.en || t.th || t.ja || "").trim();

export interface DocLabel {
  /** Seller, number or first item; "" when the document has none of them */
  name: string;
  /** Item lines not named (only when the name is an item) */
  more: number;
}

export function docLabel(doc: Pick<LedgerDoc, "seller" | "docNo" | "items">, lang: Lang): DocLabel {
  const seller = pickTri(doc.seller.name, lang);
  if (seller) return { name: seller, more: 0 };
  if (doc.docNo.trim()) return { name: doc.docNo.trim(), more: 0 };
  const named = doc.items.map((i) => pickTri(i.desc, lang)).filter(Boolean);
  if (named.length) return { name: named[0], more: doc.items.length - 1 };
  return { name: "", more: 0 };
}
