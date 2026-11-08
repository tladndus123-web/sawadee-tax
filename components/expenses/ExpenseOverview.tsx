"use client";

// The top of the expenses screen for admins (owner, 2026-11-06: "심심하지 않게"): this month's claims as one big number
// against last month, where the money went (a coloured bar by category), who claimed most, and the AI's read of the
// month (lib/insights-server expenseReport) — which also gives the one-line notes on the claims below.

import { ArrowDownRight, ArrowUpRight, ChevronRight, Lightbulb, Loader2, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useCategoryLabel, useCategorySolid } from "@/components/vendors/CategoryIcon";
import type { Claim } from "@/lib/expenses";
import { bahtWhole, fromSatang } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface ExpenseAi {
  headline: string;
  points: string[];
  tip: string;
  notes: Record<string, string>;
}

const prevMonth = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);

/** The month's claims that count (not rejected), by category and by person, satang */
export function monthBreakdown(claims: Claim[], month: string) {
  const mine = claims.filter((c) => c.day.startsWith(month) && c.status !== "rejected");
  const sum = (list: Claim[]) => list.reduce((a, c) => a + c.amount, 0);
  const group = (key: (c: Claim) => string) => {
    const by = new Map<string, number>();
    for (const c of mine) by.set(key(c), (by.get(key(c)) ?? 0) + c.amount);
    return [...by.entries()].sort((a, b) => b[1] - a[1]);
  };
  return {
    total: sum(mine),
    count: mine.length,
    prev: sum(claims.filter((c) => c.day.startsWith(prevMonth(month)) && c.status !== "rejected")),
    categories: group((c) => c.category),
    people: group((c) => c.name || "?"),
  };
}

