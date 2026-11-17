"use client";

// "+ 새로 만들기" in the PC top bar (owner 2026-11-18, from the for-sale version): from any screen straight to what is made
// most — a receipt photo, a document typed in, the day's sales, an expense claim, a date, a contract. Only what this
// person's menu opens is offered.

import { CalendarPlus, Camera, FileSignature, HandCoins, Keyboard, Plus, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import type { NavItem } from "@/lib/nav-menu";

const ACTIONS = [
  { key: "upload", href: "/upload", needs: "upload", icon: Camera },
  { key: "manual", href: "/documents/new", needs: "/ledger", icon: Keyboard },
  { key: "sale", href: "/sales", needs: "/sales", icon: TrendingUp },
  { key: "claim", href: "/expenses?new=1", needs: "/expenses", icon: HandCoins },
  { key: "event", href: "/calendar", needs: "/calendar", icon: CalendarPlus },
  { key: "contract", href: "/contracts?new=1", needs: "/contracts", icon: FileSignature },
] as const;

export function QuickCreate({ items, canUpload }: { items: NavItem[]; canUpload: boolean }) {
  const t = useTranslations("quickNew");
  // Radix menus make ids that differ between server and browser: a plain button until hydrated
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const shown = ACTIONS.filter((a) => (a.needs === "upload" ? canUpload : items.some((i) => i.href === a.needs)));
  if (!shown.length) return null;
  const button = (
    <button
      type="button"
      aria-label={t("open")}
      className="press hidden h-10 flex-none items-center gap-1.5 rounded-full bg-primary px-4 text-[14px] font-semibold text-primary-foreground shadow-[0_6px_16px_-8px_rgb(0_113_227/0.6)] transition-colors hover:bg-primary/90 md:flex"
    >
      <Plus className="size-4" strokeWidth={2.4} aria-hidden />
      <span className="max-lg:hidden">{t("open")}</span>
    </button>
  );
  if (!hydrated) return button;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-60 rounded-2xl p-1.5">
        {shown.map(({ key, href, icon: Icon }) => (
          <DropdownMenuItem key={key} asChild>
            <Link href={href} className="gap-3 rounded-xl px-2.5 py-2 text-[14px]">
              <span className="grid size-8 flex-none place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" aria-hidden />
              </span>
              {t(key)}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
