"use client";

import { ChevronRight, LayoutList, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { useBranches } from "@/lib/branch-store";
import { useFoodFeatures } from "@/lib/food-features-store";
import { activeHref, navTrail, visibleItems } from "@/lib/nav-menu";
import { useMe } from "@/lib/role-store";
import { canOpen } from "@/lib/screens";
import { cn } from "@/lib/utils";
import { AssistantButton } from "@/components/assistant/AssistantButton";
import { APP_MARK_GLOW, AppMark } from "./app-mark";
import { BranchSwitcher, useCurrentBranch } from "./branch-switcher";
import { GlobalSearch } from "./GlobalSearch";
import { LocaleSwitcher } from "./locale-switcher";
import { NAV_ICON } from "./nav-icons";
import { QuickCreate } from "./QuickCreate";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

/**
 * The top bar. PC (md+, owner 2026-11-18 "판매용 프리미엄처럼"): the menu lives in the left sidebar (AppSidebar), so the bar
 * shows where you are (group › screen), the search ("/") and "+ 새로 만들기". Phones keep the app name, the branch pill
 * and the iOS-style tab bar below.
 */
export function AppHeader() {
  const t = useTranslations();
  const pathname = usePathname();
  const me = useMe();
  const items = visibleItems(me, useFoodFeatures().menu);
  const canUpload = me.loaded && canOpen(me, "upload");
  const trail = navTrail(items, pathname);

  // Phones: dashboard, ledger, sales on the bar (with the camera between); the rest under "more" (PC-only items stay out)
  const phone = items.filter((n) => !n.sideOnly);
  const onBar = (href: string) => href === "/" || href === "/ledger" || href === "/sales";
  const main = phone.filter((n) => onBar(n.href));
  const rest = phone.filter((n) => !onBar(n.href));
  const [more, setMore] = useState(false);
  // Detail screens hide the tab bar, like a pushed view on iOS, so their own action bar owns the bottom edge
  const showTabBar = !pathname.startsWith("/documents");
  const manyBranches = useBranches().branches.length > 1;
  const branchColor = useCurrentBranch().color;

  // A tapped tab lights up at once, before its page has loaded, and its icon plays a small bounce
  const [tap, setTap] = useState<{ href: string; from: string; n: number } | null>(null);
  const current = activeHref(phone, pathname);
  const active = tap && tap.from === pathname ? tap.href : current;
  const onTap = (href: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    setTap((p) => ({ href, from: pathname, n: (p?.n ?? 0) + 1 }));
  };
  const bounceKey = (href: string) => (tap?.href === href ? tap.n : 0);

  return (
    <>
      <header className="glass-header sticky top-0 z-40" style={branchColor ? { boxShadow: `inset 0 -3px 0 ${branchColor[0]}` } : undefined}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3 focus:text-sm">
          {t("ui.skipToContent")}
        </a>
        {/* Full width beside the sidebar (a centred 1440px box left the trail floating on wide screens — owner 2026-11-18) */}
        <div className="flex h-14 w-full items-center gap-3 px-4 sm:px-6 md:h-16 lg:px-8">
          {/* Phones: the app */}
          <Link href="/" className="press relative flex min-w-0 items-center gap-2.5 text-[15px] font-semibold tracking-tight after:absolute after:-inset-2 active:scale-[0.97] md:hidden">
            <AppMark className={`size-8 flex-none rounded-[9px] ${APP_MARK_GLOW}`} />
            <span className={cn("truncate", manyBranches && "max-sm:hidden")}>{t("app.appName")}</span>
          </Link>

          {/* PC: where am I */}
          <nav aria-label={t("nav.where")} className="hidden min-w-0 flex-1 items-center gap-1.5 text-[14px] md:flex lg:max-w-[18rem] xl:max-w-[24rem]">
            {trail ? (
              <>
                <span className="truncate text-muted-foreground">{t(`nav.group.${trail.group}`)}</span>
                <ChevronRight className="size-3.5 flex-none text-muted-foreground/60" aria-hidden />
                {trail.detail ? (
                  <>
                    <Link href={trail.href} className="truncate text-muted-foreground hover:text-foreground">
                      {t(`nav.${trail.key}`)}
                    </Link>
                    <ChevronRight className="size-3.5 flex-none text-muted-foreground/60" aria-hidden />
                    <span className="truncate font-semibold">{t("nav.detail")}</span>
                  </>
                ) : (
                  <span className="truncate font-semibold" aria-current="page">
                    {t(`nav.${trail.key}`)}
                  </span>
                )}
              </>
            ) : (
              <span className="truncate font-semibold">{t("nav.dashboard")}</span>
            )}
          </nav>

          {/* One search: a field on PC, an icon on phones (it opens the same window) */}
          <div className="ml-auto flex min-w-0 justify-center md:ml-0 md:flex-1">
            <GlobalSearch items={items} />
          </div>

          <div className="flex shrink-0 items-center justify-end gap-1">
            <span className="mr-1 max-md:hidden">
              <QuickCreate items={items} canUpload={canUpload} />
            </span>
            <AssistantButton />
            {/* Phones only: on PC the branch picker sits in the sidebar */}
            <span className="md:hidden">
              <BranchSwitcher />
            </span>
            <LocaleSwitcher />
            {/* Phones: light / dark is in the account menu */}
            <span className="max-md:hidden">
              <ThemeToggle />
            </span>
            <UserMenu />
          </div>
        </div>
      </header>

      {showTabBar && (
        // Phones (owner 2026-10-27): four tabs and the camera in the middle — dashboard, ledger, [+ photo], sales, more
        <nav aria-label={t("nav.menu")} className="tab-bar md:hidden">
          <div className="mx-auto grid max-w-lg grid-cols-5 items-end">
            {main.map(({ href, key }, i) => {
              const Icon = NAV_ICON[key];
              return (
                <Fragment key={href}>
                  {i === 2 && !canUpload && <span aria-hidden />}
                  {i === 2 && canUpload && (
                    <Link href="/upload" onClick={onTap("/upload")} aria-label={t("nav.upload")} className="tab-plus">
                      <span>
                        <Plus className="size-7" strokeWidth={2.4} aria-hidden />
                      </span>
                      {t("nav.upload")}
                    </Link>
                  )}
                  <Link href={href} onClick={onTap(href)} data-active={active === href} aria-current={current === href ? "page" : undefined}>
                    <Icon key={bounceKey(href)} className={cn("size-[22px]", bounceKey(href) > 0 && "sym-tap")} strokeWidth={active === href ? 2.2 : 1.8} aria-hidden />
                    {t(`nav.${key}`)}
                  </Link>
                </Fragment>
              );
            })}
            {rest.length > 0 ? (
              <button type="button" onClick={() => setMore(true)} data-active={!!rest.find((n) => n.href === active)} aria-expanded={more} className="tab-more">
                <LayoutList className="size-[22px]" strokeWidth={rest.some((n) => n.href === active) ? 2.2 : 1.8} aria-hidden />
                {t("nav.more")}
              </button>
            ) : (
              <span aria-hidden />
            )}
          </div>
        </nav>
      )}
      {/* "More": the rest of the menu as big tiles, from below */}
      {more && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={t("nav.more")}>
          <button type="button" className="absolute inset-0 bg-black/35" aria-label={t("app.close")} onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-[26px] bg-background px-4 pt-2 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/25" aria-hidden />
            <ul className="grid grid-cols-3 gap-2.5">
              {rest.map(({ href, key }) => {
                const Icon = NAV_ICON[key];
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={(e) => (onTap(href)(e), setMore(false))}
                      data-active={active === href}
                      className="press flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl bg-card px-1 text-center text-[13px] font-medium shadow-[var(--shadow-soft)] ring-1 ring-border data-[active=true]:text-primary data-[active=true]:ring-primary/40"
                    >
                      <Icon className="size-6" aria-hidden />
                      {t(`nav.${key}`)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
