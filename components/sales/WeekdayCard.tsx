"use client";

// Sales by weekday over the last 4 / 8 / 12 weeks: the average day for each weekday (days with sales only), the
// best one highlighted. lib/weekday-sales.ts has the arithmetic.

import { CalendarRange } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { bahtWhole, fromSatang } from "@/lib/money";
import type { Sale } from "@/lib/sales";
import { cn } from "@/lib/utils";
import { weekdayAverages } from "@/lib/weekday-sales";

const SPANS = [4, 8, 12] as const;

export function WeekdayCard({ sales, today }: { sales: Sale[]; today: string }) {
  const t = useTranslations("weekday");
  const locale = useLocale();
  const [weeks, setWeeks] = useState<(typeof SPANS)[number]>(8);
  const rows = useMemo(() => weekdayAverages(sales, today, weeks), [sales, today, weeks]);
  const name = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }), [locale]);
  const max = Math.max(...rows.map((r) => r.avg));
  if (!max) return null;
  const withSales = rows.filter((r) => r.days);
  const low = Math.min(...withSales.map((r) => r.avg));
  // Monday first: how a working week reads (2026-09-07 is a Monday)
  const order = [1, 2, 3, 4, 5, 6, 0];

  return (
    <section className="workspace-panel grid gap-4 p-5 sm:p-6" aria-labelledby="weekday-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <h2 id="weekday-title" className="flex items-center gap-2 text-sm font-semibold">
            <CalendarRange className="size-4 text-brand" aria-hidden />
            {t("title")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("hint", { weeks })}</p>
        </div>
        <div className="flex rounded-full bg-muted p-0.5" role="group" aria-label={t("span")}>
          {SPANS.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={weeks === w}
              onClick={() => setWeeks(w)}
              className={cn("h-10 rounded-full px-3.5 text-xs font-medium pointer-fine:h-8 pointer-fine:px-3", weeks === w ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {t("weeks", { weeks: w })}
            </button>
          ))}
        </div>
      </div>
      <ul className="grid gap-2">
        {order.map((w) => {
          const r = rows[w];
          const top = r.avg === max;
          const bottom = r.days > 0 && r.avg === low && low !== max;
          return (
            <li key={w} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3">
              <span className={cn("text-sm font-medium", top && "text-brand")}>{name.format(new Date(Date.UTC(2026, 8, 6 + w)))}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span className={cn("block h-full rounded-full", top ? "bg-brand" : bottom ? "bg-muted-foreground/40" : "bg-brand/45")} style={{ width: `${(r.avg / max) * 100}%` }} />
              </span>
              <span className="min-w-[5.5rem] text-right text-sm tabular-nums">
                {r.days ? (
                  <>
                    <b className={cn("font-semibold", top && "text-brand")}>{bahtWhole(fromSatang(r.avg))}</b>
                    <span className="ml-1 text-[11px] text-muted-foreground">{t("days", { count: r.days })}</span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">{t("none")}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
