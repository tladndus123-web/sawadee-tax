// Delivery-app settlements read by the AI (owner 2026-11-18, a restaurant extra — Settings → 음식점 기능, from the for-sale
// version): a GrabFood / LINE MAN / foodpanda / ShopeeFood / Robinhood merchant statement (PDF, photo, or the app's CSV /
// Excel export as text) → one settlement: the period, the orders, the food sales, each fee the app kept (GP), withholding
// and the payout. The program checks the sum (payout ≈ sales − fees − withholding) and turns it into the books: the
// period's sales on the app's channel (one line on the period's last day) and the fees as one paid purchase (category
// "fees"). Pure: the answer's shape, the prompt, the cleaning and the records.

import type { Channel } from "./sales";

export const PLATFORMS = ["grab", "lineman", "foodpanda", "shopeefood", "robinhood"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const isPlatform = (v: unknown): v is Platform => (PLATFORMS as readonly unknown[]).includes(v);

export const PLATFORM_LABEL: Record<Platform, string> = { grab: "GrabFood", lineman: "LINE MAN", foodpanda: "foodpanda", shopeefood: "ShopeeFood", robinhood: "Robinhood" };

/** The apps' Thai operators, as printed on their tax invoices (names only — never a made-up tax ID) */
export const PLATFORM_NAME: Record<Platform, { en: string; th: string }> = {
  grab: { en: "Grab Taxi (Thailand) Co., Ltd.", th: "บริษัท แกร็บแท็กซี่ (ประเทศไทย) จำกัด" },
  lineman: { en: "LINE MAN (Thailand) Co., Ltd.", th: "บริษัท ไลน์แมน (ประเทศไทย) จำกัด" },
  foodpanda: { en: "Delivery Hero (Thailand) Co., Ltd.", th: "บริษัท เดลิเวอรี่ ฮีโร่ (ประเทศไทย) จำกัด" },
  shopeefood: { en: "Shopee (Thailand) Co., Ltd.", th: "บริษัท ช้อปปี้ (ประเทศไทย) จำกัด" },
  robinhood: { en: "Purple Ventures Co., Ltd.", th: "บริษัท เพอร์เพิล เวนเจอร์ส จำกัด" },
};

export interface Settlement {
  platform: Platform;
  /** YYYY-MM-DD */
  periodFrom: string;
  periodTo: string;
  payoutDate: string | null;
  orders: number;
  /** Baht: food sales at menu prices (VAT inside), after discounts the restaurant funded, before the app's fees */
  sales: number;
  commission: number;
  transactionFee: number;
  serviceFee: number;
  shippingFee: number;
  adsFee: number;
  otherFees: number;
  /** VAT on the fees when printed separately, 0 when inside */
  feeVat: number;
  /** Tax the app withheld from the payout, 0 when none */
  withheld: number;
  payout: number;
  /** The app's 13-digit tax ID when printed, else "" */
  platformTaxId: string;
}

export const SETTLEMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["isSettlement", "platform", "periodFrom", "periodTo", "payoutDate", "orders", "sales", "commission", "transactionFee", "serviceFee", "shippingFee", "adsFee", "otherFees", "feeVat", "withheld", "payout", "platformTaxId"],
  properties: {
    isSettlement: { type: "boolean" },
    platform: { type: "string", enum: [...PLATFORMS, "other"] },
    periodFrom: { type: "string" },
    periodTo: { type: "string" },
    payoutDate: { type: "string" },
    orders: { type: "number" },
    sales: { type: "number" },
    commission: { type: "number" },
    transactionFee: { type: "number" },
    serviceFee: { type: "number" },
    shippingFee: { type: "number" },
    adsFee: { type: "number" },
    otherFees: { type: "number" },
    feeVat: { type: "number" },
    withheld: { type: "number" },
    payout: { type: "number" },
    platformTaxId: { type: "string" },
  },
} as const;

export function settlementSystemPrompt(today: string): string {
  return (
    `You read a restaurant's delivery-app settlement (merchant statement / payout report / transaction export) from ` +
    `GrabFood (grab), LINE MAN (lineman), foodpanda, ShopeeFood (shopeefood) or Robinhood in Thailand, for the ` +
    `restaurant's bookkeeping. Today is ${today}. Fill in: isSettlement (false when the file is not such a statement); ` +
    `platform; the period it covers (periodFrom, periodTo, YYYY-MM-DD, Gregorian — convert Buddhist years by subtracting ` +
    `543); payoutDate ("" when not printed); orders (count of orders, 0 when not printed); sales = the food sales of the ` +
    `period at menu prices (the food / order subtotal, VAT inside, after discounts the restaurant funded, before the app's ` +
    `commission — never the delivery fee customers paid the rider); commission = the app's commission (GP); then each ` +
    `other fee the app kept, as positive baht amounts: transactionFee (payment / transaction fee), serviceFee (service / ` +
    `programme / marketing fees), shippingFee (delivery the restaurant paid), adsFee (ads paid from the balance), ` +
    `otherFees (anything else kept); feeVat = VAT on the fees only when printed separately (else 0); withheld = tax the app ` +
    `withheld from the payout (else 0); payout = what was paid to the restaurant's bank. Use the totals the statement ` +
    `prints; when the file lists orders one by one, add them up. Never invent a figure — 0 when it is not there. ` +
    `platformTaxId = the app's 13-digit Thai tax ID only when printed, else "".`
  );
}

