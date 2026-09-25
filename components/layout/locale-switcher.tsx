"use client";

import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
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
  ["ko", "한국어", "KO"],
  ["th", "ไทย", "TH"],
  ["en", "English", "EN"],
  ["ja", "日本語", "JA"],
];

/** Compact globe menu: one button in the bar instead of four chips. */
export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("nav");
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [pending, startTransition] = useTransition();
  const short = LABELS.find(([code]) => code === locale)?.[2] ?? locale.toUpperCase();

  return (
    <DropdownMenu>
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
            startTransition(() => {
              // @ts-expect-error -- params always match the current pathname
              router.replace({ pathname, params }, { locale: next as Locale });
            });
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
