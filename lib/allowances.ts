// Named allowances on the payroll (owner's request 2026-09-29): any number per person, each a name picked from a list
// (or typed once and offered from then on) with an amount for each half of the month. Only their total enters the
// pay, tax and social security (`PeriodInput.allowance`, as before); the names are for the pay run and the payslip.
// Saved per pay line as [{ key, name, amount }]: `key` is one of ALLOWANCE_KINDS, or "" with the typed `name`.
// Lines saved before names existed have only a total: it shows as "other" (the old "เบี้ยเลี้ยง / ค่าอื่น ๆ").

export const ALLOWANCE_KINDS = ["meal", "travel", "housing", "diligence", "position", "phone", "service", "commission", "other"] as const;
export type AllowanceKind = (typeof ALLOWANCE_KINDS)[number];

/** Payslip names (Thai with English) */
export const ALLOWANCE_PRINT: Record<AllowanceKind, { th: string; en: string }> = {
  meal: { th: "ค่าอาหาร", en: "Meal allowance" },
  travel: { th: "ค่าเดินทาง", en: "Travel allowance" },
  housing: { th: "ค่าที่พัก", en: "Housing allowance" },
  diligence: { th: "เบี้ยขยัน", en: "Diligence allowance" },
  position: { th: "ค่าตำแหน่ง", en: "Position allowance" },
  phone: { th: "ค่าโทรศัพท์", en: "Phone allowance" },
  service: { th: "ค่าบริการ (เซอร์วิสชาร์จ)", en: "Service charge" },
  commission: { th: "ค่าคอมมิชชั่น", en: "Commission" },
  other: { th: "เบี้ยเลี้ยง / ค่าอื่น ๆ", en: "Allowance" },
};

/** As saved on one pay line (one half of the month) */
export interface SavedAllowance {
  key: AllowanceKind | "";
  name: string;
  amount: number;
}

/** A row of the pay run: one allowance with its amount in each half */
export interface AllowanceRow {
  key: AllowanceKind | "";
  name: string;
  first: number;
  second: number;
}

const isKind = (k: unknown): k is AllowanceKind => typeof k === "string" && (ALLOWANCE_KINDS as readonly string[]).includes(k);
const sat = (n: number) => Math.round((Number(n) || 0) * 100);
const same = (a: { key: string; name: string }, b: { key: string; name: string }) => (a.key ? a.key === b.key : !b.key && a.name.trim() === b.name.trim());

/** What the database holds → clean items (unknown shapes dropped, amounts ≥ 0) */
export function parseAllowances(raw: unknown): SavedAllowance[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    if (!r || typeof r !== "object") return [];
    const o = r as Record<string, unknown>;
    const key = isKind(o.key) ? o.key : "";
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 60) : "";
    const amount = Math.max(0, sat(o.amount as number)) / 100;
    if (!key && !name) return [];
    return [{ key, name: key ? "" : name, amount }];
  });
}

/**
 * The two halves' saved items as pay-run rows (same name → one row). A half with a total but no items (saved before
 * names existed) becomes an "other" row, so nothing is lost.
 */
export function rowsFromSaved(first: { items: SavedAllowance[]; total: number }, second: { items: SavedAllowance[]; total: number }): AllowanceRow[] {
  const rows: AllowanceRow[] = [];
  const put = (half: "first" | "second", it: { key: AllowanceKind | ""; name: string; amount: number }) => {
    const row = rows.find((r) => same(r, it));
    if (row) row[half] = (sat(row[half]) + sat(it.amount)) / 100;
    else rows.push({ key: it.key, name: it.name, first: 0, second: 0, [half]: it.amount });
  };
  for (const [half, h] of [["first", first], ["second", second]] as const) {
    if (h.items.length) h.items.forEach((it) => put(half, it));
    else if (sat(h.total) > 0) put(half, { key: "other", name: "", amount: h.total });
  }
  return rows;
}

/** One half's items to save (amounts of 0 left out) */
export function savedFromRows(rows: AllowanceRow[], half: "first" | "second"): SavedAllowance[] {
  return rows.filter((r) => sat(r[half]) > 0 && named(r)).map((r) => ({ key: r.key, name: r.key ? "" : r.name.trim(), amount: sat(r[half]) / 100 }));
}

const named = (r: AllowanceRow) => !!(r.key || r.name.trim());

/** One half's total, the figure the pay uses (a row still without a name is not saved, so it does not count) */
export const allowanceTotal = (rows: AllowanceRow[], half: "first" | "second") => rows.filter(named).reduce((a, r) => a + sat(r[half]), 0) / 100;

/** Names typed before, for the list (each once, in the order first seen) */
export function customNames(items: SavedAllowance[]): string[] {
  const out: string[] = [];
  for (const it of items) if (!it.key && it.name && !out.includes(it.name)) out.push(it.name);
  return out;
}
