// Starting point of a document typed by hand: a full tax invoice (§86/4) dated today, titled "ใบกำกับภาษี",
// with one empty item line, and the buyer = our company as printed on the newest document addressed to us
// (name, address, head office / branch). Without such a document only our tax ID is filled.

import { digitsOnly } from "./thai-tax";
import { normalize } from "./normalize";
import type { LedgerDoc } from "./types";

const EMPTY = { th: "", en: "", ja: "" };

export function manualStart(ledger: LedgerDoc[], companyTaxId: string, today: string): LedgerDoc {
  const co = digitsOnly(companyTaxId);
  const ours = co
    ? ledger.filter((d) => digitsOnly(d.customer.taxId) === co).sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0]
    : undefined;
  return normalize({
    docType: "full",
    copyKind: "original",
    docTitle: { th: "ใบกำกับภาษี", en: "Tax Invoice", ja: "タックスインボイス" },
    date: today,
    confidence: "high",
    customer: ours ? { ...ours.customer, code: "" } : { taxId: co },
    items: [{ category: "", code: "", desc: EMPTY, wh: "", qty: 1, unit: EMPTY, price: 0, amount: 0 }],
  });
}
