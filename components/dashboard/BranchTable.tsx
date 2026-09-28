"use client";

// All branches side by side for the month (shown when the company has several and the person is looking at all):
// sales without VAT, cost, profit and the VAT to pay — the same arithmetic as the sales page (lib/sales).

import { Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useBranchName } from "@/components/layout/branch-switcher";
import { branchLabel } from "@/lib/branches";
import { setBranch, useBranches } from "@/lib/branch-store";
import { useLedger } from "@/lib/ledger-store";
import { fmt } from "@/lib/money";
import { pick } from "@/lib/ledger-store";
import { monthResult } from "@/lib/sales";
import { useSales } from "@/lib/sales-store";
import { cn } from "@/lib/utils";

export function BranchTable({ month, companyTaxId }: { month: string; companyTaxId: string }) {
  const t = useTranslations("branch");
  const names = useBranchName();
  const { branches } = useBranches();
  const { entries } = useLedger({ all: true });
  const { sales } = useSales({ all: true });
  const rows = useMemo(() => {
    const docs = pick(entries, "ledger").map((e) => e.doc);
    return branches.map((b) => ({
      b,
      r: monthResult(
        sales.filter((s) => s.branchId === b.id),
        docs.filter((d) => d.branchId === b.id),
        month,
        companyTaxId,
      ),
    }));
  }, [branches, entries, sales, month, companyTaxId]);
  if (branches.length < 2) return null;
  const total = rows.reduce(
    (a, { r }) => ({ salesValue: a.salesValue + r.salesValue, purchasesCost: a.purchasesCost + r.purchasesCost, profit: a.profit + r.profit, vatPayable: a.vatPayable + r.vatPayable }),
    { salesValue: 0, purchasesCost: 0, profit: 0, vatPayable: 0 },
  );
  const cell = "px-3 py-2.5 text-right whitespace-nowrap tabular-nums";
  return (
    <section aria-labelledby="branch-table" className="workspace-panel overflow-hidden p-0">
      <div className="grid gap-0.5 px-5 pt-5 pb-3">
        <h2 id="branch-table" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Store className="size-5 text-brand" aria-hidden />
          {t("table")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("tableHint")}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-y bg-muted/40 text-xs text-muted-foreground">
              <th className="sticky left-0 bg-muted/40 px-5 py-2 text-left font-medium">{t("label")}</th>
              <th className={`${cell} font-medium`}>{t("colSales")}</th>
              <th className={`${cell} font-medium`}>{t("colCost")}</th>
              <th className={`${cell} font-medium`}>{t("colProfit")}</th>
              <th className={`${cell} font-medium`}>{t("colVat")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ b, r }) => (
              <tr key={b.id} className="border-b border-border/60">
                <th scope="row" className="sticky left-0 bg-card px-5 py-2.5 text-left font-medium whitespace-nowrap">
                  <button type="button" onClick={() => setBranch(b.id)} className="hover:underline">
                    {branchLabel(b, names)}
                  </button>
                </th>
                <td className={cell}>{r.days ? fmt(r.salesValue) : "–"}</td>
                <td className={cell}>{fmt(r.purchasesCost)}</td>
                <td className={cn(cell, "font-semibold", r.days && (r.profit < 0 ? "text-bad" : "text-brand"))}>{r.days ? fmt(r.profit) : "–"}</td>
                <td className={cn(cell, r.vatPayable < 0 && "text-ok")}>{fmt(r.vatPayable)}</td>
              </tr>
            ))}
            <tr className="bg-muted/40 font-semibold">
              <th scope="row" className="sticky left-0 bg-muted/40 px-5 py-2.5 text-left">
                {t("all")}
              </th>
              <td className={cell}>{fmt(total.salesValue)}</td>
              <td className={cell}>{fmt(total.purchasesCost)}</td>
              <td className={cn(cell, total.profit < 0 ? "text-bad" : "text-brand")}>{fmt(total.profit)}</td>
              <td className={cell}>{fmt(total.vatPayable)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
