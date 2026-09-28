// Monthly export (step 7): one row per document + one row per item line, shared by the Excel file
// and the printable PDF report. Text follows the screen language (Korean screens get English — the
// documents only exist in th/en/ja) and the Thai original is always kept in its own column.
// Totals are added in satang.

import { claimable } from "./checks";
import { fromSatang, toSatang } from "./money";
import { branchNo } from "./thai-tax";
import type { FormLang, LedgerDoc, Tri } from "./types";

/** Screen language → the document language used in exports */
export const exportLang = (locale: string): FormLang => (locale === "th" ? "th" : locale === "ja" ? "ja" : "en");

/** Chosen language, falling back to English, then Thai */
const pick = (t: Tri | null | undefined, lang: FormLang) => (t ? t[lang] || t.en || t.th || t.ja : "");

export interface ExportRow {
  date: string;
  docNo: string;
  vendorTh: string;
  vendor: string;
  taxId: string;
  branch: string;
  /** "00000" head office, 5-digit branch, "" unknown (purchase tax report form) */
  branchNo: string;
  /** Claimed in a later tax month than the invoice month ("YYYY-MM"), else "" */
  lateClaim: string;
  docType: LedgerDoc["docType"];
  category: LedgerDoc["category"];
  items: string;
  taxable: number;
  exempt: number;
  vat: number;
  net: number;
  wht: number;
  paid: boolean;
  paidDate: string;
  claimable: boolean;
  flags: number;
}

export interface ExportItemRow {
  /** The line's own category, else the document's (a mixed receipt is split this way in the P&L too) */
  category: LedgerDoc["category"];
  date: string;
  docNo: string;
  vendor: string;
  line: number;
  code: string;
  descTh: string;
  desc: string;
  qty: number;
  unit: string;
  price: number;
  amount: number;
}

export interface ExportTotals {
  count: number;
  taxable: number;
  exempt: number;
  vat: number;
  net: number;
  wht: number;
  /** VAT of the documents whose input VAT can be claimed */
  claimableVat: number;
  unpaid: number;
}

export interface MonthExport {
  rows: ExportRow[];
  items: ExportItemRow[];
  totals: ExportTotals;
}

export function buildMonthExport(
  docs: { doc: LedgerDoc; flags?: number }[],
  locale: string,
  companyTaxId: string,
): MonthExport {
  const lang = exportLang(locale);
  const sorted = [...docs].sort((a, b) => a.doc.date.localeCompare(b.doc.date) || a.doc.docNo.localeCompare(b.doc.docNo));
  const rows: ExportRow[] = [];
  const items: ExportItemRow[] = [];
  const sum = { taxable: 0, exempt: 0, vat: 0, net: 0, wht: 0, claimableVat: 0, unpaid: 0 };

  for (const { doc, flags = 0 } of sorted) {
    const vendor = pick(doc.seller.name, lang);
    const ok = claimable(doc, companyTaxId);
    rows.push({
      date: doc.date,
      docNo: doc.docNo,
      vendorTh: doc.seller.name.th,
      vendor,
      taxId: doc.seller.taxId,
      branch: pick(doc.seller.branch, lang),
      branchNo: branchNo(doc.seller.branch),
      lateClaim: doc.taxMonth && doc.taxMonth !== doc.date.slice(0, 7) ? doc.taxMonth : "",
      docType: doc.docType,
      category: doc.category,
      items: doc.items.map((i) => pick(i.desc, lang)).filter(Boolean).join(" / "),
      taxable: doc.totals.taxable,
      exempt: doc.totals.exempt,
      vat: doc.totals.vat,
      net: doc.totals.net,
      wht: doc.totals.wht,
      paid: doc.paid,
      paidDate: doc.paidDate,
      claimable: ok,
      flags,
    });
    doc.items.forEach((i, n) =>
      items.push({
        category: i.category || doc.category,
        date: doc.date,
        docNo: doc.docNo,
        vendor,
        line: n + 1,
        code: i.code,
        descTh: i.desc.th,
        desc: pick(i.desc, lang),
        qty: i.qty,
        unit: pick(i.unit, lang),
        price: i.price,
        amount: i.amount,
      }),
    );
    sum.taxable += toSatang(doc.totals.taxable);
    sum.exempt += toSatang(doc.totals.exempt);
    sum.vat += toSatang(doc.totals.vat);
    sum.net += toSatang(doc.totals.net);
    sum.wht += toSatang(doc.totals.wht);
    if (ok) sum.claimableVat += toSatang(doc.totals.vat);
    if (!doc.paid) sum.unpaid += toSatang(doc.totals.net);
  }

  return {
    rows,
    items,
    totals: {
      count: rows.length,
      taxable: fromSatang(sum.taxable),
      exempt: fromSatang(sum.exempt),
      vat: fromSatang(sum.vat),
      net: fromSatang(sum.net),
      wht: fromSatang(sum.wht),
      claimableVat: fromSatang(sum.claimableVat),
      unpaid: fromSatang(sum.unpaid),
    },
  };
}
