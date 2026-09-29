"use client";

// The month as a calendar per branch: which days have the shop's (POS) sales, which are missing, and the regular
// closing days. Tapping a day opens that day's sale, or a new one on that date.

import { CalendarCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { BranchAvatar, useBranchName } from "@/components/layout/branch-switcher";
import { type Branch, branchLabel } from "@/lib/branches";
import { type SaleDay, missingDays, saleDays } from "@/lib/sale-days";
import type { Sale } from "@/lib/sales";
import { cn } from "@/lib/utils";

const TONE: Record<SaleDay["state"], string> = {
  sold: "bg-brand-soft text-brand font-semibold",
  missing: "bg-bad-soft text-bad font-semibold ring-1 ring-bad/40",
  closed: "bg-muted text-muted-foreground line-through decoration-1",
  later: "text-muted-foreground/60",
  before: "text-muted-foreground/60",
};

export function SaleCalendar({
  month,
  today,
  sales,
  branches,
  all,
  onDay,
}: {
  month: string;
  today: string;
  sales: Sale[];
  /** The branches to show (one, or every branch when "all" is chosen) */
  branches: Branch[];
  /** Every branch of the company, for the avatar colours */
  all: Branch[];
  onDay: (branchId: string, day: SaleDay) => void;
}) {
  const t = useTranslations("sales");
  const locale = useLocale();
  const names = useBranchName();
  const weekday = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" }), [locale]);
  const dayName = useMemo(() => new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" }), [locale]);
  // Sunday … Saturday (2026-09-06 is a Sunday)
  const heads = useMemo(() => Array.from({ length: 7 }, (_, i) => weekday.format(new Date(Date.UTC(2026, 8, 6 + i)))), [weekday]);
  const cals = useMemo(
    () => branches.map((b) => ({ b, days: saleDays(sales, b.id, month, today, b.closedDays) })),
    [branches, sales, month, today],
  );
  if (!cals.length) return null;

  return (
    <section className="workspace-panel grid gap-4 p-5 sm:p-6" aria-labelledby="salecal-title">
      <div className="grid gap-1">
        <h2 id="salecal-title" className="flex items-center gap-2 text-sm font-semibold">
          <CalendarCheck className="size-4 text-brand" aria-hidden />
          {t("calTitle")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("calHint")}</p>
      </div>
      <div className={cn("grid gap-6", cals.length > 1 && "lg:grid-cols-2")}>
        {cals.map(({ b, days }) => {
          const missing = missingDays(days).length;
          const lead = days[0]?.weekday ?? 0;
          return (
            <div key={b.id} className="grid content-start gap-2.5">
              <div className="flex items-center justify-between gap-2">
                {cals.length > 1 ? (
                  <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <BranchAvatar branch={b} branches={all} size="size-6" className="text-[11px]" />
                    <span className="truncate">{branchLabel(b, names)}</span>
                  </span>
                ) : (
                  <span />
                )}
                <span className={cn("flex-none rounded-full px-2.5 py-0.5 text-xs font-semibold", missing ? "bg-bad-soft text-bad" : "bg-ok-soft text-ok")}>
                  {missing ? t("calMissing", { count: missing }) : t("calAllIn")}
                </span>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center" role="group" aria-label={branchLabel(b, names)}>
                {heads.map((h, i) => (
                  <span key={i} className={cn("text-[11px] text-muted-foreground", (b.closedDays ?? []).includes(i) && "line-through")} aria-hidden>
                    {h}
                  </span>
                ))}
                {Array.from({ length: lead }, (_, i) => (
                  <span key={`pad${i}`} aria-hidden />
                ))}
                {days.map((d) => {
                  const label = `${dayName.format(new Date(`${d.date}T00:00:00Z`))} · ${t(`calState.${d.state}`)}`;
                  return d.state === "later" ? (
                    <span key={d.date} className={cn("grid h-9 place-items-center rounded-lg text-[13px] tabular-nums", TONE.later, d.date === today && "ring-1 ring-foreground/30")} aria-label={label}>
                      {Number(d.date.slice(8))}
                    </span>
                  ) : (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => onDay(b.id, d)}
                      aria-label={label}
                      title={label}
                      className={cn("press grid h-9 place-items-center rounded-lg text-[13px] tabular-nums hover:ring-1 hover:ring-foreground/20", TONE[d.state])}
                    >
                      {Number(d.date.slice(8))}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground" aria-hidden>
        <Key className={TONE.sold} text={t("calState.sold")} />
        <Key className={TONE.missing} text={t("calState.missing")} />
        <Key className={TONE.closed} text={t("calState.closed")} />
      </div>
    </section>
  );
}

function Key({ className, text }: { className: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-3 rounded", className)} />
      {text}
    </span>
  );
}
