"use client";

import { LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import { signOut, useMe } from "@/lib/role-store";
import { canOpen } from "@/lib/screens";

/** Initial in a circle → name, email, role, settings, sign out */
export function UserMenu() {
  const t = useTranslations();
  const me = useMe();
  const { theme, setTheme } = useTheme();
  if (!me.userId) return null;
  const label = me.name || me.email;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-10 rounded-full after:absolute after:-inset-1" aria-label={t("auth.account")}>
          <span className="grid size-7 place-items-center rounded-full bg-foreground text-[13px] font-semibold text-background uppercase">{label.slice(0, 1)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56 rounded-xl">
        <DropdownMenuLabel className="grid gap-0.5">
          <span className="truncate text-sm font-semibold">{label}</span>
          {me.name && <span className="truncate text-xs font-normal text-muted-foreground">{me.email}</span>}
          <span className="text-xs font-normal text-muted-foreground">{me.owner ? t("role.owner") : t(`role.${me.role}`)}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {canOpen(me, "settings") && (
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings className="size-4" />
              {t("nav.settings")}
            </Link>
          </DropdownMenuItem>
        )}
        {/* Phones only: the theme button left the top bar (app-header) */}
        <div className="md:hidden">
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("nav.theme")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
            <DropdownMenuRadioItem value="light">
              <Sun className="size-4" /> {t("nav.light")}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon className="size-4" /> {t("nav.dark")}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor className="size-4" /> {t("nav.system")}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
        </div>
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut className="size-4" />
          {t("nav.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