export function ExpenseOverview({
  claims,
  month,
  canAi,
  onNotes,
  status,
}: {
  claims: Claim[];
  month: string;
  canAi: boolean;
  onNotes: (n: Record<string, string>) => void;
  /** What waits, what is owed and what was paid back this month (satang) — one line under the big number */
  status?: { pending: number; owed: number; paid: number; onPending: () => void; onOwed: () => void };
}) {
  const t = useTranslations("expenses.over");
  const ts = useTranslations("expenses");
  const locale = useLocale();
  const catLabel = useCategoryLabel();
  const solid = useCategorySolid();
  const b = useMemo(() => monthBreakdown(claims, month), [claims, month]);
  const change = b.prev > 0 ? Math.round(((b.total - b.prev) / b.prev) * 100) : null;
  const monthName = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

  // The AI's read: asked when the month's claims change (the server keeps it until then)
  const [ai, setAi] = useState<ExpenseAi | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "none" | "fail">("idle");
  const key = useMemo(() => claims.filter((c) => c.day.startsWith(month)).map((c) => `${c.id}:${c.status}:${c.amount}`).join("|"), [claims, month]);
  useEffect(() => {
    if (!canAi || !b.count) return;
    let live = true;
    setAiState("loading");
    void fetch("/api/expenses/insights", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ month, lang: locale }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { body?: ExpenseAi | null }) => {
        if (!live) return;
        if (j.body) {
          setAi(j.body);
          onNotes(j.body.notes ?? {});
          setAiState("idle");
        } else setAiState("none");
      })
      .catch(() => live && setAiState("fail"));
    return () => void (live = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- asked again only when the month's claims change
  }, [key, month, locale, canAi]);

  const peopleMax = b.people[0]?.[1] ?? 0;
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]" aria-label={t("title", { month: monthName })}>
      <div className="workspace-panel relative grid content-start gap-4 overflow-hidden p-5 sm:p-6">
        <span className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-primary/10 blur-2xl" aria-hidden />
        <div className="grid gap-1">
          <span className="text-[13px] font-medium text-muted-foreground">{t("title", { month: monthName })}</span>
          <div className="flex flex-wrap items-end gap-3">
            <b className="text-[clamp(2rem,7vw,2.75rem)] leading-none font-bold tracking-tight tabular-nums">{bahtWhole(fromSatang(b.total))}</b>
            {change !== null && (
              <span className={cn("mb-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums", change > 0 ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok")}>
                {change > 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
                {t("vsLast", { pct: Math.abs(change) })}
              </span>
            )}
          </div>
          <span className="text-[13px] text-muted-foreground">{t("count", { n: b.count })}</span>
        </div>
        {status && (
          <div className="flex flex-wrap gap-2" role="group" aria-label={ts("summary")}>
            <button type="button" onClick={status.onPending} className={cn("press inline-flex h-11 pointer-fine:h-9 items-center gap-1.5 rounded-full pr-2.5 pl-3 text-[13px] font-semibold", status.pending > 0 ? "bg-warn-soft text-warn" : "bg-muted text-muted-foreground")}>
              {ts("sumPending")} {ts("countN", { n: status.pending })}
              <ChevronRight className="size-3.5 opacity-70" aria-hidden />
            </button>
            <button type="button" onClick={status.onOwed} className={cn("press inline-flex h-11 pointer-fine:h-9 items-center gap-1.5 rounded-full pr-2.5 pl-3 text-[13px] font-semibold tabular-nums", status.owed > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
              {ts("sumOwed")} {bahtWhole(fromSatang(status.owed))}
              <ChevronRight className="size-3.5 opacity-70" aria-hidden />
            </button>
            <span className="inline-flex h-9 items-center rounded-full bg-muted px-3 text-[13px] text-muted-foreground tabular-nums">
              {ts("sumPaid")} {bahtWhole(fromSatang(status.paid))}
            </span>
          </div>
        )}

        {b.total > 0 ? (
          <>
            {/* Where the money went */}
            <div className="grid gap-2">
              <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={t("byCategory")}>
                {b.categories.map(([k, v]) => (
                  <span key={k} className={cn("h-full first:rounded-l-full last:rounded-r-full", solid(k))} style={{ width: `${(v / b.total) * 100}%` }} title={`${catLabel(k)} ${bahtWhole(fromSatang(v))}`} />
                ))}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px]">
                {b.categories.slice(0, 6).map(([k, v]) => (
                  <li key={k} className="flex items-center gap-1.5">
                    <span className={cn("size-2.5 rounded-full", solid(k))} aria-hidden />
                    <span className="text-muted-foreground">{catLabel(k)}</span>
                    <b className="tabular-nums">{Math.round((v / b.total) * 100)}%</b>
                  </li>
                ))}
              </ul>
            </div>
            {/* Who claimed most */}
            <div className="grid gap-2">
              <span className="text-[12px] font-semibold text-muted-foreground">{t("byPerson")}</span>
              <ul className="grid gap-1.5">
                {b.people.slice(0, 4).map(([name, v], i) => (
                  <li key={name} className="grid grid-cols-[1.25rem_minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-2 text-[13px]">
                    <span className={cn("grid size-5 place-items-center rounded-full text-[11px] font-bold", i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{i + 1}</span>
                    <span className="truncate font-medium">{name}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <span className="block h-full rounded-full bg-primary/70" style={{ width: `${peopleMax ? (v / peopleMax) * 100 : 0}%` }} />
                    </span>
                    <b className="tabular-nums">{bahtWhole(fromSatang(v))}</b>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <p className="text-[14px] text-muted-foreground">{t("none")}</p>
        )}
      </div>

      {/* The AI's read of the month */}
      <div className="workspace-panel ai-ring grid content-start gap-3 p-5 sm:p-6">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-primary">
          <Sparkles className="size-4" aria-hidden />
          {t("aiTitle")}
        </span>
        {!canAi ? (
          <p className="text-[14px] text-muted-foreground">{t("aiAdmins")}</p>
        ) : !b.count ? (
          <p className="text-[14px] text-muted-foreground">{t("aiNothing")}</p>
        ) : aiState === "loading" && !ai ? (
          <div className="grid gap-2" aria-busy>
            <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("aiReading")}
            </span>
            {[90, 75, 82].map((w) => (
              <span key={w} className="h-3.5 animate-pulse rounded-full bg-muted" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : ai ? (
          <>
            <p className="text-[16px] leading-snug font-semibold text-pretty">{ai.headline}</p>
            {ai.points.length > 0 && (
              <ul className="grid gap-1.5">
                {ai.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-[13.5px] leading-relaxed">
                    <span className="mt-2 size-1.5 flex-none rounded-full bg-primary" aria-hidden />
                    {p}
                  </li>
                ))}
              </ul>
            )}
            {ai.tip && (
              <p className="flex items-start gap-2 rounded-2xl bg-ok-soft px-3.5 py-2.5 text-[13.5px] leading-relaxed text-foreground">
                <Lightbulb className="mt-0.5 size-4 flex-none text-ok" aria-hidden />
                {ai.tip}
              </p>
            )}
          </>
        ) : (
          <p className="text-[14px] text-muted-foreground">{aiState === "fail" ? t("aiFail") : t("aiNothing")}</p>
        )}
      </div>
    </section>
  );
}
