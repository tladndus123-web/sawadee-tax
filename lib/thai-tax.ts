// Thai tax ID and date rules (ported from the prototype)

export const digitsOnly = (s: string | null | undefined): string => (s ?? "").replace(/\D/g, "");

/**
 * Thai 13-digit tax ID check digit.
 * sum = Σ d[i] × (13 − i) for i = 0..11; valid when (11 − sum % 11) % 10 === d[12].
 */
export function taxIdOk(id: string | null | undefined): boolean {
  const d = digitsOnly(id);
  if (d.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}

/** yyyy-mm-dd that exists on the calendar (no month 13, no 30 February) */
export function isIsoDate(s: string | null | undefined): s is string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** "2026-09-23" + 15 → "2026-10-08" (UTC, no DST issues) */
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "2026-09-23" → "23/09/2026", empty → "—" */
export function dmy(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Normalise "y-m-d" and convert a Buddhist-era year (> 2400) to CE.
 * Returns [iso, wasBuddhist]; invalid input or a date that does not exist → ["", false].
 */
export function fixDate(s: unknown): [string, boolean] {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(typeof s === "string" ? s.trim() : "");
  if (!m) return ["", false];
  let y = Number(m[1]);
  let wasBuddhist = false;
  if (y > 2400) {
    y -= 543;
    wasBuddhist = true;
  }
  const iso = `${y}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return isIsoDate(iso) ? [iso, wasBuddhist] : ["", false];
}

/** Today in Bangkok time as yyyy-mm-dd */
export function todayBangkok(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(now);
}
