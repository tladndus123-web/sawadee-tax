"use client";

// The combined board (all branches, when the company has several): the month for all together on top, then one
// card per branch with the same four figures; tapping a card switches to that branch. Same arithmetic as the
// sales page (lib/branches branchSummaries → lib/sales monthResult).

import { ChevronRight, Layers } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { BranchAvatar, useBranchName } from "@/components/layout/branch-switcher";
import { BRANCH_COLORS, branchLabel, branchSummaries, colorOf } from "@/lib/branches";
import { setBranch, useBranches } from "@/lib/branch-store";
import { pick, useLedger } from "@/lib/ledger-store";
import { baht } from "@/lib/money";
import type { MonthResult } from "@/lib/sales";
import { useSales } from "@/lib/sales-store";
import { cn } from "@/lib/utils";

export function BranchTable({ month, companyTaxId }: { month: string; companyTaxId: string }) {
  const t = useTranslations("branch");
  const names = useBranchName();
  const { branches } = useBranches();
  const { entries } = useLedger({ all: true });
  const { sales } = useSales({ all: true });
  const { rows, total } = useMemo(
    () => branchSummaries(branches, pick(entries, "ledger").map((e) => e.doc), sales, month, companyTaxId),
    [branches, entries, sales, month, companyTaxId],
  );
  if (branches.length < 2) return null;

  const go = (id: string) => {
    setBranch(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section aria-labelledby="combined-title" className="grid gap-3">
      {/* All branches together */}
      <div className="workspace-panel grid gap-4 p-5 sm:p-6">
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
        <Figures r={total} big />
      </div>

      {/* One card per branch */}
      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map(({ branch, result }) => {
          const [fg] = BRANCH_COLORS[colorOf(branch, branches)];
          return (
            <li key={branch.id}>
              <button
                type="button"
                onClick={() => go(branch.id)}
                className="workspace-panel tap-row grid w-full gap-3 border-l-4 p-4 text-left"
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
                <Figures r={result} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Figures({ r, big }: { r: MonthResult; big?: boolean }) {
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
      {cell(t("colVat"), baht(r.vatPayable), r.vatPayable < 0 ? "text-ok" : undefined)}
    </span>
  );
}
