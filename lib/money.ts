// Money helpers. All arithmetic is done in satang (1/100 baht) integers.

/** Baht → satang integer */
export const toSatang = (baht: number): number => Math.round((Number(baht) || 0) * 100);

/** Satang integer → baht number */
export const fromSatang = (satang: number): number => satang / 100;

/** Parse anything number-like ("6,000.00", 6000, "") into baht rounded to 2 decimals. */
export function parseBaht(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? fromSatang(Math.round(n * 100)) : 0;
}

/** Like parseBaht but keeps "not printed" (null / empty) as null. */
export const parseBahtOrNull = (v: unknown): number | null => (v == null || v === "" ? null : parseBaht(v));

/** |a − b| ≤ tolerance, all in baht, compared as satang integers. */
export const near = (a: number, b: number, tolBaht = 0.01): boolean =>
  Math.abs(toSatang(a) - toSatang(b)) <= toSatang(tolBaht);

/** Quantity: keeps up to 4 decimals (1.234 stays 1.234); missing → 0, never a default of 1. */
export function parseQty(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : 0;
}

const fmtQ = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** 10 → "10.00", 1.234 → "1.234" */
export const fmtQty = (n: number): string => fmtQ.format(n);

const fmt2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 64200 → "64,200.00" */
export const fmt = (n: number): string => fmt2.format(fromSatang(toSatang(n)));

/** 64200 → "฿ 64,200.00" */
export const baht = (n: number): string => `฿ ${fmt(n)}`;
