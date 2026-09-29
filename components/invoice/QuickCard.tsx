"use client";

// The quick card (freee-style): only what a person has to confirm — seller, number, date, total, VAT, category,
// payment and paid. Fields the AI was unsure about are marked; tapping the mark shows that spot on the photo.
// Everything else (items, addresses, signatures, tax settings) stays in the detailed view.

import { Calculator, ChevronDown, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { exportLang } from "@/lib/export";
import { quickTotals, vatInside } from "@/lib/quick-totals";
import { todayBangkok } from "@/lib/thai-tax";
import { retitle } from "@/lib/manual-doc";
import { DOC_TYPES, type LedgerDoc, PAYMENTS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MoneyInput } from "./fields";
import { BranchPicker } from "./BranchPicker";
import { DepYears } from "./DepYears";
import { MemoBox } from "./MemoBox";
import { QuickItems } from "./QuickItems";
import { TaxFields } from "./TaxFields";
import { OtherLangs, TranslateBadge } from "./TranslateBadge";
import { useCategoryOptions } from "@/components/vendors/CategoryIcon";

export function QuickCard({ onJump, manual = false, onMemo }: { onJump: (path: string) => void; manual?: boolean; onMemo?: (text: string) => Promise<void> }) {
  const t = useTranslations();
  const lang = exportLang(useLocale());
  const { control, register, setValue, getValues } = useFormContext<LedgerDoc>();
  const [seller, unclear, net, vat, paid, firstItem] = useWatch({ control, name: ["seller", "unclear", "totals.net", "totals.vat", "paid", "items.0"] });
  const unsure = new Set(unclear ?? []);
  const category = useWatch({ control, name: "category" });
  const categoryOptions = useCategoryOptions(category);
  const sellerName = seller?.name?.[lang] || seller?.name?.th || seller?.name?.en || seller?.name?.ja || "";

  const setTotals = (n: number, v: number) => {
    const next = quickTotals(getValues("totals"), n, v);
    setValue("totals", next, { shouldDirty: true });
    // A hand-typed document has one item line: it carries the whole amount before discount (qty 1)
    if (manual && getValues("items").length === 1) {
      setValue("items.0.qty", 1, { shouldDirty: true });
      setValue("items.0.price", next.total, { shouldDirty: true });
      setValue("items.0.amount", next.total, { shouldDirty: true });
    }
  };

  return (
    <div className="workspace-panel grid gap-5 p-5 text-sm">
      {manual ? (
        <div className="grid gap-3">
          <TranslateBadge />
          {/* What kind of paper this is: it names the document and decides the tax checks */}
          <Controller
            control={control}
            name="docType"
            render={({ field }) => (
              <Chips
                label={t("labels.docType")}
                value={field.value}
                options={DOC_TYPES.map((k) => [k, t(`docType.${k}`)])}
                onPick={(k) => {
                  field.onChange(k);
                  setValue("docTitle", retitle(getValues("docTitle"), k as LedgerDoc["docType"]), { shouldDirty: true });
                }}
              />
            )}
          />
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
            <Row label={t("labels.seller")} path="seller.name" unsure={unsure} onJump={onJump}>
              <Input className="h-10" aria-label={t("labels.seller")} {...register(`seller.name.${lang}`)} />
              <OtherLangs value={seller?.name} lang={lang} />
            </Row>
            <Row label={t("labels.taxId")} path="seller.taxId" unsure={unsure} onJump={onJump}>
              <Input
                className="mono h-10"
                inputMode="numeric"
                maxLength={13}
                aria-label={t("labels.taxId")}
                {...register("seller.taxId", { setValueAs: (v: string) => String(v ?? "").replace(/\D/g, "") })}
              />
            </Row>
          </div>
          <Row label={t("quick.what")} path="items.0.desc" unsure={unsure} onJump={onJump}>
            <Input className="h-10" aria-label={t("quick.what")} placeholder={t("quick.whatHint")} {...register(`items.0.desc.${lang}`)} />
            <OtherLangs value={firstItem?.desc} lang={lang} />
          </Row>
        </div>
      ) : (
        <Row label={t("labels.seller")} path="seller.name" unsure={unsure} onJump={onJump}>
          <p className="min-h-10 content-center text-[15px] font-semibold [overflow-wrap:anywhere]">
            {sellerName || <span className="font-normal text-muted-foreground">—</span>}
            {seller?.taxId && <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">{seller.taxId}</span>}
          </p>
        </Row>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Row label={t("labels.docNo")} path="docNo" unsure={unsure} onJump={onJump}>
          <Input className="mono h-10" aria-label={t("labels.docNo")} {...register("docNo")} />
        </Row>
        <Row label={t("labels.date")} path="date" unsure={unsure} onJump={onJump}>
          <Input type="date" className="h-10" aria-label={t("labels.date")} {...register("date")} />
        </Row>
        <Row label={t("labels.net")} path="totals.net" unsure={unsure} onJump={onJump}>
          <MoneyInput
            aria-label={t("labels.net")}
            className="h-10 text-[15px] font-semibold"
            value={Number(net) || 0}
            onChange={(n) => setTotals(Number(n) || 0, Number(getValues("totals.vat")) || 0)}
          />
        </Row>
        <Row label={t("labels.vat")} path="totals.vat" unsure={unsure} onJump={onJump}>
          <div className="flex gap-2">
            <MoneyInput
              aria-label={t("labels.vat")}
              className="h-10 min-w-0 flex-1"
              value={Number(vat) || 0}
              onChange={(v) => setTotals(Number(getValues("totals.net")) || 0, Number(v) || 0)}
            />
            <button
              type="button"
              onClick={() => {
                const n = Number(getValues("totals.net")) || 0;
                setTotals(n, vatInside(n));
              }}
              className="press inline-flex h-10 flex-none items-center gap-1.5 rounded-xl bg-secondary px-3 text-xs font-medium hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]"
            >
              <Calculator className="size-4" aria-hidden />
              {t("quick.vat7")}
            </button>
          </div>
        </Row>
      </div>

      <Controller
        control={control}
        name="category"
        render={({ field }) => (
          <Chips label={t("app.category")} value={field.value} options={categoryOptions.map((o) => [o.key, o.label])} onPick={field.onChange} />
        )}
      />
      <Controller
        control={control}
        name="payment"
        render={({ field }) => (
          <Chips label={t("app.payment")} value={field.value} options={PAYMENTS.map((k) => [k, t(`payment.${k}`)])} onPick={field.onChange} />
        )}
      />
      <DepYears />
      <Controller control={control} name="branchId" render={({ field }) => <BranchPicker value={field.value} onChange={field.onChange} />} />

      <div className="flex flex-wrap items-center gap-3">
        <Controller
          control={control}
          name="paid"
          render={({ field }) => (
            <label className="flex min-h-10 items-center gap-2 font-medium">
              <Checkbox
                checked={!!field.value}
                onCheckedChange={(v) => {
                  const on = v === true;
                  field.onChange(on);
                  if (on && !getValues("paidDate")) setValue("paidDate", todayBangkok(), { shouldDirty: true });
                        if (!on) setValue("paidDate", "", { shouldDirty: true });
                }}
              />
              {t("app.paid")}
            </label>
          )}
        />
        {paid && <Input type="date" aria-label={t("app.paidOn")} className="h-10 w-40 max-w-full" {...register("paidDate")} />}
      </div>

      {/* A typed-in document keeps its one line above; a read one can have its lines changed here */}
      {!manual && <QuickItems />}

      <MemoBox onCommit={onMemo} className="rounded-2xl border-0 bg-muted/50 px-4 py-3" />

      <details className="group rounded-2xl bg-muted/50 px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
          {t("quick.taxSettings")}
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-3 grid">
          <TaxFields />
        </div>
      </details>
    </div>
  );
}

function Row({
  label,
  path,
  unsure,
  onJump,
  children,
}: {
  label: string;
  path: string;
  unsure: Set<string>;
  onJump: (path: string) => void;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const on = unsure.has(path);
  return (
    <div className={cn("grid min-w-0 content-start gap-1.5 rounded-xl", on && "-m-2 bg-warn-soft p-2")}>
      <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {label}
        {on && (
          <button type="button" onClick={() => onJump(path)} className="inline-flex items-center gap-1 font-semibold text-warn">
            <TriangleAlert className="size-3.5" aria-hidden />
            {t("quick.unsure")}
          </button>
        )}
      </span>
      {children}
    </div>
  );
}

function Chips({ label, value, options, onPick }: { label: string; value: string; options: [string, string][]; onPick: (v: string) => void }) {
  return (
    <div className="grid gap-2" role="group" aria-label={label}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map(([k, text]) => (
          <button
            key={k}
            type="button"
            aria-pressed={value === k}
            onClick={() => onPick(k)}
            className={cn(
              "press h-9 rounded-full px-3.5 text-[13px] font-medium ring-1 ring-foreground/10",
              value === k ? "bg-primary text-primary-foreground ring-primary" : "bg-background hover:bg-muted",
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
