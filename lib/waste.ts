// Waste log (owner 2026-11-18, restaurant extra): what was thrown away and what it cost, month by month — the total value,
// against last month, the items and the reasons that cost the most. Rows come from public.waste_logs (…004600). Pure.

export const WASTE_REASONS = ["spoiled", "expired", "mistake", "dropped", "leftover", "other"] as const;
export type WasteReason = (typeof WASTE_REASONS)[number];

export interface WasteLog {
  id: string;
  branchId: string;
  day: string;
  item: string;
  qty: number;
  unit: string;
  /** Baht; null = value not known */
  amount: number | null;
  reason: WasteReason;
  note: string;
  photoPath: string | null;
  source: "app" | "line";
  createdBy: string | null;
}

export function rowToWaste(r: Record<string, unknown>): WasteLog {
  const reason = String(r.reason ?? "other");
  return {
    id: String(r.id),
    branchId: String(r.branch_id ?? ""),
    day: String(r.day ?? ""),
    item: String(r.item ?? ""),
    qty: Number(r.qty) || 0,
    unit: String(r.unit ?? ""),
    amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
    reason: (WASTE_REASONS as readonly string[]).includes(reason) ? (reason as WasteReason) : "other",
    note: String(r.note ?? ""),
    photoPath: (r.photo_path as string | null) ?? null,
    source: r.source === "line" ? "line" : "app",
    createdBy: (r.created_by as string | null) ?? null,
  };
}

const prev = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
const satang = (n: number | null) => Math.round((n ?? 0) * 100);

export interface WasteMonth {
  month: string;
  /** Satang */
  total: number;
  lines: number;
  /** Lines without a value */
  unpriced: number;
  /** Last month's total, satang */
  before: number;
  /** Change in percent against last month (null = nothing last month) */
  change: number | null;
  /** Most costly items first: name, satang, lines, quantity (same unit only) */
  items: { item: string; amount: number; lines: number; qty: number; unit: string }[];
  /** Satang per reason, biggest first */
  reasons: { reason: WasteReason; amount: number; lines: number }[];
}

/** The month's waste, items grouped by name (case and spacing ignored) */
export function wasteMonth(logs: readonly WasteLog[], month: string): WasteMonth {
  const mine = logs.filter((l) => l.day.slice(0, 7) === month);
  const was = logs.filter((l) => l.day.slice(0, 7) === prev(month)).reduce((a, l) => a + satang(l.amount), 0);
  const total = mine.reduce((a, l) => a + satang(l.amount), 0);
  const items = new Map<string, { item: string; amount: number; lines: number; qty: number; unit: string }>();
  const reasons = new Map<WasteReason, { reason: WasteReason; amount: number; lines: number }>();
  for (const l of mine) {
    const key = l.item.trim().toLowerCase().replace(/\s+/g, " ");
    const it = items.get(key) ?? { item: l.item.trim(), amount: 0, lines: 0, qty: 0, unit: l.unit };
    it.amount += satang(l.amount);
    it.lines += 1;
    if (it.unit === l.unit) it.qty = Math.round((it.qty + l.qty) * 1000) / 1000;
    items.set(key, it);
    const r = reasons.get(l.reason) ?? { reason: l.reason, amount: 0, lines: 0 };
    r.amount += satang(l.amount);
    r.lines += 1;
    reasons.set(l.reason, r);
  }
  return {
    month,
    total,
    lines: mine.length,
    unpriced: mine.filter((l) => l.amount === null).length,
    before: was,
    change: was > 0 ? Math.round(((total - was) / was) * 100) : null,
    items: [...items.values()].sort((a, b) => b.amount - a.amount || b.lines - a.lines),
    reasons: [...reasons.values()].sort((a, b) => b.amount - a.amount || b.lines - a.lines),
  };
}
