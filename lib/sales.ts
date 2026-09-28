// Sales (money coming in) and the monthly result. Satang integers throughout.
// One Sale = one day of one channel (the POS closing report, or a delivery app's day). Amounts include VAT;
// the value for the reports is gross − VAT. The result compares sales with purchases, both without the VAT the
// company gets back: a purchase's cost is its total minus the input VAT it may claim (VAT it cannot claim is a cost).

import { invoiceMonth } from "./archive";
import { claimable } from "./checks";
import { fromSatang, toSatang } from "./money";
import type { LedgerDoc } from "./types";

export const CHANNELS = ["store", "grab", "lineman", "foodpanda", "shopee", "robinhood", "other"] as const;
export type Channel = (typeof CHANNELS)[number];

export interface Sale {
  id: string;
  /** Branch (สาขา) the day belongs to (public.branches id); "" = head office */
  branchId: string;
  date: string;
  channel: Channel;
  docFrom: string;
  docTo: string;
  bills: number;
  gross: number;
  vat: number;
  exempt: number;
  note: string;
  photoPath: string | null;
  source: "photo" | "excel" | "manual";
}

/** Value of goods sold, without VAT (taxable + exempt) */
export const saleValue = (s: Pick<Sale, "gross" | "vat">) => fromSatang(toSatang(s.gross) - toSatang(s.vat));

/** 7% VAT inside a VAT-inclusive amount (exempt sales carry none) */
export const vatInsideSales = (gross: number, exempt = 0) => fromSatang(Math.round(((toSatang(gross) - toSatang(exempt)) * 7) / 107));

/** Does the VAT printed on the closing report match 7/107 of the taxable part (±1 baht)? */
export const saleVatOk = (s: Pick<Sale, "gross" | "vat" | "exempt">) => Math.abs(toSatang(vatInsideSales(s.gross, s.exempt)) - toSatang(s.vat)) <= 100;

export const saleMonth = (s: Pick<Sale, "date">) => s.date.slice(0, 7);

export interface MonthResult {
  salesGross: number;
  salesVat: number;
  /** Sales without VAT */
  salesValue: number;
  /** Purchases as paid (VAT included) */
  purchasesGross: number;
  /** Purchases' cost: total minus the input VAT that can be claimed */
  purchasesCost: number;
  claimableVat: number;
  /** salesValue − purchasesCost */
  profit: number;
  /** profit ÷ salesValue, 0 when there are no sales */
  margin: number;
  /** Output VAT − claimable input VAT (negative = carried forward / refund) */
  vatPayable: number;
  days: number;
  byChannel: { channel: Channel; gross: number; value: number }[];
}

export function monthResult(sales: Sale[], purchases: LedgerDoc[], month: string, companyTaxId: string): MonthResult {
  let sg = 0;
  let sv = 0;
  const days = new Set<string>();
  const ch = new Map<Channel, { gross: number; value: number }>();
  for (const s of sales) {
    if (saleMonth(s) !== month) continue;
    const g = toSatang(s.gross);
    const v = toSatang(s.vat);
    sg += g;
    sv += v;
    days.add(s.date);
    const c = ch.get(s.channel) ?? { gross: 0, value: 0 };
    c.gross += g;
    c.value += g - v;
    ch.set(s.channel, c);
  }
  let pg = 0;
  let pv = 0;
  for (const d of purchases) {
    if (invoiceMonth(d) !== month) continue;
    pg += toSatang(d.totals.net);
    if (claimable(d, companyTaxId)) pv += toSatang(d.totals.vat);
  }
  const salesValue = sg - sv;
  const cost = pg - pv;
  const profit = salesValue - cost;
  return {
    salesGross: fromSatang(sg),
    salesVat: fromSatang(sv),
    salesValue: fromSatang(salesValue),
    purchasesGross: fromSatang(pg),
    purchasesCost: fromSatang(cost),
    claimableVat: fromSatang(pv),
    profit: fromSatang(profit),
    margin: salesValue ? profit / salesValue : 0,
    vatPayable: fromSatang(sv - pv),
    days: days.size,
    byChannel: CHANNELS.filter((c) => ch.has(c)).map((c) => ({ channel: c, gross: fromSatang(ch.get(c)!.gross), value: fromSatang(ch.get(c)!.value) })),
  };
}

/** Lines of the sales tax report (รายงานภาษีขาย) for a month: by date, store first, then the apps */
export function salesReportRows(sales: Sale[], month: string): Sale[] {
  return sales
    .filter((s) => saleMonth(s) === month)
    .sort((a, b) => a.date.localeCompare(b.date) || CHANNELS.indexOf(a.channel) - CHANNELS.indexOf(b.channel));
}
