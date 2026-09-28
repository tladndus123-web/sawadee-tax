"use client";

// Equipment ("asset" category): over how many years its cost is written off (lib/cost-split). Shown only for that
// category; "0" = an ordinary cost in the month it was bought.

import { useTranslations } from "next-intl";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { DEP_CHOICES } from "@/lib/cost-split";
import type { LedgerDoc } from "@/lib/types";
import { cn } from "@/lib/utils";

export function DepYears({ className }: { className?: string }) {
  const t = useTranslations("dep");
  const { control } = useFormContext<LedgerDoc>();
  const category = useWatch({ control, name: "category" });
  if (category !== "asset") return null;
  return (
    <div className={cn("grid gap-2", className)} role="group" aria-label={t("label")}>
      <span className="text-xs text-muted-foreground">{t("label")}</span>
      <Controller
        control={control}
        name="depYears"
        render={({ field }) => (
          <div className="flex flex-wrap gap-2">
            {[0, ...DEP_CHOICES].map((y) => {
              const on = (field.value || 0) === y;
              return (
                <button
                  key={y}
                  type="button"
                  aria-pressed={on}
                  onClick={() => field.onChange(y)}
                  className={cn(
                    "press h-9 rounded-full px-3.5 text-[13px] font-medium ring-1 ring-foreground/10",
                    on ? "bg-primary text-primary-foreground ring-primary" : "bg-background hover:bg-muted",
                  )}
                >
                  {y === 0 ? t("none") : t("years", { count: y })}
                </button>
              );
            })}
          </div>
        )}
      />
      <p className="text-[11px] leading-snug text-muted-foreground">{t("hint")}</p>
    </div>
  );
}
