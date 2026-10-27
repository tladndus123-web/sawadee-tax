"use client";

import { BookOpen, Building2, CalendarDays, HandCoins, LayoutGrid, LayoutList, Plus, Settings, TrendingUp, WalletCards } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { useBranches } from "@/lib/branch-store";
import { useMe } from "@/lib/role-store";
import { cn } from "@/lib/utils";
import { BranchSwitcher, useCurrentBranch } from "./branch-switcher";
import { APP_MARK_GLOW, AppMark } from "./app-mark";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { AssistantButton } from "@/components/assistant/AssistantPanel";

const NAV = [
  { href: "/", key: "dashboard", icon: LayoutGrid },
  { href: "/ledger", key: "ledger", icon: BookOpen },
  { href: "/sales", key: "sales", icon: TrendingUp },
  { href: "/vendors", key: "vendors", icon: Building2 },
  { href: "/calendar", key: "calendar", icon: CalendarDays, admin: true },
  { href: "/expenses", key: "expenses", icon: HandCoins },
  { href: "/payroll", key: "payroll", icon: WalletCards, admin: true },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

/** Glass top bar with a segmented nav on md+, and an iOS-style tab bar below md. */
export function AppHeader() {
  const t = useTranslations();
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  // Payroll and the tax calendar are for admins only
  const isAdmin = useMe().role === "admin";
  const nav = NAV.filter((n) => !("admin" in n) || isAdmin);
  // Phones: dashboard, ledger, sales on the bar (with the camera between); everything else under "more"
  const onBar = (href: string) => href === "/" || href === "/ledger" || href === "/sales";
  const main = nav.filter((n) => onBar(n.href));
  const rest = nav.filter((n) => !onBar(n.href));
  const [more, setMore] = useState(false);
  // Detail screens hide the tab bar, like a pushed view on iOS, so their own action bar owns the bottom edge.
  const showTabBar = !pathname.startsWith("/documents");
  // With several branches the switcher takes the phone's top bar; the app name gives way
  const manyBranches = useBranches().branches.length > 1;
  const branchColor = useCurrentBranch().color;

  // A tapped tab lights up at once, before its page has loaded (it only counts while we're still on the
  // page it was tapped from), and its icon plays a small bounce.
  const [tap, setTap] = useState<{ href: string; from: string; n: number } | null>(null);
  const current = nav.find((n) => isActive(n.href))?.href;
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
  }, [active, nav.length]);


  return (
    <>
      <header className="glass-header sticky top-0 z-40" style={branchColor ? { boxShadow: `inset 0 -3px 0 ${branchColor[0]}` } : undefined}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3 focus:text-sm">
          {t("ui.skipToContent")}
        </a>
        <div className="mx-auto grid h-14 max-w-[1440px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 md:grid-cols-[1fr_auto_1fr] px-4 sm:px-6 md:h-16 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link href="/" className="press flex min-w-0 items-center gap-2.5 text-[15px] font-semibold tracking-tight active:scale-[0.97]">
              <AppMark className={`size-8 flex-none rounded-[9px] ${APP_MARK_GLOW}`} />
              <span className={cn("truncate", manyBranches && "max-sm:hidden")}>{t("app.appName")}</span>
            </Link>
          </div>

          <nav ref={navRef} aria-label={t("nav.menu")} className="nav-pill relative hidden md:flex">
            <span ref={gliderRef} className="nav-glider" aria-hidden />
            {nav.map(({ href, key, icon: Icon }) => (
              <Link key={href} href={href} onClick={onTap(href)} data-active={active === href} aria-current={isActive(href) ? "page" : undefined} title={t(`nav.${key}`)}>
                <Icon key={bounceKey(href)} className={cn("size-4", bounceKey(href) > 0 && "sym-tap")} aria-hidden />
                <span className="nav-label">{t(`nav.${key}`)}</span>
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center justify-end gap-1 md:col-start-3">
            <AssistantButton />
            <BranchSwitcher />
            <LocaleSwitcher />
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      {showTabBar && (
        // Phones (owner 2026-10-27, "모바일 최적화"): four tabs and the camera in the middle, like an iPhone app —
        // dashboard, ledger, [+ photo], sales, more; the rest of the menu opens from "more" as a sheet
        <nav aria-label={t("nav.menu")} className="tab-bar md:hidden">
          <div className="mx-auto grid max-w-lg grid-cols-5 items-end">
            {main.map(({ href, key, icon: Icon }, i) => (
              <Fragment key={href}>
                {i === 2 && (
                  <Link href="/upload" onClick={onTap("/upload")} aria-label={t("nav.upload")} className="tab-plus">
                    <span>
                      <Plus className="size-7" strokeWidth={2.4} aria-hidden />
                    </span>
                    {t("nav.upload")}
                  </Link>
                )}
                <Link href={href} onClick={onTap(href)} data-active={active === href} aria-current={isActive(href) ? "page" : undefined}>
                  <Icon key={bounceKey(href)} className={cn("size-[22px]", bounceKey(href) > 0 && "sym-tap")} strokeWidth={active === href ? 2.2 : 1.8} aria-hidden />
                  {t(`nav.${key}`)}
                </Link>
              </Fragment>
            ))}
            <button type="button" onClick={() => setMore(true)} data-active={!!rest.find((n) => n.href === active)} aria-expanded={more} className="tab-more">
              <LayoutList className="size-[22px]" strokeWidth={rest.some((n) => n.href === active) ? 2.2 : 1.8} aria-hidden />
              {t("nav.more")}
            </button>
          </div>
        </nav>
      )}
      {/* "More": the rest of the menu as big tiles, from below */}
      {more && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={t("nav.more")}>
          <button type="button" className="absolute inset-0 bg-black/35" aria-label={t("app.close")} onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[26px] bg-background px-4 pt-2 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/25" aria-hidden />
            <ul className="grid grid-cols-3 gap-2.5">
              {rest.map(({ href, key, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={(e) => (onTap(href)(e), setMore(false))}
                    data-active={active === href}
                    className="press flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl bg-card text-[13px] font-medium shadow-[var(--shadow-soft)] ring-1 ring-border data-[active=true]:text-primary data-[active=true]:ring-primary/40"
                  >
                    <Icon className="size-6" aria-hidden />
                    {t(`nav.${key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
