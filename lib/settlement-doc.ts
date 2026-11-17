// A delivery-app settlement's fees as a ledger document (lib/settlement-read feeDocOf): one line per fee kind that is not
// 0, the app's operator as the seller (its Thai name; the tax ID only when the statement printed it), category "fees",
// paid on the payout day (the fees were kept from the payout). A tax invoice ("full") only with the app's tax ID —
// otherwise a plain receipt whose VAT is not claimed until the app's own tax invoice is added.

import { blank } from "./normalize";
import { feeDocOf, PLATFORM_NAME, type Settlement } from "./settlement-read";
import type { Item, LedgerDoc } from "./types";

const FEE_LINES: { key: keyof Settlement; en: string; th: string; ja: string }[] = [
  { key: "commission", en: "Commission (GP)", th: "ค่าคอมมิชชัน (GP)", ja: "手数料（GP）" },
  { key: "transactionFee", en: "Transaction fee", th: "ค่าธรรมเนียมการชำระเงิน", ja: "決済手数料" },
  { key: "serviceFee", en: "Service fee", th: "ค่าบริการ", ja: "サービス料" },
  { key: "shippingFee", en: "Delivery paid by the restaurant", th: "ค่าจัดส่งที่ร้านจ่าย", ja: "店負担の配達料" },
  { key: "adsFee", en: "Ads", th: "ค่าโฆษณา", ja: "広告費" },
  { key: "otherFees", en: "Other fees", th: "ค่าธรรมเนียมอื่น", ja: "その他の手数料" },
];

export function feeLedgerDoc(s: Settlement, branchId: string): LedgerDoc {
  const doc = blank();
  const fee = feeDocOf(s);
  const grossFees = FEE_LINES.reduce((a, l) => a + (s[l.key] as number), 0);
  const share = grossFees > 0 ? fee.net / grossFees : 0;
  const items: Item[] = FEE_LINES.filter((l) => (s[l.key] as number) > 0).map((l) => {
    const amount = Math.round((s[l.key] as number) * share * 100) / 100;
    return { category: "", code: "", desc: { th: l.th, en: l.en, ja: l.ja }, wh: "", qty: 1, unit: { th: "", en: "", ja: "" }, price: amount, amount };
  });
  // Rounding lands on the first line, so the lines add up to the total before VAT exactly
  const diff = Math.round((fee.net - items.reduce((a, i) => a + i.amount, 0)) * 100) / 100;
  if (items[0] && diff) items[0] = { ...items[0], price: Math.round((items[0].price + diff) * 100) / 100, amount: Math.round((items[0].amount + diff) * 100) / 100 };
  const name = PLATFORM_NAME[s.platform];
  return {
    ...doc,
    docType: s.platformTaxId ? "full" : "receipt",
    docNo: `${s.platform.toUpperCase()}-${s.periodFrom.replace(/-/g, "")}-${s.periodTo.slice(5).replace("-", "")}`,
    date: fee.date,
    seller: { ...doc.seller, name: { th: name.th, en: name.en, ja: "" }, taxId: s.platformTaxId },
    items,
    totals: { ...doc.totals, total: fee.net, afterDisc: fee.net, afterDep: fee.net, taxable: fee.net, exempt: 0, vat: fee.vat, net: fee.total },
    category: "fees",
    paid: true,
    paidDate: fee.date,
    // The statement's sales, and any tax the app withheld (the restaurant's credit — keep the app's 50 Tawi)
    note: { th: "", en: `Settlement ${s.periodFrom} – ${s.periodTo} · sales ${s.sales.toFixed(2)}${s.withheld > 0 ? ` · withheld by the app ${s.withheld.toFixed(2)}` : ""}`, ja: "" },
    branchId,
  };
}
