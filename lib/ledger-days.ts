// The ledger's rows in date groups (owner, 2026-11-06: "날짜별 묶음 — 오늘·어제·이번 주"): today, yesterday, the last
// 7 days, last week, then a month in weeks (1–7, 8–14, 15–21, 22–28, 29–end), and documents without a date last.
// Pure; the labels are made by the screen from the bucket.

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

export type DayBucket =
  | { kind: "today" | "yesterday" | "week" | "lastWeek" | "noDate" }
  /** A week of a month: days `from`–`to` of `month` (YYYY-MM) */
  | { kind: "range"; month: string; from: number; to: number };

export function bucketOf(date: string, today: string): DayBucket {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { kind: "noDate" };
  const ago = daysBetween(date, today);
  if (ago === 0) return { kind: "today" };
  if (ago === 1) return { kind: "yesterday" };
  if (ago >= 2 && ago <= 6) return { kind: "week" };
  if (ago >= 7 && ago <= 13) return { kind: "lastWeek" };
  const month = date.slice(0, 7);
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const d = Number(date.slice(8));
  const from = Math.min(29, Math.floor((d - 1) / 7) * 7 + 1);
  return { kind: "range", month, from, to: from === 29 ? last : from + 6 };
}

const keyOf = (b: DayBucket) => (b.kind === "range" ? `${b.month}:${b.from}` : b.kind);

export interface DayGroup<T> {
  key: string;
  bucket: DayBucket;
  items: T[];
}

/** Rows (any order) → groups, newest first; inside a group the newest first; documents without a date at the end */
export function groupByDays<T>(items: T[], dateOf: (t: T) => string, today: string): DayGroup<T>[] {
  const sorted = [...items].sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
  const out: DayGroup<T>[] = [];
  const at = new Map<string, DayGroup<T>>();
  const undated: T[] = [];
  for (const it of sorted) {
    const b = bucketOf(dateOf(it), today);
    if (b.kind === "noDate") {
      undated.push(it);
      continue;
    }
    const k = keyOf(b);
    let g = at.get(k);
    if (!g) {
      g = { key: k, bucket: b, items: [] };
      at.set(k, g);
      out.push(g);
    }
    g.items.push(it);
  }
  if (undated.length) out.push({ key: "noDate", bucket: { kind: "noDate" }, items: undated });
  return out;
}
