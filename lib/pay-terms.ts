// A supplier's payment terms (owner, 2026-10-27: "거래처 결제 조건 → 지급 예정일 자동"): set once on the supplier, every
// new reading of their invoices gets its due date from them when the paper prints none.
//   now      paid on the spot (the document starts paid on its own date)
//   days:N   N days after the document date (credit N days, "เครดิต N วัน")
//   eom      the last day of the document's month
//   next:D   day D of the next month (short months: their last day)

export type PayTerms = "now" | "eom" | `days:${number}` | `next:${number}`;

export const PAY_TERMS: PayTerms[] = ["now", "days:7", "days:15", "days:30", "days:45", "days:60", "days:90", "eom", "next:5", "next:10", "next:15", "next:25"];

export function parsePayTerms(v: unknown): PayTerms | null {
  if (typeof v !== "string") return null;
  if (v === "now" || v === "eom") return v;
  const m = /^(days|next):(\d{1,3})$/.exec(v);
  if (!m) return null;
  const n = Number(m[2]);
  if (m[1] === "days" && n >= 1 && n <= 365) return `days:${n}`;
  if (m[1] === "next" && n >= 1 && n <= 31) return `next:${n}`;
  return null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** The due date for a document dated `date` (YYYY-MM-DD); "" for "now" or a date that cannot be read */
export function dueByTerms(date: string, terms: PayTerms): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(t) || terms === "now") return "";
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (terms === "eom") return iso(new Date(Date.UTC(y, m, lastDay(y, m))));
  const [kind, n] = terms.split(":");
  if (kind === "days") return iso(new Date(t + Number(n) * 86_400_000));
  return iso(new Date(Date.UTC(y, m + 1, Math.min(Number(n), lastDay(y, m + 1)))));
}
