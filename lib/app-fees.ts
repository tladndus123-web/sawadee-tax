// Delivery-app commission (GP). The apps keep a share of each order and charge 7% VAT on that share; what is left
// is paid out to the shop. Rates are the company's own (settings), with the usual Thai GP as a starting point.
// An estimate from the sales lines — the app's own statement is the final word. Satang integers throughout.

import { fromSatang, toSatang } from "./money";
import { type Channel, CHANNELS, saleMonth, type Sale } from "./sales";

/** Channels that take a commission (the shop's own till does not) */
export const APP_CHANNELS = CHANNELS.filter((c) => c !== "store") as Exclude<Channel, "store">[];
export type AppChannel = (typeof APP_CHANNELS)[number];
export type AppFees = Partial<Record<AppChannel, number>>;

/** Usual GP when the company has set nothing (percent of the order) */
export const DEFAULT_FEES: Record<AppChannel, number> = { grab: 30, lineman: 30, foodpanda: 32, shopee: 25, robinhood: 0, other: 0 };

/** The rate in use for a channel: the company's own if it is a sane percent, else the usual one */
export function feeRate(fees: unknown, ch: AppChannel): number {
  const v = fees && typeof fees === "object" ? (fees as Record<string, unknown>)[ch] : undefined;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100 ? v : DEFAULT_FEES[ch];
}

export interface FeeLine {
  channel: AppChannel;
  rate: number;
  /** Orders (VAT included), as recorded in sales */
  gross: number;
  /** Commission before its VAT */
  fee: number;
  /** 7% VAT on the commission */
  feeVat: number;
  /** What the app pays out: gross − fee − feeVat */
  payout: number;
}

export interface MonthFees {
  lines: FeeLine[];
  gross: number;
  fee: number;
  feeVat: number;
  payout: number;
}

/** A month's delivery sales by app, with the commission and the payout to expect */
export function monthFees(sales: Pick<Sale, "date" | "channel" | "gross">[], month: string, fees: unknown): MonthFees {
  const by = new Map<AppChannel, number>();
  for (const s of sales) {
    if (s.channel === "store" || saleMonth(s) !== month) continue;
    by.set(s.channel, (by.get(s.channel) ?? 0) + toSatang(s.gross));
  }
  const lines = APP_CHANNELS.filter((c) => by.has(c)).map((channel): FeeLine => {
    const rate = feeRate(fees, channel);
    const g = by.get(channel)!;
    const fee = Math.round((g * rate) / 100);
    const feeVat = Math.round((fee * 7) / 100);
    return { channel, rate, gross: fromSatang(g), fee: fromSatang(fee), feeVat: fromSatang(feeVat), payout: fromSatang(g - fee - feeVat) };
  });
  const sum = (k: "gross" | "fee" | "feeVat" | "payout") => fromSatang(lines.reduce((a, l) => a + toSatang(l[k]), 0));
  return { lines, gross: sum("gross"), fee: sum("fee"), feeVat: sum("feeVat"), payout: sum("payout") };
}
