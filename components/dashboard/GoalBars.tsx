"use client";

// Inside the profit card: how far the month's sales are towards the break-even point (worked out from last month's
// costs for the current month — its bills are not all in yet) and towards the branch's own monthly target, and
// what is still needed per open day. lib/break-even.ts has the arithmetic.

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { breakEven, openDaysLeft, progress } from "@/lib/break-even";
import { ALL } from "@/lib/branches";
import { useBranch, useBranches } from "@/lib/branch-store";
import { useCategories } from "@/lib/category-store";
import { useCompany } from "@/lib/company-store";
import { monthLabor } from "@/lib/cost-control";
import { monthCosts } from "@/lib/cost-split";
import { fixedForMonth } from "@/lib/fixed-costs";
import { useFixedCosts } from "@/lib/fixed-store";
import { useLabor } from "@/lib/labor-store";
import { pick, useLedger } from "@/lib/ledger-store";
import { bahtWhole, fromSatang } from "@/lib/money";
import { useMe } from "@/lib/role-store";
import { monthResult } from "@/lib/sales";
import { useSales } from "@/lib/sales-store";
import { prevMonth, stockChange } from "@/lib/stock";
import { useStock } from "@/lib/stock-store";
import { cn } from "@/lib/utils";

export function GoalBars({ month, today, salesValue }: { month: string; today: string; salesValue: number }) {
  const t = useTranslations("dash");
  const company = useCompany();
  const isAdmin = useMe().role === "admin";
  const branch = useBranch();
  const { branches } = useBranches();
  const { entries } = useLedger();
  const { sales } = useSales();
  const { lines: labor } = useLabor();
  const { lines: fixed } = useFixedCosts();
  const { counts: stock } = useStock();
  const { rows: categories } = useCategories();

  const current = today.slice(0, 7) === month;
  const shown = useMemo(() => (branch === ALL ? branches : branches.filter((b) => b.id === branch)), [branch, branches]);
  const be = useMemo(() => {
    // The current month is judged on last month's costs; a past month on its own
    const base = current ? prevMonth(month) : month;
    const docs = pick(entries, "ledger").map((e) => e.doc);
    const st = stockChange(stock, base).change;
    const costs = monthCosts(docs, base, company.taxId, fixedForMonth(fixed, base), st);
    const lab = monthLabor(labor, base);
    const baseSales = Math.round(monthResult(sales, docs, base, company.taxId, lab, fixedForMonth(fixed, base), st).salesValue * 100);
    const food = new Set(categories.filter((c) => c.foodCost).map((c) => c.key as string));
    return breakEven(costs, food, lab, baseSales);
  }, [current, month, entries, stock, company.taxId, fixed, labor, sales, categories]);

  const goal = Math.round(shown.reduce((a, b) => a + (b.salesTarget || 0), 0) * 100);
  // A day counts as closed only when every shown branch closes on it
  const closed = useMemo(() => [0, 1, 2, 3, 4, 5, 6].filter((d) => shown.length > 0 && shown.every((b) => (b.closedDays ?? []).includes(d))), [shown]);
  const daysLeft = current ? openDaysLeft(month, today, closed) : 0;
  const sold = Math.round(salesValue * 100);

  if (be.point === null && !goal) return null;
  const bep = be.point !== null ? progress(sold, be.point, daysLeft) : null;
  const target = goal ? progress(sold, goal, daysLeft) : null;
  // What to aim for per day: the target when there is one, else break-even
  const aim = target ?? bep;

  return (
    <div className="grid gap-2.5 border-t border-border/60 pt-3">
      {bep && be.point !== null && <Bar label={bep.left ? t("bep", { amount: bahtWhole(fromSatang(be.point)) }) : t("bepDone")} ratio={bep.ratio} done={!bep.left} title={current ? t("bepBasis") : undefined} />}
      {target && <Bar label={t("goal", { amount: bahtWhole(fromSatang(goal)) })} ratio={target.ratio} done={!target.left} strong />}
      {current && aim && aim.left > 0 && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {aim.perDay !== null ? t("perDay", { days: daysLeft, amount: bahtWhole(fromSatang(aim.perDay)) }) : t("perDayNone")}
        </p>
      )}
      {!goal && isAdmin && (
        <Link href="/settings#branch-title" className="w-fit text-xs font-medium text-primary hover:underline">
          {t("setGoal")}
        </Link>
      )}
    </div>
  );
}

function Bar({ label, ratio, done, strong, title }: { label: string; ratio: number; done: boolean; strong?: boolean; title?: string }) {
  const pct = Math.round(ratio * 100);
  return (
    <div className="grid gap-1" title={title}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={cn("flex items-center gap-1 font-medium", done ? "text-ok" : "text-muted-foreground")}>
          {done && <Check className="size-3.5" aria-hidden />}
          {label}
        </span>
        <span className={cn("font-semibold tabular-nums", done ? "text-ok" : "text-foreground")}>{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.min(pct, 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn("h-full rounded-full transition-[width] duration-700", done ? "bg-ok" : strong ? "bg-brand" : "bg-brand/50")} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
