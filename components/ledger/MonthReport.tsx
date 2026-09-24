"use client";

// Printable monthly report → "Save as PDF" in the browser's print dialog. Printing (not a PDF library)
// because the browser shapes Thai script correctly; PDF libraries commonly break Thai vowels and tone marks.

import { ChevronLeft, Loader2, Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { AppMark } from "@/components/layout/app-mark";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { monthKey } from "@/lib/archive";
import { useCompany } from "@/lib/company-store";
import { buildMonthExport, exportLang } from "@/lib/export";
import { pick, useLedger } from "@/lib/ledger-store";
import { fmt } from "@/lib/money";
import { dmy, todayBangkok } from "@/lib/thai-tax";
import { useMonthLabel } from "./Stickers";

export function MonthReport({ month }: { month: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const params = useSearchParams();
  const company = useCompany();
  const { entries, loaded } = useLedger();
  const monthLabel = useMonthLabel();
  const printed = useRef(false);

  const data = useMemo(
    () =>
      buildMonthExport(
        pick(entries, "ledger")
          .filter((e) => monthKey(e.doc) === month)
          .map((e) => ({ doc: e.doc })),
        locale,
        company.taxId,
      ),
    [entries, month, locale, company.taxId],
  );
  const thai = exportLang(locale) !== "th";
  const title = t("export.reportTitle", { month: monthLabel(month) });

  // Opened from the PDF button: go straight to the print dialog once the data and fonts are ready
  useEffect(() => {
    if (!loaded || !company.loaded || printed.current || params.get("print") !== "1") return;
    printed.current = true;
    void document.fonts.ready.then(() => setTimeout(() => window.print(), 300));
  }, [loaded, company.loaded, params]);

  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · ${t("app.appName")}`;
    return () => void (document.title = prev);
  }, [title, t]);

  const money = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";
  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      {/* Landscape A4 for this page only */}
      <style>{`@media print { @page { size: A4 landscape; margin: 10mm; } }`}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="ghost" className="-ml-3 rounded-full text-primary">
          <Link href="/ledger">
            <ChevronLeft className="size-4" />
            {t("export.back")}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">{t("export.printHint")}</span>
          <Button type="button" className="rounded-full" onClick={() => window.print()} disabled={!loaded}>
            <Printer className="size-4" />
            {t("export.print")}
          </Button>
        </div>
      </div>

      <article className="report-paper grid gap-6 rounded-[1.375rem] bg-card p-6 text-[12.5px] shadow-[var(--shadow-soft)] sm:p-8 print:rounded-none print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            <AppMark className="size-10" />
            <div>
              <p className="text-xs text-muted-foreground">{t("app.appName")}</p>
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            </div>
          </div>
          <div className="grid text-right text-xs text-muted-foreground">
            <span>{t("export.generated", { date: dmy(todayBangkok()) })}</span>
            {company.taxId && (
              <span>
                {t("export.company")} <span className="mono">{company.taxId}</span>
              </span>
            )}
          </div>
        </header>

        {!loaded ? (
          <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" aria-label="Loading" />
        ) : data.rows.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">{t("export.empty")}</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 print:grid-cols-6">
              {(
                [
                  ["count", t("export.count", { count: data.totals.count })],
                  ["taxable", fmt(data.totals.taxable)],
                  ["vat", fmt(data.totals.vat)],
                  ["net", fmt(data.totals.net)],
                  ["claimableVat", fmt(data.totals.claimableVat)],
                  ["unpaid", fmt(data.totals.unpaid)],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-muted/60 px-3 py-2">
                  <dt className="text-[11px] text-muted-foreground">{k === "count" ? t("export.total") : t(`export.${k}`)}</dt>
                  <dd className="text-[15px] font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>

            {/* Wide table scrolls on its own on phones; prints in full */}
            <div className="-mx-2 overflow-x-auto px-2 print:overflow-visible">
            <table className="w-full min-w-[760px] border-collapse print:min-w-0">
              <thead>
                <tr className="border-b-2 text-left text-[11px] text-muted-foreground">
                  <th className="px-2 py-1.5 font-medium">#</th>
                  <th className="px-2 py-1.5 font-medium">{t("export.date")}</th>
                  <th className="px-2 py-1.5 font-medium">{t("export.docNo")}</th>
                  <th className="px-2 py-1.5 font-medium">{t("export.vendor")}</th>
                  <th className="px-2 py-1.5 font-medium">{t("export.taxId")}</th>
                  <th className="px-2 py-1.5 font-medium">{t("export.category")}</th>
                  <th className={`${money} font-medium`}>{t("export.taxable")}</th>
                  <th className={`${money} font-medium`}>{t("export.vat")}</th>
                  <th className={`${money} font-medium`}>{t("export.net")}</th>
                  <th className="px-2 py-1.5 text-center font-medium">{t("export.paid")}</th>
                  <th className="px-2 py-1.5 text-center font-medium">{t("export.claimable")}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={`${r.docNo}-${i}`} className="border-b border-border/60 align-top break-inside-avoid">
                    <td className="px-2 py-1.5 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{dmy(r.date)}</td>
                    <td className="mono px-2 py-1.5">{r.docNo}</td>
                    <td className="px-2 py-1.5">
                      <span className="block font-medium">{r.vendor}</span>
                      {thai && r.vendorTh && r.vendorTh !== r.vendor && (
                        <span lang="th" className="block text-[11px] text-muted-foreground">
                          {r.vendorTh}
                        </span>
                      )}
                    </td>
                    <td className="mono px-2 py-1.5 whitespace-nowrap">{r.taxId}</td>
                    <td className="px-2 py-1.5">{t(`category.${r.category}`)}</td>
                    <td className={money}>{fmt(r.taxable)}</td>
                    <td className={money}>{fmt(r.vat)}</td>
                    <td className={`${money} font-semibold`}>{fmt(r.net)}</td>
                    <td className="px-2 py-1.5 text-center">{r.paid ? "✓" : "—"}</td>
                    <td className="px-2 py-1.5 text-center">{r.claimable ? "✓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td className="px-2 py-2" colSpan={6}>
                    {t("export.total")} · {t("export.count", { count: data.totals.count })}
                  </td>
                  <td className={money}>{fmt(data.totals.taxable)}</td>
                  <td className={money}>{fmt(data.totals.vat)}</td>
                  <td className={money}>{fmt(data.totals.net)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{t("app.foot")}</p>
          </>
        )}
      </article>
    </div>
  );
}