const day = (v: unknown): string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return "";
  const [by, m, d] = v.split("-").map(Number);
  const y = by > 2400 ? by - 543 : by;
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return !Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) && new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : "";
};
const baht = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(Math.abs(v) * 100) / 100 : 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The model's answer → a settlement, or null when it is not one / has no period / no sales and no payout */
export function cleanSettlement(raw: unknown): Settlement | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.isSettlement !== true || !isPlatform(r.platform)) return null;
  let periodFrom = day(r.periodFrom);
  let periodTo = day(r.periodTo);
  if (!periodTo) periodTo = periodFrom;
  if (!periodFrom) periodFrom = periodTo;
  if (!periodFrom) return null;
  if (periodFrom > periodTo) [periodFrom, periodTo] = [periodTo, periodFrom];
  const s: Settlement = {
    platform: r.platform,
    periodFrom,
    periodTo,
    payoutDate: day(r.payoutDate) || null,
    orders: Math.max(0, Math.round(typeof r.orders === "number" ? r.orders : 0)),
    sales: baht(r.sales),
    commission: baht(r.commission),
    transactionFee: baht(r.transactionFee),
    serviceFee: baht(r.serviceFee),
    shippingFee: baht(r.shippingFee),
    adsFee: baht(r.adsFee),
    otherFees: baht(r.otherFees),
    feeVat: baht(r.feeVat),
    withheld: baht(r.withheld),
    payout: baht(r.payout),
    platformTaxId: typeof r.platformTaxId === "string" && /^\d{13}$/.test(r.platformTaxId.replace(/\D/g, "")) ? r.platformTaxId.replace(/\D/g, "") : "",
  };
  return s.sales > 0 || s.payout > 0 ? s : null;
}

/** Every fee the app kept, VAT included */
export const feesOf = (s: Settlement): number => r2(s.commission + s.transactionFee + s.serviceFee + s.shippingFee + s.adsFee + s.otherFees + s.feeVat);

/** sales − fees − withholding against the payout: ok within ฿1 or 1 % (a gap is shown, never "fixed") */
export function settlementCheck(s: Settlement): { expected: number; gap: number; ok: boolean } {
  const expected = r2(s.sales - feesOf(s) - s.withheld);
  const gap = r2(s.payout - expected);
  return { expected, gap, ok: Math.abs(gap) <= Math.max(1, Math.abs(s.payout) * 0.01) };
}

/** A statement over two months would put one month's sales in the other: such a file is refused (upload one month at a time) */
export const crossesMonths = (s: Pick<Settlement, "periodFrom" | "periodTo">) => s.periodFrom.slice(0, 7) !== s.periodTo.slice(0, 7);

/** The app's channel on the sales screen (ShopeeFood → "shopee") */
export const channelOf = (p: Platform): Channel => (p === "shopeefood" ? "shopee" : p);

export const settlementNote = (s: Pick<Settlement, "platform" | "periodFrom" | "periodTo">) => `${PLATFORM_LABEL[s.platform]} ${s.periodFrom} – ${s.periodTo}`;

/** The sales line: the period's sales on the app's channel, on the period's last day (VAT inside; the company is VAT registered) */
export function saleOf(s: Settlement, branchId: string) {
  return {
    branchId,
    date: s.periodTo,
    channel: channelOf(s.platform),
    bills: s.orders,
    gross: s.sales,
    vat: r2((s.sales * 7) / 107),
    exempt: 0,
    docFrom: "",
    docTo: "",
    note: settlementNote(s),
    source: "manual" as const,
  };
}

/** The fees as one purchase: before VAT and the VAT (printed separately → as printed; else 7 % inside), paid on the payout day */
export function feeDocOf(s: Settlement): { date: string; net: number; vat: number; total: number } {
  const gross = r2(s.commission + s.transactionFee + s.serviceFee + s.shippingFee + s.adsFee + s.otherFees);
  const vat = s.feeVat > 0 ? s.feeVat : r2((gross * 7) / 107);
  const net = s.feeVat > 0 ? gross : r2(gross - vat);
  return { date: s.payoutDate ?? s.periodTo, net, vat, total: r2(net + vat) };
}

/** The app's sales already entered for the period on its channel (daily closing lines): adding the statement's again would count them twice */
export function recordedSales(sales: readonly { branchId: string; channel: string; date: string; gross: number }[], s: Pick<Settlement, "platform" | "periodFrom" | "periodTo">, branchId: string): number {
  const ch = channelOf(s.platform);
  return r2(sales.filter((x) => x.branchId === branchId && x.channel === ch && x.date >= s.periodFrom && x.date <= s.periodTo).reduce((a, x) => a + x.gross, 0));
}
