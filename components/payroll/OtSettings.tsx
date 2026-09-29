"use client";

// The company's overtime multiples (admins): overtime, holiday work (monthly / daily staff), holiday overtime. Never
// below the Labour Protection Act (the database refuses it on the pay lines too); a change applies from the next pay
// run saved, and saved payslips keep what they were paid with.

import { ChevronDown, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/invoice/fields";
import { Button } from "@/components/ui/button";
import { saveCompany, useCompany } from "@/lib/company-store";
import { LEGAL_OT, type OtRates, payrollSettingsOf, timesText } from "@/lib/payroll";
import { cn } from "@/lib/utils";

const FIELDS: { k: keyof OtRates; label: "otRate" | "otHolidayMonthly" | "otHolidayDaily" | "otHolidayOt" }[] = [
  { k: "ot", label: "otRate" },
  { k: "holidayMonthly", label: "otHolidayMonthly" },
  { k: "holidayDaily", label: "otHolidayDaily" },
  { k: "holidayOt", label: "otHolidayOt" },
];

export function OtSettings() {
  const t = useTranslations("pay");
  const company = useCompany();
  const [open, setOpen] = useState(false);
  const [r, setR] = useState<OtRates>(payrollSettingsOf(company.payrollSettings).ot);
  const [busy, setBusy] = useState(false);
  useEffect(() => setR(payrollSettingsOf(company.payrollSettings).ot), [company.payrollSettings]);

  const below = FIELDS.some(({ k }) => r[k] < LEGAL_OT[k]);
  const save = async () => {
    if (below) return toast.error(t("otBelowLegal"));
    setBusy(true);
    try {
      await saveCompany({ payroll_settings: { ...payrollSettingsOf(company.payrollSettings), ot: r } });
      toast.success(t("otSaved"));
    } catch {
      toast.error(t("fail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="workspace-panel overflow-hidden p-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="press flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="grid min-w-0 flex-1">
          <span className="text-sm font-semibold">{t("otTitle")}</span>
          <span className="truncate text-xs text-muted-foreground tabular-nums">
            {FIELDS.map(({ k, label }) => `${t(label)} ×${timesText(payrollSettingsOf(company.payrollSettings).ot[k])}`).join(" · ")}
          </span>
        </span>
        <ChevronDown className={cn("size-4 flex-none text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="grid gap-3 border-t border-border/60 px-4 py-3">
          <p className="text-xs leading-snug text-muted-foreground">{t("otHint")}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FIELDS.map(({ k, label }) => (
              <label key={k} className="grid gap-1">
                <span className="text-xs text-muted-foreground">{t(label)}</span>
                <MoneyInput
                  kind="qty"
                  aria-invalid={r[k] < LEGAL_OT[k]}
                  className={cn("h-10 bg-background text-right", r[k] < LEGAL_OT[k] && "border-destructive")}
                  value={r[k]}
                  onChange={(v) => setR({ ...r, [k]: Math.max(0, v || 0) })}
                />
                <span className={cn("text-[11px]", r[k] < LEGAL_OT[k] ? "text-destructive" : "text-muted-foreground")}>{t("otLegal", { rate: timesText(LEGAL_OT[k]) })}</span>
              </label>
            ))}
          </div>
          <Button type="button" variant="secondary" className="h-10 w-fit rounded-full px-4" disabled={busy || below} onClick={() => void save()}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {t("save")}
          </Button>
        </div>
      )}
    </section>
  );
}
