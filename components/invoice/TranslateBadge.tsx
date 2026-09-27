"use client";

// Makes the automatic translation visible: a badge while typing ("write in one language"), and the other two
// languages shown under a field once they exist, so it is clear the document is kept in Thai, English and Japanese.

import { Languages, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { FORM_LANGS, type FormLang, type Tri } from "@/lib/types";
import { cn } from "@/lib/utils";

const LANG_NAME: Record<FormLang, string> = { th: "ไทย", en: "EN", ja: "日本語" };

export function TranslateBadge({ className }: { className?: string }) {
  const t = useTranslations("tr");
  return (
    <div className={cn("ai-ring flex items-start gap-3 rounded-2xl px-4 py-3 print:hidden", className)}>
      <span className="intelligence-mark is-soft size-8 flex-none">
        <Sparkles className="size-4" aria-hidden />
      </span>
      <div className="grid gap-0.5">
        <p className="ai-text text-sm font-semibold">{t("badge")}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("hint")}</p>
      </div>
    </div>
  );
}

/** The other two languages of a field, small, under its input (nothing while they are empty) */
export function OtherLangs({ value, lang }: { value: Tri | undefined; lang: FormLang }) {
  const others = FORM_LANGS.filter((l) => l !== lang && value?.[l]?.trim());
  if (!value || !others.length) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] leading-snug text-muted-foreground">
      <Languages className="size-3 flex-none" aria-hidden />
      {others.map((l) => (
        <span key={l} lang={l} className="min-w-0 [overflow-wrap:anywhere]">
          <span className="font-semibold">{LANG_NAME[l]}</span> {value[l]}
        </span>
      ))}
    </p>
  );
}
