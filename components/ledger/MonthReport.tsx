"use client";

// Monthly input tax report → "Save as PDF" in the browser's print dialog. Printing (not a PDF library)
// because the browser shapes Thai script correctly; PDF libraries commonly break Thai vowels and tone marks.
// Laid out like the Thai รายงานภาษีซื้อ: taxpayer block, tax month, claimable tax invoices with
// value and VAT, the other purchases apart, a summary, sign-off lines and page numbers. Plain black on
// white: it is a document, not a screen.

import { ChevronLeft, Loader2, Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { monthKey } from "@/lib/archive";
import { useCompany } from "@/lib/company-store";
import { buildMonthExport, type ExportRow, exportLang } from "@/lib/export";
import { pick, useLedger } from "@/lib/ledger-store";
import { fmt, fromSatang, toSatang } from "@/lib/money";
import { branchLabel, branchNo, digitsOnly, dmy, todayBangkok } from "@/lib/thai-tax";
import type { LedgerDoc } from "@/lib/types";
import th from "@/messages/th.json";
import { useMonthLabel } from "./Stickers";

type ReportKey = keyof typeof th.report;

interface Sum {
  count: number;
  value: number;
  vat: number;
  total: number;
}
const sumOf = (rows: ExportRow[]): Sum => {
  const s = rows.reduce(
    (a, r) => ({ value: a.value + toSatang(r.taxable) + toSatang(r.exempt), vat: a.vat + toSatang(r.vat), total: a.total + toSatang(r.net) }),
    { value: 0, vat: 0, total: 0 },
  );
  return { count: rows.length, value: fromSatang(s.value), vat: fromSatang(s.vat), total: fromSatang(s.total) };
};

export function MonthReport({ month }: { month: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const params = useSearchParams();
  const company = useCompany();
  const { entries, loaded } = useLedger();
  const monthLabel = useMonthLabel();
  const printed = useRef(false);
  const lang = exportLang(locale);
  const showThai = locale !== "th";

  const docs = useMemo(() => pick(entries, "ledger").filter((e) => monthKey(e.doc) === month).map((e) => e.doc), [entries, month]);
  const data = useMemo(() => buildMonthExport(docs.map((doc) => ({ doc })), locale, company.taxId), [docs, locale, company.taxId]);
  const claim = data.rows.filter((r) => r.claimable);
  const other = data.rows.filter((r) => !r.claimable);
  const claimSum = sumOf(claim);
  const otherSum = sumOf(other);
  const allSum = sumOf(data.rows);

  // Our company as printed on the invoices addressed to it (the buyer block), latest first
  const us = useMemo(() => {
    const id = digitsOnly(company.taxId);
    if (!id) return null;
    const d = [...docs].reverse().find((x: LedgerDoc) => digitsOnly(x.customer.taxId) === id);
    const c = d?.customer;
    const in_ = (v?: { th: string; en: string; ja: string }) => (v ? v[lang] || v.en || v.th : "");
    return { taxId: id, name: in_(c?.name), nameTh: c?.name.th ?? "", branchNo: branchNo(c?.branch), branch: in_(c?.branch), address: in_(c?.address) };
  }, [docs, company.taxId, lang]);

  const title = t("report.title");
  const period = monthLabel(month);

  // Opened from the PDF button: go straight to the print dialog once the data and fonts are ready
  useEffect(() => {
    if (!loaded || !company.loaded || printed.current || params.get("print") !== "1") return;
    printed.current = true;
    void document.fonts.ready.then(() => setTimeout(() => window.print(), 300));
  }, [loaded, company.loaded, params]);

  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · ${period}`;
    return () => void (document.title = prev);
  }, [title, period]);

  /** Column / field label in the screen language, with the Thai wording underneath (Thai is the legal form) */
  const L = ({ k, className }: { k: ReportKey; className?: string }) => (
    <span className={className}>
      {t(`report.${k}`)}
      {showThai && (
        <span lang="th" className="block text-[8.5px] font-normal leading-tight text-neutral-500">
          {th.report[k]}
        </span>
      )}
    </span>
  );

  // Every page repeats who and which tax month (the table header repeats by itself)
  const running = [us?.nameTh || us?.name, company.taxId && `${th.report.taxId} ${company.taxId}`, `${th.report.period} ${period}`].filter(Boolean).join("  ·  ");
  const pageCss = `@media print {
    @page {
      size: A4 landscape;
      margin: 14mm 12mm 14mm;
      @top-left { content: ${JSON.stringify(running)}; font-size: 8pt; color: #555; }
      @bottom-left { content: ${JSON.stringify(`${title} · ${period}`)}; font-size: 8pt; color: #555; }
      @bottom-right { content: counter(page) " / " counter(pages); font-size: 8pt; color: #555; }
    }
  }`;

  const num = "px-2 py-1 text-right tabular-nums whitespace-nowrap";
  const cell = "px-2 py-1 align-top";
  const head = "px-2 py-1 text-left align-bottom font-semibold whitespace-nowrap";

  const Section = ({ rows, sum, k, hint }: { rows: ExportRow[]; sum: Sum; k: ReportKey; hint?: string }) => (
    <section className="grid gap-1.5">
      <h2 className="text-[12px] font-semibold">
        <L k={k} />
      </h2>
      {hint && <p className="text-[9.5px] text-neutral-500">{hint}</p>}
      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full min-w-[900px] border-collapse text-[10.5px] print:min-w-0">
          <thead>
            <tr className="border-y border-neutral-900">
              <th className={`${head} w-10`}>
                <L k="no" />
              </th>
              <th className={`${head} w-20`}>
                <L k="date" />
              </th>
              <th className={head}>
                <L k="docNo" />
              </th>
              <th className={head}>
                <L k="seller" />
              </th>
              <th className={head}>
                <L k="sellerTaxId" />
              </th>
              <th className={head}>
                <L k="branch" />
              </th>
              <th className={head}>
                <L k="docType" />
              </th>
              <th className={`${head} text-right`}>
                <L k="value" />
              </th>
              <th className={`${head} text-right`}>
                <L k="vat" />
              </th>
              <th className={`${head} text-right`}>
                <L k="total" />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-b border-neutral-300">
                <td colSpan={10} className="px-2 py-3 text-center text-neutral-500">
                  {t("report.none")}
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.docNo}-${i}`} className="break-inside-avoid border-b border-neutral-300">
                  <td className={`${cell} tabular-nums`}>{i + 1}</td>
                  <td className={`${cell} tabular-nums whitespace-nowrap`}>{dmy(r.date)}</td>
                  <td className={`${cell} mono whitespace-nowrap`}>{r.docNo || "—"}</td>
                  <td className={cell}>
                    {r.vendor}
                    {showThai && r.vendorTh && r.vendorTh !== r.vendor && (
                      <span lang="th" className="block text-[9.5px] text-neutral-500">
                        {r.vendorTh}
                      </span>
                    )}
                  </td>
                  <td className={`${cell} mono whitespace-nowrap`}>{r.taxId || "—"}</td>
                  <td className={`${cell} whitespace-nowrap`}>
                    {branchLabel(r.branchNo, lang) || r.branch || "—"}
                    {showThai && r.branchNo && (
                      <span lang="th" className="block text-[9.5px] text-neutral-500">
                        {branchLabel(r.branchNo, "th")}
                      </span>
                    )}
                  </td>
                  <td className={cell}>{t(`docType.${r.docType}`)}</td>
                  <td className={num}>{fmt(r.taxable + r.exempt)}</td>
                  <td className={num}>{fmt(r.vat)}</td>
                  <td className={num}>{fmt(r.net)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-b-2 border-double border-neutral-900 font-semibold">
              <td className="px-2 py-1.5" colSpan={7}>
                {t("report.subtotal")} · {t("report.count", { count: sum.count })}
              </td>
              <td className={num}>{fmt(sum.value)}</td>
              <td className={num}>{fmt(sum.vat)}</td>
              <td className={num}>{fmt(sum.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );

  return (
    <div className="mx-auto grid max-w-[1180px] gap-4">
      <style>{pageCss}</style>
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

      {/* The paper stays white in dark mode too: it is what will be printed */}
      <article className="report-paper grid gap-4 border border-neutral-200 bg-white p-5 text-neutral-900 shadow-sm sm:p-10 print:border-0 print:p-0 print:shadow-none">
        <header className="grid gap-3">
          <div className="text-center">
            <h1 className="text-[18px] font-bold tracking-wide">{title}</h1>
            {showThai && (
              <p lang="th" className="text-[12px] text-neutral-600">
                {th.report.title}
              </p>
            )}
          </div>

          <div className="grid gap-x-8 gap-y-2 border-y border-neutral-900 py-2 text-[10.5px] sm:grid-cols-[minmax(0,1fr)_auto] print:grid-cols-[minmax(0,1fr)_auto]">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5">
              <dt className="font-semibold">
                <L k="company" />
              </dt>
              <dd>
                {us?.name || "—"}
                {showThai && us?.nameTh && us.nameTh !== us.name && (
                  <span lang="th" className="block text-neutral-500">
                    {us.nameTh}
                  </span>
                )}
              </dd>
              <dt className="font-semibold">
                <L k="taxId" />
              </dt>
              <dd className="mono">{company.taxId || "—"}</dd>
              <dt className="font-semibold">
                <L k="branch" />
              </dt>
              <dd>
                {us?.branchNo ? branchLabel(us.branchNo, lang) : us?.branch || t("report.headOffice")}
                {showThai && us?.branchNo && (
                  <span lang="th" className="block text-neutral-500">
                    {branchLabel(us.branchNo, "th")}
                  </span>
                )}
              </dd>
              {us?.address && (
                <>
                  <dt className="font-semibold">
                    <L k="address" />
                  </dt>
                  <dd>{us.address}</dd>
                </>
              )}
            </dl>
            <dl className="grid grid-cols-[auto_auto] content-start gap-x-4 gap-y-1">
              <dt className="font-semibold">
                <L k="period" />
              </dt>
              <dd className="text-[12px] font-semibold">{period}</dd>
              <dt className="font-semibold">
                <L k="generated" />
              </dt>
              <dd className="tabular-nums">{dmy(todayBangkok())}</dd>
            </dl>
          </div>
          {!company.taxId && company.loaded && <p className="text-[10px] text-neutral-600 print:hidden">{t("report.companyMissing")}</p>}
        </header>

        {!loaded ? (
          <Loader2 className="mx-auto size-6 animate-spin text-neutral-400" aria-label="Loading" />
        ) : data.rows.length === 0 ? (
          <p className="py-10 text-center text-neutral-500">{t("export.empty")}</p>
        ) : (
          <>
            <Section rows={claim} sum={claimSum} k="sectionClaim" />
            {other.length > 0 && <Section rows={other} sum={otherSum} k="sectionOther" hint={t("report.otherHint")} />}

            <div className="grid items-start gap-8 break-inside-avoid sm:grid-cols-[minmax(0,1fr)_minmax(0,380px)] print:grid-cols-[minmax(0,1fr)_380px]">
              {/* Sign-off */}
              <div className="grid grid-cols-3 gap-6 self-end text-[10px]">
                {(["preparedBy", "checkedBy", "approvedBy"] as const).map((k) => (
                  <div key={k} className="grid gap-2">
                    <div className="h-9 border-b border-neutral-900" />
                    <div className="grid gap-1">
                      <L k={k} className="font-semibold" />
                      <span className="flex gap-1 text-neutral-600">
                        {t("report.signDate")}
                        <span className="flex-1 border-b border-dotted border-neutral-500" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <table className="w-full border-collapse text-[10.5px]">
                <caption className="pb-1.5 text-left text-[12px] font-semibold">
                  <L k="summary" />
                </caption>
                <thead>
                  <tr className="border-y border-neutral-900">
                    <th className="px-2 py-1 text-left font-semibold" />
                    <th className="px-2 py-1 text-right font-semibold">{t("report.value")}</th>
                    <th className="px-2 py-1 text-right font-semibold">{t("report.vat")}</th>
                    <th className="px-2 py-1 text-right font-semibold">{t("report.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["sectionClaim", claimSum],
                      ["sectionOther", otherSum],
                    ] as const
                  ).map(([k, s]) => (
                    <tr key={k} className="border-b border-neutral-300">
                      <th scope="row" className="px-2 py-1 text-left font-normal">
                        {t(`report.${k}`).replace(/\s*[(（].*$/, "")} <span className="text-neutral-500">({t("report.count", { count: s.count })})</span>
                      </th>
                      <td className="px-2 py-1 text-right tabular-nums">{fmt(s.value)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmt(s.vat)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmt(s.total)}</td>
                    </tr>
                  ))}
                  <tr className="border-b-2 border-double border-neutral-900 font-semibold">
                    <th scope="row" className="px-2 py-1 text-left">
                      {t("report.grand")} <span className="font-normal text-neutral-500">({t("report.count", { count: allSum.count })})</span>
                    </th>
                    <td className="px-2 py-1 text-right tabular-nums">{fmt(allSum.value)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{fmt(allSum.vat)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{fmt(allSum.total)}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-2 pt-2 text-left font-normal">
                      {t("report.unpaid")}
                    </th>
                    <td colSpan={3} className="px-2 pt-2 text-right tabular-nums">
                      {fmt(data.totals.unpaid)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="border-t border-neutral-300 pt-2 text-[9px] leading-relaxed text-neutral-500">{t("report.note")}</p>
          </>
        )}
      </article>
    </div>
  );
}
