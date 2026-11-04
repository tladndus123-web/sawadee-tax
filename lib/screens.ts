// The screens an owner can let an admin open (owner, 2026-11-04: "대표자가 관리자는 어떤 화면만 볼 수 있는지 설정").
// members.admin_screens: null = all; owners and staff are not limited here (staff keep the usual admin-only rules).
// This shapes the menu and the pages; branches are enforced by the database (supabase …003200_owners.sql).

export const SCREENS = ["ledger", "upload", "sales", "vendors", "calendar", "expenses", "payroll", "settings"] as const;
export type Screen = (typeof SCREENS)[number];

/** Which screen a path (without the locale) belongs to; null = always open (the dashboard, sign-in pages) */
export function screenOf(path: string): Screen | null {
  const p = path.replace(/^\/(ko|ja|th|en)(?=\/|$)/, "") || "/";
  if (p.startsWith("/documents") || p.startsWith("/ledger")) return "ledger";
  for (const s of SCREENS) if (p === `/${s}` || p.startsWith(`/${s}/`)) return s;
  return null;
}

/** May this person open this screen? */
export function canOpen(me: { role: string; owner: boolean; screens: readonly string[] | null }, screen: Screen | null): boolean {
  if (!screen || me.role !== "admin" || me.owner || me.screens === null) return true;
  return me.screens.includes(screen);
}

/** Only known screen names, in menu order (null stays null = all) */
export function cleanScreens(v: unknown): Screen[] | null {
  if (!Array.isArray(v)) return null;
  return SCREENS.filter((s) => v.includes(s));
}
