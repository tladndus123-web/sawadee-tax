"use client";

// The combined board (all branches, when the company has several): the month for all together on top, then one
// card per branch with the same figures (sales, costs, profit, and FL / FLR against sales); tapping a card switches
// to that branch. Same arithmetic as the sales page (lib/branches branchSummaries → lib/sales monthResult) and the
// cost control card (lib/cost-control).

import { ChevronRight, Layers } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { BranchAvatar, useBranchName } from "@/components/layout/branch-switcher";
import { BRANCH_COLORS, branchLabel, branchSummaries, colorOf } from "@/lib/branches";
import { setBranch, useBranches } from "@/lib/branch-store";
import { useCategories } from "@/lib/category-store";
import { useCompany } from "@/lib/company-store";
import { type CostControl, costControl, targetsOf } from "@/lib/cost-control";
import { monthCosts } from "@/lib/cost-split";
import { pick, useLedger } from "@/lib/ledger-store";
import { baht } from "@/lib/money";
import type { MonthResult } from "@/lib/sales";
import { useSales } from "@/lib/sales-store";
import { cn } from "@/lib/utils";
import { useLabor } from "@/lib/labor-store";
import { fixedForMonth } from "@/lib/fixed-costs";
import { useFixedCosts } from "@/lib/fixed-store";

export function BranchTable({ month, companyTaxId }: { month: string; companyTaxId: string }) {
  const t = useTranslations("branch");
  const names = useBranchName();
  const { branches } = useBranches();
  const { entries } = useLedger({ all: true });
  const { sales } = useSales({ all: true });
  const { lines: labor } = useLabor({ all: true });
  const { lines: fixed } = useFixedCosts({ all: true });
  const company = useCompany();
  const { rows: categories } = useCategories();
  const { rows, total, totalCost } = useMemo(() => {
    const purchases = pick(entries, "ledger").map((e) => e.doc);
    const s = branchSummaries(branches, purchases, sales, month, companyTaxId, labor, fixed);
    const food = new Set(categories.filter((c) => c.foodCost).map((c) => c.key as string));
    const targets = targetsOf(company.costTargets);
    const cc = (salesValue: number, costs: Parameters<typeof costControl>[1], lab: number) => costControl(Math.round(salesValue * 100), costs, food, lab, targets);
    return {
      rows: s.rows.map((r) => ({ ...r, cost: cc(r.result.salesValue, r.costs, r.labor) })),
      total: s.total,
      totalCost: cc(s.total.salesValue, monthCosts(purchases, month, companyTaxId, fixedForMonth(fixed, month)), s.rows.reduce((a, r) => a + r.labor, 0)),
    };
  }, [branches, entries, sales, month, companyTaxId, labor, fixed, categories, company.costTargets]);
  if (branches.length < 2) return null;

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

      {/* One card per branch */}
      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map(({ branch, result, cost }) => {
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
                  <BranchAvatar branch={branch} branches={branches} />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate text-[15px] font-semibold">{branchLabel(branch, names)}</span>
                    <span className="mono text-[11px] text-muted-foreground">{branch.no}</span>
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
      {cell(t("colSales"), r.days ? baht(r.salesValue) : "–")}
      {cell(t("colCost"), baht(r.purchasesCost))}
      {cell(t("colProfit"), r.days ? baht(r.profit) : "–", r.days ? (r.profit < 0 ? "text-bad" : "text-brand") : undefined)}
      {cell("FL / FLR", c.flr.pct === null ? "–" : `${c.fl.pct}% / ${c.flr.pct}%`, TONE[c.flr.level])}
    </span>
  );
}
