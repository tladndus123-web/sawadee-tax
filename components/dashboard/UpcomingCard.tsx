"use client";

// The next two weeks from the tax calendar, on the dashboard (owner, 2026-10-27: "대시보드 이쁘게 다시, 추가할 건 추가"):
// tax filings, staff papers running out and the company's own dates, late ones first. Bills and the VAT return are
// left out — the to-do card already has them. Admins (the calendar is theirs).

import { CalendarDays, ChevronRight, CircleCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { useCalendar } from "@/lib/calendar-store";
import { type CalItem, calendarItems, daysTo } from "@/lib/company-calendar";
import { bahtWhole } from "@/lib/money";
import { useMonthLocks } from "@/lib/month-lock-store";
import { useEmployees } from "@/lib/payroll-store";
import { cn } from "@/lib/utils";

const DAYS = 14;
const DOT: Partial<Record<CalItem["kind"], string>> = { event: "bg-[#7c5cff]", doc: "bg-[#c2410c]" };

export function UpcomingCard({ today }: { today: string }) {
  const t = useTranslations("calendar");
  const td = useTranslations("dash.upcoming2");
  const locale = useLocale();
  const { events, done } = useCalendar();
  const { employees } = useEmployees();
  const locked = useMonthLocks();
  const to = new Date(Date.parse(`${today}T00:00:00Z`) + DAYS * 86_400_000).toISOString().slice(0, 10);
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
  const items = useMemo(() => {
    const seen = new Set<string>();
    return calendarItems({
      from,
      to,
      vatRegistered: null,
      payroll: employees.length > 0,
      employees: employees.map((e) => ({ id: e.id, name: e.nickname || e.name, endDate: e.endDate, documents: e.documents })),
      events,
      done,
      locked,
    })
      .filter((i) => !i.done && i.kind !== "bill" && i.kind !== "vat")
      // a repeating company date: only its next time
      .filter((i) => (i.kind === "event" && i.eventId ? !seen.has(i.eventId) && !!seen.add(i.eventId) : true))
      .slice(0, 6);
  }, [from, to, employees, events, done, locked]);
  const date = (d: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const name = (i: CalItem) =>
    i.kind === "event" ? (i.title ?? "") : i.kind === "doc" ? t("docTitle", { name: i.sub ?? "", paper: i.title ?? "" }) : `${t(`short.${i.kind as "monthly"}`)}${i.period ? ` · ${i.period}` : ""}`;

  return (
    <section className="workspace-panel grid gap-3 p-5 sm:p-6" aria-labelledby="upcoming-title">
      <Link href="/calendar" className="press flex items-start justify-between gap-3 rounded-lg">
        <span className="flex items-center gap-2">
          <CalendarDays className="size-5 text-[#7c5cff]" aria-hidden />
          <h2 id="upcoming-title" className="text-lg font-semibold tracking-tight">
            {td("title")}
          </h2>
        </span>
        <span className="flex items-center gap-0.5 text-sm font-medium text-primary">
          {td("all")}
          <ChevronRight className="size-4" aria-hidden />
        </span>
      </Link>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-ok" aria-hidden />
          {td("none")}
        </p>
      ) : (
        <ul className="grid">
          {items.map((i) => {
            const left = daysTo(today, i.date);
            return (
              <li key={i.key} className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0">
                <span className={cn("size-2 flex-none rounded-full", DOT[i.kind] ?? "bg-brand")} aria-hidden />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-[14.5px] font-medium">{name(i)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {date(i.date)}
                    {i.amount ? ` · ${bahtWhole(i.amount)}` : ""}
                  </span>
                </span>
                <span className={cn("flex-none rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums", left < 0 ? "bg-bad-soft text-bad" : left <= 3 ? "bg-warn-soft text-warn" : "bg-muted text-muted-foreground")}>
                  {left === 0 ? t("today") : left < 0 ? t("late", { n: -left }) : t("dDay", { n: left })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
