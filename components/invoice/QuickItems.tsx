"use client";

// The item lines on the quick card: add, change or remove a line without the detailed form. The description is typed
// in the screen language (the other languages follow on save, lib/translate-gaps); quantity × price fills the
// amount; each line can take its own category (a mixed receipt).

import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { useCategoryOptions } from "@/components/vendors/CategoryIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exportLang } from "@/lib/export";
import { fmt, fromSatang, toSatang } from "@/lib/money";
import { emptyTri } from "@/lib/normalize";
import type { LedgerDoc } from "@/lib/types";
import { MoneyInput } from "./fields";
import { OtherLangs } from "./TranslateBadge";

export function QuickItems() {
  const t = useTranslations();
  const lang = exportLang(useLocale());
  const options = useCategoryOptions();
  const { control, register, setValue, getValues } = useFormContext<LedgerDoc>();
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = useWatch({ control, name: "items" }) ?? [];
  const sum = fromSatang(items.reduce((a, i) => a + toSatang(Number(i?.amount) || 0), 0));

  // Quantity × price → amount (a line with neither keeps its typed amount)
  const recompute = (i: number) => {
    const qty = Number(getValues(`items.${i}.qty`)) || 0;
    const price = Number(getValues(`items.${i}.price`)) || 0;
    if (qty && price) setValue(`items.${i}.amount`, fromSatang(Math.round(qty * toSatang(price))), { shouldDirty: true });
  };

  return (
    <details className="group rounded-2xl bg-muted/50 px-4 py-3" open={fields.length > 0 && fields.length <= 3}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        <span>
          {t("items.title", { count: fields.length })}
          {fields.length > 0 && <span className="ml-2 font-semibold text-foreground tabular-nums">{fmt(sum)}</span>}
        </span>
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>

      <ol className="mt-3 grid gap-2.5">
        {fields.map((f, i) => (
          <li key={f.id} className="grid gap-2 rounded-xl bg-background p-3 ring-1 ring-border">
            <div className="flex items-start gap-2">
              <span className="mono mt-2.5 w-5 flex-none text-xs text-muted-foreground">{i + 1}</span>
              <div className="grid min-w-0 flex-1 gap-1">
                <Input className="h-10" aria-label={`${t("labels.desc")} ${i + 1}`} placeholder={t("items.descHint")} {...register(`items.${i}.desc.${lang}`)} />
                <OtherLangs value={items[i]?.desc} lang={lang} />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10 flex-none text-muted-foreground hover:text-bad"
                aria-label={`${t("app.del")} ${i + 1}`}
                onClick={() => remove(i)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2 pl-7">
              <label className="grid gap-1">
                <span className="text-[11px] text-muted-foreground">{t("labels.qty")}</span>
                <Controller
                  control={control}
                  name={`items.${i}.qty`}
                  render={({ field }) => (
                    <Input
                      inputMode="decimal"
                      className="h-10 text-right tabular-nums"
                      value={field.value || ""}
                      onChange={(e) => field.onChange(Number(e.target.value.replace(/[^\d.]/g, "")) || 0)}
                      onBlur={() => recompute(i)}
                    />
                  )}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] text-muted-foreground">{t("labels.price")}</span>
                <Controller
                  control={control}
                  name={`items.${i}.price`}
                  render={({ field }) => (
                    <MoneyInput className="h-10" value={Number(field.value) || 0} onChange={(v) => (field.onChange(Number(v) || 0), recompute(i))} />
                  )}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] text-muted-foreground">{t("labels.amount")}</span>
                <Controller
                  control={control}
                  name={`items.${i}.amount`}
                  render={({ field }) => <MoneyInput className="h-10 font-semibold" value={Number(field.value) || 0} onChange={(v) => field.onChange(Number(v) || 0)} />}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 pl-7">
              <span className="flex-none text-[11px] text-muted-foreground">{t("app.category")}</span>
              <Controller
                control={control}
                name={`items.${i}.category`}
                render={({ field }) => (
                  <select value={field.value || ""} onChange={(e) => field.onChange(e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-2 text-xs">
                    <option value="">{t("app.sameAsDoc")}</option>
                    {options.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              />
            </label>
          </li>
        ))}
      </ol>
      <Button
        type="button"
        variant="outline"
        className="mt-2.5 h-10 w-full rounded-xl bg-background"
        onClick={() => append({ category: "", code: "", desc: emptyTri(), wh: "", qty: 1, unit: emptyTri(), price: 0, amount: 0 })}
      >
        <Plus className="size-4" />
        {t("items.add")}
      </Button>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{t("items.hint")}</p>
    </details>
  );
}
