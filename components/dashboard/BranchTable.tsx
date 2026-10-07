"use client";

// The combined board (all branches, when the company has several): the month for all together on top, then one
// card per branch with the same figures (sales, costs, profit, and FL / FLR against sales); tapping a card switches
// to that branch. Same arithmetic as the sales page (lib/branches branchSummaries → lib/sales monthResult) and the
// cost control card (lib/cost-control).

import { ChevronRight, Layers } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { RANK_BY, type RankBy, rankBranches } from "@/lib/branch-rank";
import { BranchAvatar, useBranchName } from "@/components/layout/branch-switcher";
import { BRANCH_COLORS, branchLabel, branchSummaries, colorOf } from "@/lib/branches";
import { setBranch, useBranches } from "@/lib/branch-store";
import { useCategories } from "@/lib/category-store";
import { useCompany } from "@/lib/company-store";
import { type CostControl, costControl, targetsOf } from "@/lib/cost-control";
import { monthCosts } from "@/lib/cost-split";
import { pick, useLedger } from "@/lib/ledger-store";
import { bahtWhole } from "@/lib/money";
import type { MonthResult } from "@/lib/sales";
import { useSales } from "@/lib/sales-store";
import { cn } from "@/lib/utils";
import { useLabor } from "@/lib/labor-store";
import { fixedForMonth } from "@/lib/fixed-costs";
import { useFixedCosts } from "@/lib/fixed-store";
import { stockChange } from "@/lib/stock";
import { useStock } from "@/lib/stock-store";

