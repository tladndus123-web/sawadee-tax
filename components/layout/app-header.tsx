"use client";

import { BookOpen, Building2, LayoutGrid, Settings, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { APP_MARK_GLOW, AppMark } from "./app-mark";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

const NAV = [
  { href: "/", key: "dashboard", icon: LayoutGrid },
  { href: "/ledger", key: "ledger", icon: BookOpen },
  { href: "/sales", key: "sales", icon: TrendingUp },
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

  // A tapped tab lights up at once, before its page has loaded (it only counts while we're still on the
  // page it was tapped from), and its icon plays a small bounce.
  const [tap, setTap] = useState<{ href: string; from: string; n: number } | null>(null);
  const current = NAV.find((n) => isActive(n.href))?.href;
  const active = tap && tap.from === pathname ? tap.href : current;
  const onTap = (href: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; // new tab/window
    setTap((p) => ({ href, from: pathname, n: (p?.n ?? 0) + 1 }));
  };
  // A new key remounts the icon, which replays its bounce
  const bounceKey = (href: string) => (tap?.href === href ? tap.n : 0);

  // Desktop: one white pill glides under the active tab, like an iOS segmented control
  const navRef = useRef<HTMLElement>(null);
  const gliderRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    const glider = gliderRef.current;
    if (!nav || !glider) return;
    const place = (animate: boolean) => {
      const a = nav.querySelector<HTMLElement>('a[data-active="true"]');
      if (!a || !a.offsetWidth) return void (glider.style.opacity = "0");
      glider.style.transition = animate ? "" : "none";
      glider.style.transform = `translateX(${a.offsetLeft}px)`;
      glider.style.width = `${a.offsetWidth}px`;
      glider.style.opacity = "1";
      nav.dataset.glide = "on";
    };
    place(nav.dataset.glide === "on");
    // Widths change with the language and fonts: follow them without sliding
    const ro = new ResizeObserver(() => place(false));
    ro.observe(nav);
    return () => ro.disconnect();
  }, [active]);

  return (
    <>
      <header className="glass-header sticky top-0 z-40">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3 focus:text-sm">
          {t("ui.skipToContent")}
        </a>
        <div className="mx-auto grid h-14 max-w-[1440px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 md:grid-cols-[1fr_auto_1fr] px-4 sm:px-6 md:h-16 lg:px-8">
          <Link href="/" className="press flex min-w-0 items-center gap-2.5 text-[15px] font-semibold tracking-tight active:scale-[0.97]">
            <AppMark className={`size-8 flex-none rounded-[9px] ${APP_MARK_GLOW}`} />
            <span className="truncate">{t("app.appName")}</span>
          </Link>

          <nav ref={navRef} aria-label={t("nav.menu")} className="nav-pill relative hidden md:flex">
            <span ref={gliderRef} className="nav-glider" aria-hidden />
            {NAV.map(({ href, key, icon: Icon }) => (
              <Link key={href} href={href} onClick={onTap(href)} data-active={active === href} aria-current={isActive(href) ? "page" : undefined}>
                <Icon key={bounceKey(href)} className={cn("size-4", bounceKey(href) > 0 && "sym-tap")} aria-hidden />
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
          <div className="mx-auto grid max-w-lg grid-cols-5">
            {NAV.map(({ href, key, icon: Icon }) => (
              <Link key={href} href={href} onClick={onTap(href)} data-active={active === href} aria-current={isActive(href) ? "page" : undefined}>
                <Icon key={bounceKey(href)} className={cn("size-[22px]", bounceKey(href) > 0 && "sym-tap")} strokeWidth={active === href ? 2.2 : 1.8} aria-hidden />
                {t(`nav.${key}`)}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </>
  );
}
