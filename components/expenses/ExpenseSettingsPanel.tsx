"use client";

// Expense claim settings, in plain words: what staff may claim (tap to turn on / off), approve small claims by
// themselves, a receipt photo needed or not, new claims on LINE.

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CategoryIcon, useCategoryOptions } from "@/components/vendors/CategoryIcon";
import { saveExpenseSettings, useClaims } from "@/lib/expense-store";
import { AUTO_CHOICES, type ExpenseSettings } from "@/lib/expenses";
import { cn } from "@/lib/utils";

export function ExpenseSettingsPanel({ onClose }: { onClose: () => void }) {
  const t = useTranslations("expenses");
  const { settings } = useClaims();
  const options = useCategoryOptions();
  const [s, setS] = useState<ExpenseSettings>(settings);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(s) !== JSON.stringify(settings);
  const toggle = (k: ExpenseSettings["categories"][number]) =>
    setS({ ...s, categories: s.categories.includes(k) ? s.categories.filter((c) => c !== k) : [...s.categories, k] });

  return (
    <section className="workspace-panel grid gap-6 p-5 sm:p-6" aria-labelledby="exp-settings">
      <div className="flex items-center justify-between gap-2">
        <h2 id="exp-settings" className="text-lg font-semibold">
          {t("settingsTitle")}
        </h2>
        <Button type="button" variant="ghost" size="icon" className="size-9 rounded-full" aria-label={t("close")} onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="grid gap-2">
        <p className="text-[15px] font-semibold">{t("catTitle")}</p>
        <p className="text-[13px] text-muted-foreground">{t("catHint")}</p>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              aria-pressed={s.categories.includes(o.key)}
              onClick={() => toggle(o.key)}
              className={cn("flex h-10 items-center gap-2 rounded-full border pr-3.5 pl-1.5 text-[13px] font-medium", s.categories.includes(o.key) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}
            >
              <CategoryIcon category={o.key} className="size-7 rounded-full" />
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-[15px] font-semibold">{t("autoTitle")}</p>
        <p className="text-[13px] text-muted-foreground">{t("autoHint")}</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("autoTitle")}>
          {AUTO_CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={s.autoUnder === n}
              onClick={() => setS({ ...s, autoUnder: n })}
              className={cn("h-10 rounded-full border px-4 text-[14px] font-semibold", s.autoUnder === n ? "border-transparent bg-primary text-primary-foreground" : "border-border")}
            >
              {n ? t("autoUnder", { amount: `฿${n.toLocaleString("en-US")}` }) : t("autoOff")}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-start justify-between gap-4">
        <span className="grid gap-1">
          <span className="text-[15px] font-semibold">{t("photoTitle")}</span>
          <span className="text-[13px] text-muted-foreground">{t("photoHint")}</span>
        </span>
        <Switch checked={s.photo} onCheckedChange={(v) => setS({ ...s, photo: v })} />
      </label>
      <label className="flex items-start justify-between gap-4">
        <span className="grid gap-1">
          <span className="text-[15px] font-semibold">{t("lineTitle")}</span>
          <span className="text-[13px] text-muted-foreground">{t("lineHint")}</span>
        </span>
        <Switch checked={s.line} onCheckedChange={(v) => setS({ ...s, line: v })} />
      </label>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" className="rounded-full" disabled={!dirty || busy} onClick={() => setS(settings)}>
          {t("cancel")}
        </Button>
        <Button
          type="button"
          className="rounded-full px-6"
          disabled={!dirty || busy || !s.categories.length}
          onClick={async () => {
            setBusy(true);
            try {
              await saveExpenseSettings(s);
              toast.success(t("saved"));
            } catch {
              toast.error(t("fail"));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("save")}
        </Button>
      </div>
    </section>
  );
}