export function BranchTable({ month, companyTaxId }: { month: string; companyTaxId: string }) {
  const t = useTranslations("branch");
  const names = useBranchName();
  const { branches } = useBranches();
  const { entries } = useLedger({ all: true });
  const { sales } = useSales({ all: true });
  const { lines: labor } = useLabor({ all: true });
  const { lines: fixed } = useFixedCosts({ all: true });
  const { counts: stock } = useStock({ all: true });
  const company = useCompany();
  const { rows: categories } = useCategories();
  const { rows, total, totalCost } = useMemo(() => {
    const purchases = pick(entries, "ledger").map((e) => e.doc);
    const s = branchSummaries(branches, purchases, sales, month, companyTaxId, labor, fixed, stock);
    const food = new Set(categories.filter((c) => c.foodCost).map((c) => c.key as string));
    const targets = targetsOf(company.costTargets);
    const cc = (salesValue: number, costs: Parameters<typeof costControl>[1], lab: number) => costControl(Math.round(salesValue * 100), costs, food, lab, targets);
    return {
      rows: s.rows.map((r) => ({ ...r, cost: cc(r.result.salesValue, r.costs, r.labor) })),
      total: s.total,
      totalCost: cc(s.total.salesValue, monthCosts(purchases, month, companyTaxId, fixedForMonth(fixed, month), stockChange(stock, month).change), s.rows.reduce((a, r) => a + r.labor, 0)),
    };
  }, [branches, entries, sales, month, companyTaxId, labor, fixed, stock, categories, company.costTargets]);
  // Which figure the branch cards are ranked on (remembered on this device)
  const [by, setBy] = useState<RankBy>("profit");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RANK_KEY) as RankBy | null;
      if (saved && RANK_BY.includes(saved)) setBy(saved);
    } catch {}
  }, []);
  const choose = (k: RankBy) => {
    setBy(k);
    try {
      localStorage.setItem(RANK_KEY, k);
    } catch {}
  };
  const ranked = useMemo(
    () =>
      rankBranches(
        rows.map((r) => ({
          ...r,
          id: r.branch.id,
          sales: r.result.salesValue,
          profit: r.result.profit,
          margin: r.result.margin,
          fl: r.cost.fl.pct,
          target: r.branch.salesTarget || 0,
          days: r.result.days,
        })),
        by,
      ),
    [rows, by],
  );
  if (branches.length < 2) return null;
  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
  const shown = (v: number | null) =>
    v === null ? (by === "goal" ? t("rank.noTarget") : "–") : by === "sales" || by === "profit" ? bahtWhole(v) : by === "fl" ? `${v}%` : pct(v);

  const go = (id: string) => {
    setBranch(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section aria-labelledby="combined-title" className="grid gap-3">
      {/* All branches together */}
      <div className="workspace-panel hover-lift [--lift:1.006] grid gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 flex-none place-items-center rounded-full bg-foreground text-background" aria-hidden>
            <Layers className="size-5" />
          </span>
          <div className="grid gap-0.5">
            <h2 id="combined-title" className="text-lg font-semibold tracking-tight">
              {t("combined", { count: branches.length })}
            </h2>
            <p className="text-xs text-muted-foreground">{t("combinedHint")}</p>
          </div>
        </div>
        <Figures r={total} c={totalCost} big />
      </div>

      {/* Ranked on the figure picked here */}
      <div className="flex flex-wrap items-center gap-2 px-1 pt-1">
        <span className="text-xs font-medium text-muted-foreground">{t("rank.by")}</span>
        <div className="flex flex-wrap rounded-full bg-muted p-1" role="group" aria-label={t("rank.by")}>
          {RANK_BY.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={by === k}
              onClick={() => choose(k)}
              className={cn("h-10 rounded-full px-3.5 text-xs font-medium pointer-fine:h-8 pointer-fine:px-3", by === k ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}
            >
              {t(`rank.${k}`)}
            </button>
          ))}
        </div>
      </div>

      {/* One card per branch, best first */}
      <ul className="grid gap-3 sm:grid-cols-2">
        {ranked.map(({ row: { branch, result, cost }, rank, value }) => {
          const [fg] = BRANCH_COLORS[colorOf(branch, branches)];
          return (
            <li key={branch.id}>
              <button
                type="button"
                onClick={() => go(branch.id)}
                className="workspace-panel hover-lift [--lift:1.015] tap-row grid w-full gap-3 border-l-4 p-4 text-left"
                style={{ borderLeftColor: fg }}
                aria-label={`${branchLabel(branch, names)} — ${t("open")}`}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "grid size-8 flex-none place-items-center rounded-full text-sm font-bold tabular-nums",
                      rank === 1 ? "bg-brand text-white" : rank ? "bg-muted text-foreground" : "bg-muted text-muted-foreground",
                    )}
                    aria-label={rank ? t("rank.place", { n: rank }) : t("rank.none")}
                  >
                    {rank ?? "–"}
                  </span>
                  <BranchAvatar branch={branch} branches={branches} />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate text-[15px] font-semibold">{branchLabel(branch, names)}</span>
                    <span className="truncate text-xs text-muted-foreground tabular-nums">
                      {t(`rank.${by}`)} <b className={cn("font-semibold", rank === 1 ? "text-brand" : "text-foreground")}>{shown(value)}</b>
                    </span>
                  </span>
                  <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden />
                </span>
                <Figures r={result} c={cost} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const RANK_KEY = "trl.branch.rankBy";

const TONE = { ok: "text-ok", watch: "text-caution", near: "text-warn", over: "text-bad", none: undefined } as const;

function Figures({ r, c, big }: { r: MonthResult; c: CostControl; big?: boolean }) {
  const t = useTranslations("branch");
  const cell = (label: string, value: string, tone?: string) => (
    <span className="grid min-w-0 gap-0.5 rounded-2xl bg-muted/60 px-3 py-2">
      <span className="truncate text-[11px] text-muted-foreground">{label}</span>
      <span className={cn("truncate font-semibold tracking-tight tabular-nums", big ? "text-[clamp(1rem,4.4vw,1.25rem)]" : "text-[15px]", tone)}>{value}</span>
    </span>
  );
  return (
    <span className="grid grid-cols-2 gap-2">
      {cell(t("colSales"), r.days ? bahtWhole(r.salesValue) : "–")}
      {cell(t("colCost"), bahtWhole(r.purchasesCost))}
      {cell(t("colProfit"), r.days ? bahtWhole(r.profit) : "–", r.days ? (r.profit < 0 ? "text-bad" : "text-brand") : undefined)}
      {cell("FL / FLR", c.flr.pct === null ? "–" : `${c.fl.pct}% / ${c.flr.pct}%`, TONE[c.flr.level])}
    </span>
  );
}
