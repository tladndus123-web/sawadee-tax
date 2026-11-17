// The app's menu (2026-11-18, owner: "판매용 프리미엄 느낌 — PC 왼쪽 사이드바, 휴대폰은 탭바 그대로"): one list for the PC
// sidebar (grouped: 경영 · 장부·세금 · 매출·거래 · 사람·일정 · 관리) and the phone's tab bar / "more" sheet, which item a path
// lights up, the top bar's "where am I" trail and the sidebar's width choice. Who sees what (admin, an owner's screen
// list, the restaurant switches) is decided here from plain inputs; the components only draw it. Pure.

import { canOpen, screenOf } from "./screens";

export type NavKey =
  | "dashboard"
  | "taxes"
  | "payables"
  | "ledger"
  | "cash"
  | "assets"
  | "sales"
  | "pl"
  | "vendors"
  | "prices"
  | "contracts"
  | "waste"
  | "payroll"
  | "expenses"
  | "calendar"
  | "settings";

export type NavGroup = "home" | "books" | "trade" | "people" | "settings";

/** The restaurant extras an admin switches on in Settings (lib/food-features) that bring a menu item */
export type NavFeature = "waste";

export type NavItem = {
  href: string;
  key: NavKey;
  group: NavGroup;
  /** Only admins (owners count) */
  admin?: boolean;
  /** PC sidebar only (on phones it is reached from its parent screen) */
  sideOnly?: boolean;
  /** Shown only while this restaurant extra is on */
  feature?: NavFeature;
  /** Other paths that light this item up */
  also?: readonly string[];
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", key: "dashboard", group: "home" },
  { href: "/ledger/taxes", key: "taxes", group: "home", admin: true, also: ["/ledger/filing"] },
  { href: "/ledger/payables", key: "payables", group: "home", admin: true },
  { href: "/ledger", key: "ledger", group: "books", also: ["/documents", "/upload"] },
  { href: "/ledger/cash", key: "cash", group: "books", sideOnly: true },
  { href: "/ledger/assets", key: "assets", group: "books", sideOnly: true },
  { href: "/sales", key: "sales", group: "trade" },
  { href: "/sales/pl", key: "pl", group: "trade", sideOnly: true },
  { href: "/vendors", key: "vendors", group: "trade" },
  { href: "/vendors/prices", key: "prices", group: "trade", sideOnly: true },
  { href: "/contracts", key: "contracts", group: "trade", admin: true },
  { href: "/waste", key: "waste", group: "trade", feature: "waste" },
  { href: "/payroll", key: "payroll", group: "people", admin: true },
  { href: "/expenses", key: "expenses", group: "people" },
  { href: "/calendar", key: "calendar", group: "people", admin: true },
  { href: "/settings", key: "settings", group: "settings" },
];

export const GROUPS: readonly NavGroup[] = ["home", "books", "trade", "people", "settings"];

type Me = { role: string; owner: boolean; screens: readonly string[] | null; loaded: boolean };

/** The items this person may open: admin-only ones for admins, an owner's screen list, the switched-on extras */
export function visibleItems(me: Me, features: readonly NavFeature[] = []): NavItem[] {
  // Until we know who this is, only the dashboard (no menu that flashes and goes)
  if (!me.loaded) return NAV_ITEMS.filter((n) => n.href === "/");
  return NAV_ITEMS.filter((n) => (!n.admin || me.role === "admin") && (!n.feature || features.includes(n.feature)) && canOpen(me, screenOf(n.href)));
}

/** The items in their sidebar groups (empty groups left out) */
export function groupNav(items: readonly NavItem[]): { group: NavGroup; items: NavItem[] }[] {
  return GROUPS.map((group) => ({ group, items: items.filter((i) => i.group === group) })).filter((g) => g.items.length);
}

const under = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

/** The menu item a path lights up: the longest matching href or `also` path (so /ledger/cash lights 현금 and
 *  /ledger/filing/… lights 세금 신고, not 장부) */
export function activeHref(items: readonly NavItem[], path: string): string | undefined {
  let best: { href: string; len: number } | undefined;
  for (const i of items)
    for (const p of [i.href, ...(i.also ?? [])])
      if (under(path, p) && (!best || p.length > best.len)) best = { href: i.href, len: p.length };
  return best?.href;
}

/** The top bar's trail: group → item (→ "detail" for a page under it, e.g. one document) */
export function navTrail(items: readonly NavItem[], path: string): { group: NavGroup; key: NavKey; href: string; detail: boolean } | null {
  const href = activeHref(items, path);
  const item = items.find((i) => i.href === href);
  if (!item || item.href === "/") return null;
  return { group: item.group, key: item.key, href: item.href, detail: path !== item.href };
}

// ── The sidebar's width ─────────────────────────────────────────────────────────────────────────────────────────
// Narrow (icons only) on tablets up to 1280px, wide from 1280px; from 1024px the person may choose, remembered on the
// device (localStorage) and put on <html data-sidebar / data-sb-rail> before paint (app/[locale]/layout.tsx).

export const SIDEBAR_KEY = "sawadee.sidebar";
export type SidebarPref = "auto" | "open" | "closed";

export const readSidebarPref = (v: string | null): SidebarPref => (v === "open" || v === "closed" ? v : "auto");

/** Wide (with names) for this choice and window width */
export function sidebarLabeled(pref: SidebarPref, width: number): boolean {
  if (width < 1024) return false;
  if (pref === "open") return true;
  if (pref === "closed") return false;
  return width >= 1280;
}

/** What goes on <html>: data-sidebar (the choice from 1024px) and data-sb-rail (icons only, md and up) */
export function sidebarChrome(pref: SidebarPref, width: number): { sidebar: "open" | "closed" | null; rail: boolean } {
  return { sidebar: pref === "auto" ? null : pref, rail: width >= 768 && !sidebarLabeled(pref, width) };
}

/** The choice after pressing the collapse / expand button */
export const nextSidebarPref = (labeled: boolean): SidebarPref => (labeled ? "closed" : "open");

/** The same rules as a script string, run before paint so the bar never jumps (no imports there) */
export const SIDEBAR_SCRIPT = `try{var p=localStorage.getItem(${JSON.stringify(SIDEBAR_KEY)}),w=innerWidth,r=document.documentElement;p=p==="open"||p==="closed"?p:"auto";if(p!=="auto")r.dataset.sidebar=p;var l=w>=1024&&(p==="open"||(p==="auto"&&w>=1280));if(w>=768&&!l)r.dataset.sbRail="1"}catch(e){}`;
