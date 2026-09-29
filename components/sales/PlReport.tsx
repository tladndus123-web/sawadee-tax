"use client";

// Profit and loss by category, months side by side: sales by channel, costs by category (biggest first), profit.
// On phones the table scrolls sideways with the item names pinned on the left. Excel download for the accountant.
// Each figure can also show its share of that column's sales (amount / % / both), so the cost structure reads at a glance.

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
import { type PlRow, plTable, rowShares } from "@/lib/pl-table";
import { saleMonth } from "@/lib/sales";
import { useSales } from "@/lib/sales-store";
import { todayBangkok } from "@/lib/thai-tax";
import { cn } from "@/lib/utils";
import { useCategoryLabel } from "@/components/vendors/CategoryIcon";
import { useChannelLabel } from "./channel-name";
import { useLabor } from "@/lib/labor-store";
import { useFixedCosts } from "@/lib/fixed-store";

const SPANS = [3, 6, 12] as const;
const VIEWS = ["both", "amount", "share"] as const;
type View = (typeof VIEWS)[number];
const VIEW_KEY = "pl-view";

export function PlReport() {
  const t = useTranslations();
  const locale = useLocale();
  const company = useCompany();
  const { sales, loaded: salesLoaded } = useSales();
  const { entries, loaded } = useLedger();
  const today = todayBangkok();
  const catLabel = useCategoryLabel();
  const [end, setEnd] = useState(today.slice(0, 7));
  const [span, setSpan] = useState<(typeof SPANS)[number]>(6);
  const [busy, setBusy] = useState(false);
  // Amount, share of sales, or both — remembered on this device
  const [view, setView] = useState<View>("both");
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v && (VIEWS as readonly string[]).includes(v)) setView(v as View);
    } catch {}
  }, []);
  const pickView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const purchases = useMemo(() => pick(entries, "ledger").map((e) => e.doc), [entries]);
  const months = useMemo(() => {
    const set = new Set<string>([today.slice(0, 7), ...sales.map(saleMonth), ...purchases.map((d) => invoiceMonth(d)).filter((m) => m !== NO_DATE)]);
    return [...set].sort().reverse();
  }, [sales, purchases, today]);
  const { lines: labor } = useLabor();
  const chName = useChannelLabel();
  const { lines: fixed } = useFixedCosts();
  const table = useMemo(() => plTable(sales, purchases, end, span, company.taxId, labor, fixed), [sales, purchases, end, span, company.taxId, labor, fixed]);

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
        shareSheet: t("pl.shareSheet"),
        costs: t("pl.costs"),
        costTotal: t("pl.costTotal"),
        profit: t("pl.profit"),
        month: monthShort,
        channel: (k) => chName(k),
        category: (k) => (k === "depreciation" || k === "disposal" || k === "labor" ? t(`pl.${k}`) : catLabel(k)),
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
        <div className="flex rounded-full bg-muted p-1" role="group" aria-label={t("pl.view")}>
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => pickView(v)}
              className={cn("h-8 rounded-full px-3 text-sm", view === v ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}
            >
              {t(`pl.view_${v}`)}
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
                <th scope="col" className="sticky left-0 z-10 bg-card py-3 pr-3 pl-4 text-left text-xs font-medium text-muted-foreground shadow-[inset_-1px_0_0_var(--border),6px_0_8px_-6px_rgb(0_0_0/12%)]">
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
                <MoneyRow key={r.key} label={chName(r.key)} r={r} sales={table.salesTotal} view={view} indent />
              ))}
              <MoneyRow label={t("pl.salesTotal")} r={table.salesTotal} sales={table.salesTotal} view={view} strong />
              <SectionRow label={t("pl.costs")} cols={cols} />
              {table.costs.map((r) => (
                <MoneyRow key={r.key} label={r.key === "depreciation" || r.key === "disposal" || r.key === "labor" ? t(`pl.${r.key}`) : catLabel(r.key)} r={r} sales={table.salesTotal} view={view} indent />
              ))}
              <MoneyRow label={t("pl.costTotal")} r={table.costTotal} sales={table.salesTotal} view={view} strong />
              <MoneyRow label={t("pl.profit")} r={table.profit} sales={table.salesTotal} view={view} strong profit />
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

const pctText = (p: number | null) => (p === null ? "–" : `${p.toFixed(1)}%`);

function MoneyRow({
  label,
  r,
  sales,
  view,
  strong,
  profit,
  indent,
}: {
  label: string;
  r: PlRow<unknown>;
  sales: PlRow<unknown>;
  view: View;
  strong?: boolean;
  profit?: boolean;
  indent?: boolean;
}) {
  const shares = rowShares(r, sales);
  const pcts = [...shares.values, shares.total];
  return (
    <tr className={cn("border-b border-border/60", strong && "font-semibold")}>
      <th scope="row" className={cn("sticky left-0 z-10 py-2.5 pr-3 text-left font-[inherit] whitespace-nowrap shadow-[inset_-1px_0_0_var(--border),6px_0_8px_-6px_rgb(0_0_0/12%)]", indent ? "pl-6" : "pl-4", strong ? "bg-muted" : "bg-card")}>
        {label}
      </th>
      {[...r.values, r.total].map((v, i) => {
        const pct = v ? pctText(pcts[i]) : "–";
        return (
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
            {view === "share" ? (
              pct
            ) : (
              <>
                <span className="block">{v ? fmt(v) : "–"}</span>
                {view === "both" && v !== 0 && <span className={cn("block text-[11px] font-normal", profit ? "" : "text-muted-foreground")}>{pct}</span>}
              </>
            )}
          </td>
        );
      })}
    </tr>
  );
}
