"use client";

import { LogOut, Settings, WalletCards } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import { signOut, useMe } from "@/lib/role-store";

/** Initial in a circle → name, email, role, settings, payroll (admins), sign out */
export function UserMenu() {
  const t = useTranslations();
  const me = useMe();
  if (!me.userId) return null;
  const label = me.name || me.email;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-10 rounded-full" aria-label={t("auth.account")}>
          <span className="grid size-7 place-items-center rounded-full bg-foreground text-[13px] font-semibold text-background uppercase">{label.slice(0, 1)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56 rounded-xl">
        <DropdownMenuLabel className="grid gap-0.5">
          <span className="truncate text-sm font-semibold">{label}</span>
          {me.name && <span className="truncate text-xs font-normal text-muted-foreground">{me.email}</span>}
          <span className="text-xs font-normal text-muted-foreground">{t(`role.${me.role}`)}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="size-4" />
            {t("nav.settings")}
          </Link>
        </DropdownMenuItem>
        {me.role === "admin" && (
          <DropdownMenuItem asChild>
            <Link href="/payroll">
              <WalletCards className="size-4" />
              {t("nav.payroll")}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut className="size-4" />
          {t("nav.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
