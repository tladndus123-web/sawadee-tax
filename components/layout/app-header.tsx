"use client";

import { BookOpen, Building2, LayoutGrid, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { APP_MARK_GLOW, AppMark } from "./app-mark";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

const NAV = [
  { href: "/", key: "dashboard", icon: LayoutGrid },
  { href: "/ledger", key: "ledger", icon: BookOpen },
  { href: "/vendors", key: "vendors", icon: Building2 },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

/** Glass top bar with a segmented nav on md+, and an iOS-style tab bar below md. */
export function AppHeader() {
  const t = useTranslations();
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  // Detail screens hide the tab bar, like a pushed view on iOS, so their own action bar owns the bottom edge.
  const showTabBar = !pathname.startsWith("/documents");

  return (
    <>
      <header className="glass-header sticky top-0 z-40">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3 focus:text-sm">
          {t("ui.skipToContent")}
        </a>
        <div className="mx-auto grid h-14 max-w-[1440px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 md:grid-cols-[1fr_auto_1fr] px-4 sm:px-6 md:h-16 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 text-[15px] font-semibold tracking-tight">
            <AppMark className={`size-8 flex-none rounded-[9px] ${APP_MARK_GLOW}`} />
            <span className="truncate">{t("app.appName")}</span>
          </Link>

          <nav aria-label={t("nav.menu")} className="nav-pill hidden md:flex">
            {NAV.map(({ href, key, icon: Icon }) => (
              <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}>
                <Icon className="size-4" aria-hidden />
                {t(`nav.${key}`)}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center justify-end gap-1 md:col-start-3">
            <LocaleSwitcher />
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      {showTabBar && (
        <nav aria-label={t("nav.menu")} className="tab-bar md:hidden">
          <div className="mx-auto grid max-w-lg grid-cols-4">
            {NAV.map(({ href, key, icon: Icon }) => (
              <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}>
                <Icon className="size-[22px]" strokeWidth={isActive(href) ? 2.2 : 1.8} aria-hidden />
                {t(`nav.${key}`)}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </>
  );
}
