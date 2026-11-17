"use client";

// AI 재료 준비량 예측 (owner 2026-11-18, a restaurant extra — Settings → 음식점 기능): the next 7 days against a usual day
// (closed days shown as closed) and tomorrow's amounts of the main ingredients, read from the last 4 weeks' food
// purchases; "AI 한마디" asks the model to word it (admins). Follows the branch being worked in. Pure parts:
// lib/prep-forecast, lib/prep-brief.

import { ChefHat, Loader2, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { SectionTitle } from "@/components/ui/section-title";
import { Badge } from "@/components/ui/badge";
import { useCategories } from "@/lib/category-store";
import { ALL } from "@/lib/branches";
import { useBranch, useBranches } from "@/lib/branch-store";
import { bahtWhole } from "@/lib/money";
import { type Brief, prepSheet } from "@/lib/prep-brief";
import { dailySales, prepForecast, prepIngredients } from "@/lib/prep-forecast";
import { useMe } from "@/lib/role-store";
import type { Sale } from "@/lib/sales";
import type { LedgerDoc } from "@/lib/types";

const TONE = { more: "bad", less: "brand", usual: "muted", closed: "muted" } as const;

export function PrepCard({ sales, purchases, today }: { sales: Sale[]; purchases: LedgerDoc[]; today: string }) {
  const t = useTranslations("prep");
  const locale = useLocale();
  const me = useMe();
  const branch = useBranch();
  const { branches } = useBranches();
  const { rows: categories } = useCategories();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const shown = branch === ALL ? branches : branches.filter((b) => b.id === branch);
  // A weekday counts as closed only when every branch shown is closed on it
  const setClosed = useMemo(() => [0, 1, 2, 3, 4, 5, 6].filter((d) => shown.length > 0 && shown.every((b) => (b.closedDays ?? []).includes(d))), [shown]);
  const f = useMemo(() => prepForecast(dailySales(sales), today, setClosed), [sales, today, setClosed]);
  const food = useMemo(() => new Set(categories.filter((c) => c.foodCost).map((c) => c.key as string)), [categories]);
  const ings = useMemo(() => prepIngredients(purchases, food, today, f), [purchases, food, today, f]);
  const wd = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }), [locale]);

  const ask = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/sales/prep-brief", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sheet: prepSheet(f, ings), lang: locale }) });
      const body = (await res.json().catch(() => ({}))) as { brief?: Brief };
      if (body.brief) setBrief(body.brief);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const tomorrow = f.days[0];
  return (
    <section className="workspace-panel grid gap-4 p-5 sm:p-6" aria-labelledby="prep-title">
      <SectionTitle id="prep-title" icon={ChefHat}>
        {t("title")}
      </SectionTitle>
      {!f.enough ? (
        <p className="text-sm text-muted-foreground">{t("notEnough")}</p>
      ) : (
        <>
          <div className="grid gap-1">
            <p className="text-sm text-muted-foreground">{t("tomorrow")}</p>
            {tomorrow.advice === "closed" ? (
              <p className="text-2xl font-semibold">{t("closed")}</p>
            ) : (
              <p className="flex flex-wrap items-baseline gap-2">
                <span className="text-[28px] leading-tight font-bold tracking-tight tabular-nums">{bahtWhole(tomorrow.expected)}</span>
                <Badge tone={TONE[tomorrow.advice]}>{t(`advice.${tomorrow.advice}`, { pct: Math.abs(tomorrow.pct) })}</Badge>
              </p>
            )}
            <p className="text-xs text-muted-foreground">{t("usual", { amount: bahtWhole(f.usual) })}</p>
          </div>
          {/* The coming week, one small bar a day */}
          <ol className="grid grid-cols-7 gap-1.5" aria-label={t("week")}>
            {f.days.map((d) => {
              const max = Math.max(...f.days.map((x) => x.expected), 1);
              return (
                <li key={d.day} className="grid justify-items-center gap-1 text-[11.5px]">
                  <span className="flex h-16 w-full items-end rounded-lg bg-muted/60 p-0.5">
                    <span className={`block w-full rounded-md ${d.advice === "more" ? "bg-bad/70" : d.advice === "less" ? "bg-brand/50" : d.advice === "closed" ? "" : "bg-brand/80"}`} style={{ height: `${Math.max(d.advice === "closed" ? 0 : 6, Math.round((d.expected / max) * 100))}%` }} />
                  </span>
                  <span className={d.advice === "closed" ? "text-muted-foreground line-through" : "font-medium"}>{wd.format(new Date(`${d.day}T00:00:00Z`))}</span>
                </li>
              );
            })}
          </ol>
          {ings.length > 0 && tomorrow.advice !== "closed" && (
            <div className="grid gap-2">
              <p className="text-sm font-semibold">{t("ingredients")}</p>
              <ul className="grid grid-cols-2 gap-2">
                {ings.map((i) => (
                  <li key={`${i.name}|${i.unit}`} className="grid min-w-0 gap-0.5 rounded-xl bg-muted/50 px-3 py-2">
                    <span className="truncate text-[13px] text-muted-foreground">{i.name}</span>
                    <span className="text-[16px] font-semibold tabular-nums">
                      {i.tomorrow} <span className="text-[12px] font-normal text-muted-foreground">{i.unit}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[11.5px] text-muted-foreground">{t("fromPurchases")}</p>
            </div>
          )}
          {me.role === "admin" &&
            (brief ? (
              <div className="grid gap-1.5 rounded-2xl bg-brand-soft/60 p-3.5 text-[13.5px]">
                <p className="flex items-start gap-1.5 font-medium">
                  <Sparkles className="mt-0.5 size-4 flex-none text-brand" aria-hidden />
                  {brief.summary}
                </p>
                {brief.actions.map((a) => (
                  <p key={a} className="pl-5.5 text-muted-foreground">
                    • {a}
                  </p>
                ))}
              </div>
            ) : (
              <button type="button" disabled={busy} onClick={() => void ask()} className="press inline-flex h-11 w-fit items-center gap-1.5 rounded-full bg-brand-soft px-4 text-[14px] font-medium text-brand pointer-fine:h-9">
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
                {failed ? t("aiRetry") : t("ai")}
              </button>
            ))}
        </>
      )}
    </section>
  );
}
