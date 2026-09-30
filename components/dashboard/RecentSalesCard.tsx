"use client";

// Dashboard: the last seven days of sales, ending yesterday, with yesterday against the same weekday a week before.
// A day without sales shows "closed" on the branch's closing weekdays, else a dash (not entered yet).

import { ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { ALL } from "@/lib/branches";
import { useBranch, useBranches } from "@/lib/branch-store";
import { bahtWhole, fromSatang } from "@/lib/money";
import { recentSales } from "@/lib/recent-sales";
import { useSales } from "@/lib/sales-store";
import { cn } from "@/lib/utils";

export function RecentSalesCard({ today }: { today: string }) {
  const t = useTranslations("recent");
  const locale = useLocale();
  const { sales, loaded } = useSales();
  const branch = useBranch();
  const { branches } = useBranches();
  const r = useMemo(() => recentSales(sales, today), [sales, today]);
  const weekday = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" }), [locale]);
  const shown = branch === ALL ? branches : branches.filter((b) => b.id === branch);
  const closed = (w: number) => shown.length > 0 && shown.every((b) => (b.closedDays ?? []).includes(w));
  if (!loaded) return null;
  const max = Math.max(...r.days.map((d) => d.value), 1);
  const pct = r.change === null ? null : Math.round(r.change * 100);

  return (
    <section className="workspace-panel flex flex-1 flex-col gap-4 p-5 sm:p-6" aria-labelledby="recent-title">
      <Link href="/sales" className="press flex items-start justify-between gap-3 rounded-lg">
        <span className="grid gap-0.5">
          <h2 id="recent-title" className="text-lg font-semibold tracking-tight">
            {t("title")}
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums">{t("total", { amount: bahtWhole(fromSatang(r.total)) })}</span>
        </span>
        <ChevronRight className="mt-1 size-4 flex-none text-muted-foreground" aria-hidden />
      </Link>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs text-muted-foreground">{t("yesterday")}</span>
        {r.yesterday ? (
          <span className="text-2xl font-semibold tracking-tight tabular-nums">{bahtWhole(fromSatang(r.yesterday))}</span>
        ) : (
          <span className="text-sm font-medium text-muted-foreground">{closed(new Date(`${r.days[r.days.length - 1].date}T00:00:00Z`).getUTCDay()) ? t("closed") : t("missing")}</span>
        )}
        {pct !== null && (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", pct >= 0 ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad")}>
            {pct >= 0 ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
            {t("vsWeek", { pct: `${pct >= 0 ? "+" : ""}${pct}%` })}
          </span>
        )}
      </div>

      <ol className="grid min-h-36 flex-1 grid-cols-7 items-stretch gap-1.5" aria-label={t("title")}>
        {r.days.map((d, i) => {
          const w = new Date(`${d.date}T00:00:00Z`).getUTCDay();
          const last = i === r.days.length - 1;
          const label = d.value ? bahtWhole(fromSatang(d.value)) : closed(w) ? t("closed") : t("missing");
          return (
            <li key={d.date} className="grid grid-rows-[auto_1fr_auto_auto] justify-items-center gap-1" title={`${d.date} · ${label}`}>
              <span className="text-[10px] text-muted-foreground tabular-nums">{d.value ? `${Math.round(fromSatang(d.value) / 1000)}k` : ""}</span>
              <span className="flex min-h-20 w-full items-end">
                <span
                  className={cn("w-full rounded-md", d.value ? (last ? "bg-brand" : "bg-brand/40") : "h-1 bg-muted")}
                  style={d.value ? { height: `${Math.max(6, (d.value / max) * 100)}%` } : undefined}
                />
              </span>
              <span className={cn("text-[11px]", last ? "font-semibold text-foreground" : "text-muted-foreground")}>{weekday.format(new Date(`${d.date}T00:00:00Z`))}</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">{Number(d.date.slice(8))}</span>
              <span className="sr-only">{label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
