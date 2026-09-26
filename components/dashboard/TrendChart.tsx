"use client";

// 6-month purchases: one series (net total per month) → bars, no legend (the title names it),
// hover tooltip per bar, recessive grid, 4px rounded ends on the baseline, and a table view.
// Bar colour = --primary, validated for contrast on both surfaces (dataviz validate_palette).

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { monthDate } from "@/lib/archive";
import type { TrendPoint } from "@/lib/dashboard";
import { fmt } from "@/lib/money";

export function TrendChart({ data, active }: { data: TrendPoint[]; active: string }) {
  const t = useTranslations("dash");
  const locale = useLocale();
  const [table, setTable] = useState(false);
  const short = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const long = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "UTC" });
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const rows = data.map((p) => ({ ...p, label: short.format(monthDate(p.month)) }));

  return (
    <section aria-labelledby="trend-title" className="workspace-panel hover-lift [--lift:1.006] grid gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="trend-title" className="text-lg font-semibold tracking-tight">
            {t("trend")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("trendHint")}</p>
        </div>
        <button type="button" className="rounded-full px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10" onClick={() => setTable((v) => !v)}>
          {table ? t("chartView") : t("tableView")}
        </button>
      </div>

      {table ? (
        <table className="w-full text-sm">
          <tbody>
            {data.map((p) => (
              <tr key={p.month} className="border-b border-border/60 last:border-0">
                <th scope="row" className="py-2 text-left font-medium">
                  {long.format(monthDate(p.month))}
                </th>
                <td className="py-2 text-right text-muted-foreground">{t("docs", { count: p.count })}</td>
                <td className="py-2 pl-4 text-right font-semibold tabular-nums">฿ {fmt(p.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ChartContainer config={{ net: { label: t("trend"), color: "var(--primary)" } }} className="aspect-auto h-56 w-full">
          <BarChart data={rows} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
            <YAxis width={44} tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v: number) => compact.format(v)} />
            <Tooltip
              cursor={{ fill: "color-mix(in srgb, var(--foreground) 5%, transparent)" }}
              content={({ active: on, payload }) => {
                const p = on && payload?.[0]?.payload as (TrendPoint & { label: string }) | undefined;
                if (!p) return null;
                return (
                  <div className="grid gap-0.5 rounded-xl border bg-popover px-3 py-2 text-xs shadow-[var(--shadow-soft)]">
                    <span className="font-semibold">{long.format(monthDate(p.month))}</span>
                    <span className="tabular-nums">฿ {fmt(p.net)}</span>
                    <span className="text-muted-foreground">
                      {t("docs", { count: p.count })} · VAT ฿ {fmt(p.vat)}
                    </span>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="net"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
              fill="var(--color-net)"
              // The chosen month stays full strength, the others step back
              shape={(props: unknown) => {
                const { x, y, width, height, payload } = props as { x: number; y: number; width: number; height: number; payload: TrendPoint };
                const r = Math.min(4, width / 2, height);
                const on = payload.month === active;
                return (
                  <path
                    d={`M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`}
                    fill="var(--color-net)"
                    opacity={on ? 1 : 0.45}
                  />
                );
              }}
            />
          </BarChart>
        </ChartContainer>
      )}
    </section>
  );
}
