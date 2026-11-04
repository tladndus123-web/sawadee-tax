"use client";

// A screen an owner did not let this admin open (lib/screens): a short note instead of the page.

import { EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Link, usePathname } from "@/i18n/navigation";
import { useMe } from "@/lib/role-store";
import { canOpen, screenOf } from "@/lib/screens";

export function ScreenGuard({ children }: { children: ReactNode }) {
  const t = useTranslations("screens");
  const me = useMe();
  const path = usePathname();
  if (!me.loaded || canOpen(me, screenOf(path))) return <>{children}</>;
  return (
    <section className="mx-auto grid w-full max-w-md justify-items-center gap-3 pt-16 text-center">
      <EyeOff className="size-8 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold tracking-tight">{t("closedTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("closedHint")}</p>
      <Button asChild className="mt-2 rounded-full">
        <Link href="/">{t("home")}</Link>
      </Button>
    </section>
  );
}
