"use client";

// Profit and loss by category, months side by side: sales by channel, costs by category (biggest first), profit.
// On phones the table scrolls sideways with the item names pinned on the left. Excel download for the accountant.

import { ChevronLeft, FileSpreadsheet, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { invoiceMonth, monthDate, NO_DATE } from "@/lib/archive";
import { useCompany } from "@/lib/company-store";
import { pick, useLedger } from "@/lib/ledger-store";
import { fmt } from "@/lib/money";
import { type PlRow, plTable } from "@/lib/pl-table";
import { saleMonth } from "@/lib/sales";
import { useSales } from "@/lib/sales-store";
import { todayBangkok } from "@/lib/thai-tax";
import { cn } from "@/lib/utils";

const SPANS = [3, 6, 12] as const;

export function PlReport() {
  const t = useTranslations();
  const locale = useLocale();
  const company = useCompany();
  const { sales, loaded: salesLoaded } = useSales();
  const { entries, loaded } = useLedger();
  const today = todayBangkok();
  const [end, setEnd] = useState(today.slice(0, 7));
  const [span, setSpan] = useState<(typeof SPANS)[number]>(6);
  const [busy, setBusy] = useState(false);

  const purchases = useMemo(() => pick(entries, "ledger").map((e) => e.doc), [entries]);
  const months = useMemo(() => {
    const set = new Set<string>([today.slice(0, 7), ...sales.map(saleMonth), ...purchases.map((d) => invoiceMonth(d)).filter((m) => m !== NO_DATE)]);
    return [...set].sort().reverse();
  }, [sales, purchases, today]);
  const table = useMemo(() => plTable(sales, purchases, end, span, company.taxId), [sales, purchases, end, span, company.taxId]);

  const short = new Intl.DateTimeFormat(locale, { year: "2-digit", month: "short", timeZone: "UTC" });
  const long = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "UTC" });
  const monthShort = (m: string) => short.format(monthDate(m));
  const cols = table.months.length + 2;
  // Phones show only a few columns: start at the right end, where the latest months and the totals are
  const scroller = useRef<HTMLDivElement>(null);
  const ready = loaded && salesLoaded;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [ready, end, span]);

  const excel = async () => {
    setBusy(true);
    try {
      const { downloadPlXlsx } = await import("@/lib/pl-xlsx");
      const name = await downloadPlXlsx(table, {
        sheet: t("pl.title"),
        item: t("pl.item"),
        total: t("pl.total"),
        sales: t("pl.sales"),
        salesTotal: t("pl.salesTotal"),
        costs: t("pl.costs"),
        costTotal: t("pl.costTotal"),
        profit: t("pl.profit"),
        month: monthShort,
        channel: (k) => t(`sales.ch.${k as "store"}`),
        category: (k) => (k === "depreciation" ? t("pl.depreciation") : t(`category.${k as "other"}`)),
      });
      toast.success(t("pl.downloaded", { name }));
    } catch {
      toast.error(t("app.saveFail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" className="-ml-3 text-primary">
          <Link href="/sales">
            <ChevronLeft className="size-4" />
            {t("sales.title")}
          </Link>
        </Button>
        <Button type="button" variant="secondary" className="rounded-full px-4" disabled={busy || !loaded} onClick={() => void excel()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4 text-ok" />}
          {t("pl.excel")}
        </Button>
      </div>
      <header className="grid gap-1">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("pl.title")}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("pl.intro")}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <select className="h-10 rounded-full border bg-card px-3 text-sm" value={end} onChange={(e) => setEnd(e.target.value)} aria-label={t("pl.until")}>
          {months.map((m) => (
            <option key={m} value={m}>
              {t("pl.untilMonth", { month: long.format(monthDate(m)) })}
            </option>
          ))}
        </select>
        <div className="flex rounded-full bg-muted p-1" role="group" aria-label={t("pl.span")}>
          {SPANS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={span === n}
              onClick={() => setSpan(n)}
              className={cn("h-8 rounded-full px-3 text-sm", span === n ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}
            >
              {t("pl.months", { count: n })}
            </button>
          ))}
        </div>
      </div>

      {!ready ? (
        <Loader2 className="mx-auto my-10 size-6 animate-spin text-muted-foreground" aria-label="Loading" />
      ) : (
        <div ref={scroller} className="workspace-panel overflow-x-auto p-0">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th scope="col" className="sticky left-0 z-10 bg-card py-3 pr-3 pl-4 text-left text-xs font-medium text-muted-foreground">
                  {t("pl.item")}
                </th>
                {table.months.map((m) => (
                  <th key={m} scope="col" className="px-3 py-3 text-right text-xs font-medium whitespace-nowrap text-muted-foreground">
                    {monthShort(m)}
                  </th>
                ))}
                <th scope="col" className="border-l border-border/60 px-3 py-3 text-right text-xs font-semibold whitespace-nowrap">
                  {t("pl.total")}
                </th>
              </tr>
            </thead>
            <tbody>
              <SectionRow label={t("pl.sales")} cols={cols} />
              {table.sales.map((r) => (
                <MoneyRow key={r.key} label={t(`sales.ch.${r.key}`)} r={r} indent />
              ))}
              <MoneyRow label={t("pl.salesTotal")} r={table.salesTotal} strong />
              <SectionRow label={t("pl.costs")} cols={cols} />
              {table.costs.map((r) => (
                <MoneyRow key={r.key} label={r.key === "depreciation" ? t("pl.depreciation") : t(`category.${r.key}`)} r={r} indent />
              ))}
              <MoneyRow label={t("pl.costTotal")} r={table.costTotal} strong />
              <MoneyRow label={t("pl.profit")} r={table.profit} strong profit />
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-muted-foreground">{t("pl.note")}</p>
    </div>
  );
}

function SectionRow({ label, cols }: { label: string; cols: number }) {
  return (
    <tr>
      <th colSpan={cols} scope="colgroup" className="bg-card px-4 pt-4 pb-1 text-left text-xs font-semibold text-muted-foreground">
        <span className="sticky left-4">{label}</span>
      </th>
    </tr>
  );
}

function MoneyRow({ label, r, strong, profit, indent }: { label: string; r: PlRow<unknown>; strong?: boolean; profit?: boolean; indent?: boolean }) {
  return (
    <tr className={cn("border-b border-border/60", strong && "font-semibold")}>
      <th scope="row" className={cn("sticky left-0 z-10 py-2.5 pr-3 text-left font-[inherit] whitespace-nowrap", indent ? "pl-6" : "pl-4", strong ? "bg-muted" : "bg-card")}>
        {label}
      </th>
      {[...r.values, r.total].map((v, i) => (
        <td
          key={i}
          className={cn(
            "px-3 py-2.5 text-right whitespace-nowrap tabular-nums",
            strong && "bg-muted/50",
            i === r.values.length && "border-l border-border/60 font-semibold",
            profit && (v < 0 ? "text-bad" : v > 0 ? "text-brand" : ""),
            !v && !strong && "text-muted-foreground/60",
          )}
        >
          {v ? fmt(v) : "–"}
        </td>
      ))}
    </tr>
  );
}
