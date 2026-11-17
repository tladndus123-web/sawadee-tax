"use client";

// The PC menu (owner 2026-11-18: "판매용 프리미엄처럼 — PC는 왼쪽 사이드바"): from md a left sidebar holds the app, the
// branch picker and the menu in groups (경영 · 장부·세금 · 매출·거래 · 사람·일정 · 관리). Narrow (icons only, each with a name
// bubble) up to 1280px, wide from 1280px; from 1024px the person can collapse / expand it, remembered on this device and
// put on <html> before paint (lib/nav-menu SIDEBAR_SCRIPT). Phones keep the top bar + tab bar (app-header).
// The list scrolls on its own and opts out of the page's smooth scroll (data-lenis-prevent).

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { useFoodFeatures } from "@/lib/food-features-store";
import { activeHref, groupNav, nextSidebarPref, readSidebarPref, SIDEBAR_KEY, sidebarChrome, sidebarLabeled, type SidebarPref, visibleItems } from "@/lib/nav-menu";
import { useMe } from "@/lib/role-store";
import { cn } from "@/lib/utils";
import { APP_MARK_GLOW, AppMark } from "./app-mark";
import { BranchSwitcher } from "./branch-switcher";
import { NAV_ICON } from "./nav-icons";
import { RailTip } from "./RailTip";

function applyChrome(pref: SidebarPref, viewport: number) {
  const chrome = sidebarChrome(pref, viewport);
  const root = document.documentElement;
  if (chrome.sidebar) root.dataset.sidebar = chrome.sidebar;
  else delete root.dataset.sidebar;
  if (chrome.rail) root.dataset.sbRail = "1";
  else delete root.dataset.sbRail;
}

export function AppSidebar() {
  const t = useTranslations();
  const me = useMe();
  const pathname = usePathname();
  const items = visibleItems(me, useFoodFeatures().menu);
  const groups = groupNav(items);
  const current = activeHref(items, pathname);

  // A clicked item lights up at once, before its page has loaded
  const [tap, setTap] = useState<{ href: string; from: string } | null>(null);
  const active = tap && tap.from === pathname ? tap.href : current;
  const onTap = (href: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    setTap({ href, from: pathname });
  };

  // Wide or narrow from the saved choice + the window (1280 / "auto" = the server's first draw, corrected before paint)
  const [pref, setPref] = useState<SidebarPref>("auto");
  const [width, setWidth] = useState(1280);
  const prefRef = useRef(pref);
  prefRef.current = pref;
  useLayoutEffect(() => {
    let stored: SidebarPref = "auto";
    try {
      stored = readSidebarPref(localStorage.getItem(SIDEBAR_KEY));
    } catch {
      // private mode: the automatic width
    }
    const w = window.innerWidth;
    setPref(stored);
    setWidth(w);
    applyChrome(stored, w);
    const onResize = () => {
      setWidth(window.innerWidth);
      applyChrome(prefRef.current, window.innerWidth);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const labeled = sidebarLabeled(pref, width);
  const rail = sidebarChrome(pref, width).rail;
  const toggle = () => {
    const w = window.innerWidth;
    const next = nextSidebarPref(sidebarLabeled(prefRef.current, w));
    prefRef.current = next;
    setPref(next);
    setWidth(w);
    applyChrome(next, w);
    try {
      localStorage.setItem(SIDEBAR_KEY, next);
    } catch {
      // still applies until the next load
    }
  };

  return (
    <aside className="app-sidebar hidden md:flex print:hidden" aria-label={t("nav.menu")}>
      <RailTip on={rail} label={t("app.appName")}>
        <Link href="/" className="sb-brand press" title={rail ? undefined : t("app.appName")}>
          <AppMark className={`size-8 flex-none rounded-[9px] ${APP_MARK_GLOW}`} />
          <span className="sb-text truncate text-[15px] leading-tight font-semibold tracking-tight">{t("app.appName")}</span>
        </Link>
      </RailTip>

      {/* The branch being looked at (only with several branches; kept-out branches stay locked as everywhere) */}
      <div className="sb-company empty:hidden">
        <BranchSwitcher side rail={rail} />
      </div>

      <nav id="app-sidebar-menu" aria-label={t("nav.menu")} data-lenis-prevent className="sb-nav">
        {groups.map(({ group, items: list }, i) => (
          <div key={group} className={cn("min-w-0", group === "settings" && "mt-auto pt-3")}>
            <p className="sb-group sb-hide">{t(`nav.group.${group}`)}</p>
            {i > 0 && <div className="sb-rule" aria-hidden />}
            <ul aria-label={t(`nav.group.${group}`)} className="grid gap-0.5">
              {list.map(({ href, key }) => {
                const Icon = NAV_ICON[key];
                const name = t(`nav.${key}`);
                return (
                  <li key={href}>
                    <RailTip on={rail} label={name}>
                      <Link
                        href={href}
                        onClick={onTap(href)}
                        data-active={active === href}
                        aria-current={current === href ? "page" : undefined}
                        aria-label={rail ? name : undefined}
                        className="sb-link"
                      >
                        <Icon className="size-[18px] flex-none" strokeWidth={active === href ? 2.2 : 1.9} aria-hidden />
                        <span className="sb-text min-w-0 flex-1 truncate">{name}</span>
                      </Link>
                    </RailTip>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="sb-foot hidden lg:grid">
        <RailTip on={rail} label={labeled ? t("nav.collapse") : t("nav.expand")}>
          <button type="button" onClick={toggle} aria-expanded={labeled} aria-controls="app-sidebar-menu" aria-label={labeled ? t("nav.collapse") : t("nav.expand")} className="sb-link sb-toggle w-full">
            {labeled ? <PanelLeftClose className="size-[18px] flex-none" aria-hidden /> : <PanelLeftOpen className="size-[18px] flex-none" aria-hidden />}
            <span className="sb-text truncate" aria-hidden>
              {labeled ? t("nav.collapse") : t("nav.expand")}
            </span>
          </button>
        </RailTip>
      </div>
    </aside>
  );
}
