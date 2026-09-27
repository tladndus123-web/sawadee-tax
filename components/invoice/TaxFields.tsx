"use client";

// Tax details of one document, next to category / payment: the month the input VAT is claimed in, whether it
// may be claimed at all (§82/5), and the withholding tax made when paying (rate + kind, amount worked out).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMonthLabel } from "@/components/ledger/Stickers";
import { invoiceMonth, NO_DATE } from "@/lib/archive";
import { vatBlocked } from "@/lib/checks";
import { nextMonth } from "@/lib/month-lock-store";
import { baht } from "@/lib/money";
import { WHT_MIN_BASE, whtAmount, whtBase } from "@/lib/wht";
import { type LedgerDoc, WHT_DEFAULT_RATE, WHT_TYPES, type WhtType } from "@/lib/types";

const CLAIM = { auto: null, yes: false, no: true } as const;
type ClaimKey = keyof typeof CLAIM;
const claimKey = (v: boolean | null | undefined): ClaimKey => (v === true ? "no" : v === false ? "yes" : "auto");

export function TaxFields() {
  const t = useTranslations("tax");
  const tc = useTranslations("category");
  const monthLabel = useMonthLabel();
  const { control, setValue, getValues } = useFormContext<LedgerDoc>();
  const [date, taxMonth, category, noClaim, whtType, whtRate, taxable, exempt, docType, copyKind] = useWatch({
    control,
    name: ["date", "taxMonth", "category", "noClaim", "whtType", "whtRate", "totals.taxable", "totals.exempt", "docType", "copyKind"],
  });

  // Read as a copy or as another kind of paper → its VAT is never claimable. When the real paper is an
  // original full tax invoice, one tick fixes both fields; unticking puts the reading back. The offer is
  // decided once, from the values the screen opened with, so it does not vanish when ticked.
  const [asRead] = useState<{ docType: LedgerDoc["docType"]; copyKind: LedgerDoc["copyKind"] } | null>(() => {
    const dt = getValues("docType");
    const ck = getValues("copyKind");
    return dt !== "full" || ck === "copy" ? { docType: dt, copyKind: ck } : null;
  });
  const asOriginal = docType === "full" && copyKind !== "copy";
  const setOriginal = (on: boolean) => {
    if (!asRead) return;
    setValue("docType", on ? "full" : asRead.docType, { shouldDirty: true });
    setValue("copyKind", on ? "original" : asRead.copyKind, { shouldDirty: true });
  };

  // The invoice month and the six after it (a late invoice is claimed a little later); keep a set value listed
  const own = invoiceMonth({ date: date ?? "" });
  const months: string[] = [];
  if (own !== NO_DATE) for (let m = nextMonth(own), i = 0; i < 6; i++, m = nextMonth(m)) months.push(m);
  if (taxMonth && !months.includes(taxMonth)) months.push(taxMonth);

  const blocked = vatBlocked({ noClaim: noClaim ?? null, category: category ?? "other" });
  const amount = whtAmount({ taxable: Number(taxable) || 0, exempt: Number(exempt) || 0 }, Number(whtRate) || 0);

  // Changing the kind or rate recalculates the withholding line of the totals
  const setWht = (type: WhtType | "", rate: number) => {
    setValue("whtType", type, { shouldDirty: true });
    setValue("whtRate", type ? rate : 0, { shouldDirty: true });
    const base = { taxable: Number(getValues("totals.taxable")) || 0, exempt: Number(getValues("totals.exempt")) || 0 };
    setValue("totals.wht", type ? whtAmount(base, rate) : 0, { shouldDirty: true });
  };

  return (
    <div className="grid gap-4 border-t pt-4 sm:col-span-2 sm:grid-cols-3 xl:col-span-3">
      <label className="grid min-w-0 content-start gap-2">
        <span className="text-xs text-muted-foreground">{t("claimMonth")}</span>
        <Controller
          control={control}
          name="taxMonth"
          render={({ field }) => (
            <Select value={field.value || "own"} onValueChange={(v) => field.onChange(v === "own" ? "" : v)} disabled={own === NO_DATE}>
              <SelectTrigger size="sm" className="h-10 w-full" aria-label={t("claimMonth")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="own">{own === NO_DATE ? t("noDate") : t("claimOwn", { month: monthLabel(own) })}</SelectItem>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>
                    {monthLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <span className="text-[11px] leading-snug text-muted-foreground">{t("claimHint")}</span>
      </label>

      <label className="grid min-w-0 content-start gap-2">
        <span className="text-xs text-muted-foreground">{t("vatClaim")}</span>
        <Controller
          control={control}
          name="noClaim"
          render={({ field }) => (
            <Select value={claimKey(field.value)} onValueChange={(v) => field.onChange(CLAIM[v as ClaimKey])}>
              <SelectTrigger size="sm" className="h-10 w-full" aria-label={t("vatClaim")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t("auto", { state: category === "entertainment" ? t("no") : t("yes") })}</SelectItem>
                <SelectItem value="yes">{t("yes")}</SelectItem>
                <SelectItem value="no">{t("no")}</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        <span className={blocked ? "text-[11px] leading-snug text-warn" : "text-[11px] leading-snug text-muted-foreground"}>
          {blocked ? t("blockedHint", { category: tc(category ?? "other") }) : t("noHint")}
        </span>
      </label>

      <div className="grid min-w-0 content-start gap-2">
        <span className="text-xs text-muted-foreground">{t("wht")}</span>
        <div className="flex gap-2">
          <Select value={whtType || "none"} onValueChange={(v) => (v === "none" ? setWht("", 0) : setWht(v as WhtType, WHT_DEFAULT_RATE[v as WhtType]))}>
            <SelectTrigger size="sm" className="h-10 min-w-0 flex-1" aria-label={t("wht")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("whtNone")}</SelectItem>
              {WHT_TYPES.map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`whtType.${k}`)} · {WHT_DEFAULT_RATE[k]}%
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {whtType && (
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={0.5}
              aria-label={t("whtRate")}
              className="h-10 w-20"
              value={whtRate ?? 0}
              onChange={(e) => setWht(whtType, Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
            />
          )}
        </div>
        <span className="text-[11px] leading-snug text-muted-foreground">
          {whtType ? t("whtAmount", { amount: baht(amount) }) : t("whtHint")}
          {whtType && whtBase({ taxable: Number(taxable) || 0, exempt: Number(exempt) || 0 }) < WHT_MIN_BASE && (
            <span className="mt-1 block text-warn">{t("whtUnderMin")}</span>
          )}
        </span>
      </div>

      {asRead && (
        <label className="flex items-start gap-3 rounded-2xl bg-brand-soft p-3.5 sm:col-span-3">
          <Checkbox className="mt-0.5 bg-background" checked={asOriginal} onCheckedChange={(v) => setOriginal(v === true)} />
          <span className="grid gap-1">
            <span className="text-sm font-medium">{t("originalFix")}</span>
            <span className="text-[11px] leading-snug text-muted-foreground">{t("originalFixHint")}</span>
          </span>
        </label>
      )}
    </div>
  );
}
