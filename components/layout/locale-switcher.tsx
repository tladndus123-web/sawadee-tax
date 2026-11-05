"use client";

import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

const LABELS: [Locale, string, string][] = [
  ["ja", "日本語", "JA"],
  ["th", "ไทย", "TH"],
  ["en", "English", "EN"],
  ["ko", "한국어", "KO"],
];

/** Compact globe menu: one button in the bar instead of four chips. */
export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("nav");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const short = LABELS.find(([code]) => code === locale)?.[2] ?? locale.toUpperCase();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 gap-1.5 rounded-full px-3 text-[13px] text-muted-foreground" aria-label={t("language")} disabled={pending}>
          <Globe className="size-4" aria-hidden />
          <span className="font-semibold">{short}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40 rounded-xl">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t("language")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(next) => {
            if (!next || next === locale) return;
            // Same screen (and its ?query) in another language. If the in-app switch does not land (a slow phone, an
            // installed app keeping the old page), open the new address outright, so the language always changes.
            const query = window.location.search;
            const target = `/${next}${pathname === "/" ? "" : pathname}${query}${window.location.hash}`;
            startTransition(() => router.replace(`${pathname}${query}`, { locale: next as Locale, scroll: false }));
            window.setTimeout(() => {
              if (!window.location.pathname.startsWith(`/${next}`)) window.location.assign(target);
            }, 2500);
          }}
        >
          {LABELS.map(([code, label]) => (
            <DropdownMenuRadioItem key={code} value={code} lang={code} className="min-h-10 rounded-lg">
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
