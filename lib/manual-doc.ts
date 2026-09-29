// Starting point of a document typed by hand: a full tax invoice (§86/4) dated today, titled "ใบกำกับภาษี",
// with one empty item line, and the buyer = our company as printed on the newest document addressed to us
// (name, address, head office / branch). Without such a document only our tax ID is filled.

import { digitsOnly } from "./thai-tax";
import { normalize } from "./normalize";
import type { DocType, LedgerDoc, Tri } from "./types";

const EMPTY = { th: "", en: "", ja: "" };

/** The printed title of each kind of document typed by hand ("other" has none) */
const TITLES: Record<DocType, Tri> = {
  full: { th: "ใบกำกับภาษี", en: "Tax Invoice", ja: "タックスインボイス" },
  abbr: { th: "ใบกำกับภาษีอย่างย่อ", en: "Abbreviated Tax Invoice", ja: "簡易タックスインボイス" },
  receipt: { th: "ใบเสร็จรับเงิน", en: "Receipt", ja: "領収書" },
  other: EMPTY,
};

/** Picking another kind of document retitles it — unless someone wrote their own title */
export function retitle(current: Tri, next: DocType): Tri {
  const own = Object.values(TITLES).every((t) => t.th !== current.th || t.en !== current.en || t.ja !== current.ja);
  return own && (current.th || current.en || current.ja) ? current : TITLES[next];
}

export function manualStart(ledger: LedgerDoc[], companyTaxId: string, today: string): LedgerDoc {
  const co = digitsOnly(companyTaxId);
  const ours = co
    ? ledger.filter((d) => digitsOnly(d.customer.taxId) === co).sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0]
    : undefined;
  return normalize({
    docType: "full",
    copyKind: "original",
    docTitle: TITLES.full,
    date: today,
    confidence: "high",
    customer: ours ? { ...ours.customer, code: "" } : { taxId: co },
    items: [{ category: "", code: "", desc: EMPTY, wh: "", qty: 1, unit: EMPTY, price: 0, amount: 0 }],
  });
}
