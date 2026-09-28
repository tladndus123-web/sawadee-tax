// Thai government holidays, for tax deadlines: a filing date that falls on a Saturday, Sunday or official holiday
// moves to the next working day. Days government offices close (including substitution days); bank-only days
// such as Labour Day and the Bank of Thailand's special holidays are left out.
// Sources: Cabinet / Bank of Thailand holiday announcements for 2026 and 2027 (checked 2026-09-28).
// ⚠ Add the next year's list each year when it is announced (usually in the autumn) — HANDOFF.md.

export const THAI_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2026
  "2026-01-01", "2026-01-02", "2026-03-03", "2026-04-06", "2026-04-13", "2026-04-14", "2026-04-15",
  "2026-05-04", "2026-06-01", "2026-06-03", "2026-07-28", "2026-07-29", "2026-08-12", "2026-10-13",
  "2026-10-23", "2026-12-07", "2026-12-10", "2026-12-31",
  // 2027
  "2027-01-01", "2027-02-22", "2027-04-06", "2027-04-13", "2027-04-14", "2027-04-15", "2027-05-04",
  "2027-05-20", "2027-06-03", "2027-07-19", "2027-07-28", "2027-08-12", "2027-10-13", "2027-10-25",
  "2027-12-06", "2027-12-10", "2027-12-31",
]);

/** Last year the list covers; later dates only skip weekends */
export const HOLIDAYS_UNTIL = 2027;

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function isWorkingDay(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6 && !THAI_HOLIDAYS.has(date);
}

/** The date itself if offices are open, else the next day they are */
export function nextWorkingDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  while (!isWorkingDay(iso(d))) d.setUTCDate(d.getUTCDate() + 1);
  return iso(d);
}
