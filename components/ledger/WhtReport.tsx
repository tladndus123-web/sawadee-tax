"use client";

// Monthly withholding list → print / "Save as PDF", laid out like the ใบแนบ ภ.ง.ด.53 (companies) and ใบแนบ ภ.ง.ด.3
// (people) of the Revenue Department: the payer, the month paid, then per payment the payee's tax ID, branch,
// name and address, date paid, kind of income, rate, amount paid and tax withheld, and the condition
// (1 = หัก ณ ที่จ่าย). A withholding belongs to the month it was paid in. Due the 7th of the next month on
// paper, the 15th when filed online.

import { ChevronLeft, Loader2, Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { useCompany } from "@/lib/company-store";
import { exportLang } from "@/lib/export";
import { pick, useLedger } from "@/lib/ledger-store";
import { fmt } from "@/lib/money";
import { nextMonth } from "@/lib/month-lock-store";
import { digitsOnly, dmy } from "@/lib/thai-tax";
import type { Tri } from "@/lib/types";
import { buildWhtList, type WhtRow } from "@/lib/wht";
import { useMonthLabel } from "./Stickers";

/** Kind of income as the attachment writes it (Thai, the legal form) */
const TYPE_TH: Record<string, string> = {
  service: "ค่าบริการ",
  professional: "ค่าวิชาชีพอิสระ",
  contract: "ค่าจ้างทำของ",
  rent: "ค่าเช่า",
  advertising: "ค่าโฆษณา",
  transport: "ค่าขนส่ง",
  other: "อื่น ๆ",
  "": "ค่าบริการ",
};

const line = (t: Tri, lang: "th" | "en" | "ja") => t.th || t[lang] || t.en || t.ja;

export function WhtReport({ month }: { month: string }) {
  const t = useTranslations("whtList");
  const locale = useLocale();
  const lang = exportLang(locale);
  const company = useCompany();
  const { entries, loaded } = useLedger();
  const monthLabel = useMonthLabel();

  const docs = useMemo(() => pick(entries, "ledger").map((e) => ({ id: e.id, doc: e.doc })), [entries]);
  const list = useMemo(() => buildWhtList(docs, month), [docs, month]);
  // Our company as the invoices address it (the payer on these forms)
  const us = useMemo(() => {
    const id = digitsOnly(company.taxId);
    const d = [...docs].reverse().find((x) => id && digitsOnly(x.doc.customer.taxId) === id)?.doc.customer;
    return { taxId: id, name: d ? line(d.name, lang) : "", address: d ? line(d.address, lang) : "" };
  }, [docs, company.taxId, lang]);
  const due = nextMonth(month);

  useEffect(() => {
    const prev = document.title;
    document.title = `${t("title")} · ${monthLabel(month)}`;
    return () => void (document.title = prev);
  }, [t, monthLabel, month]);

  const pageCss = `@media print { @page { size: A4 landscape; margin: 12mm; @bottom-right { content: counter(page) " / " counter(pages); font-size: 8pt; color: #555; } } }`;
  const th = "px-1.5 py-1 text-left align-bottom font-semibold";
  const num = "px-1.5 py-1 text-right tabular-nums whitespace-nowrap";
  const cell = "px-1.5 py-1 align-top";

  const Section = ({ form, rows, total }: { form: "53" | "3"; rows: WhtRow[]; total: { paid: number; tax: number } }) => (
    <section className="grid gap-1.5 break-inside-avoid-page">
      <h2 className="text-[12px] font-semibold">
        ใบแนบ ภ.ง.ด.{form} <span className="font-normal text-neutral-500">· {t(form === "53" ? "form53" : "form3")}</span>
      </h2>
      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full min-w-[980px] border-collapse text-[10px] print:min-w-0">
          <thead>
            <tr className="border-y border-neutral-900">
              <th className={`${th} w-10 whitespace-nowrap`}>ลำดับที่</th>
              <th className={th}>เลขประจำตัวผู้เสียภาษีอากร</th>
              <th className={th}>สาขาที่</th>
              <th className={th}>{form === "53" ? "ชื่อและที่อยู่ผู้มีเงินได้" : "ชื่อ ชื่อสกุล และที่อยู่ผู้มีเงินได้"}</th>
              <th className={th}>วัน เดือน ปี ที่จ่าย</th>
              <th className={th}>ประเภทเงินได้พึงประเมินที่จ่าย</th>
              <th className={`${th} text-right`}>อัตราภาษีร้อยละ</th>
              <th className={`${th} text-right`}>{form === "53" ? "จำนวนเงินที่จ่ายในครั้งนี้" : "จำนวนเงินที่จ่ายแต่ละประเภท"}</th>
              <th className={`${th} text-right`}>จำนวนเงินภาษีที่หักและนำส่งในครั้งนี้</th>
              <th className={`${th} text-center`}>เงื่อนไข</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-b border-neutral-300">
                <td colSpan={10} className="px-2 py-3 text-center text-neutral-500">
                  {t("none")}
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.id} className="break-inside-avoid border-b border-neutral-300">
                  <td className={`${cell} tabular-nums`}>{i + 1}</td>
                  <td className={`${cell} mono whitespace-nowrap`}>{r.taxId || "—"}</td>
                  <td className={`${cell} mono`}>{r.branchNo || "—"}</td>
                  <td className={cell}>
                    <span className="block font-medium">{line(r.name, lang) || "—"}</span>
                    <span className="block text-neutral-600">{line(r.address, lang)}</span>
                  </td>
                  <td className={`${cell} tabular-nums whitespace-nowrap`}>{dmy(r.paidDate)}</td>
                  <td className={cell}>{TYPE_TH[r.type]}</td>
                  <td className={num}>{fmt(r.rate)}</td>
                  <td className={num}>{fmt(r.paid)}</td>
                  <td className={num}>{fmt(r.tax)}</td>
                  <td className={`${cell} text-center`}>1</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-b-2 border-double border-neutral-900 font-semibold">
              <td className="px-1.5 py-1.5" colSpan={7}>
                รวม · {t("count", { count: rows.length })}
              </td>
              <td className={num}>{fmt(total.paid)}</td>
              <td className={num}>{fmt(total.tax)}</td>
              <td />
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
            {t("back")}
          </Link>
        </Button>
        <Button type="button" className="rounded-full" onClick={() => window.print()} disabled={!loaded}>
          <Printer className="size-4" />
          {t("print")}
        </Button>
      </div>

      <article className="report-paper grid gap-4 border border-neutral-200 bg-white p-5 text-neutral-900 shadow-sm sm:p-10 print:border-0 print:p-0 print:shadow-none">
        <header className="grid gap-3">
          <div className="text-center">
            <h1 className="text-[18px] font-bold tracking-wide">รายการภาษีหัก ณ ที่จ่าย</h1>
            <p className="text-[12px] text-neutral-600">{t("title")} · {monthLabel(month)}</p>
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5 border-y border-neutral-900 py-2 text-[10.5px] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
            <dt className="font-semibold">ผู้มีหน้าที่หักภาษี ณ ที่จ่าย</dt>
            <dd>{us.name || "—"}</dd>
            <dt className="font-semibold">เดือนที่จ่ายเงินได้</dt>
            <dd className="font-semibold">{monthLabel(month)}</dd>
            <dt className="font-semibold">เลขประจำตัวผู้เสียภาษีอากร</dt>
            <dd className="mono">{us.taxId || "—"}</dd>
            <dt className="font-semibold">กำหนดยื่น</dt>
            <dd>
              {dmy(`${due}-07`)} · {t("online", { date: dmy(`${due}-15`) })}
            </dd>
            {us.address && (
              <>
                <dt className="font-semibold">ที่อยู่</dt>
                <dd className="sm:col-span-3">{us.address}</dd>
              </>
            )}
          </dl>
        </header>

        {!loaded ? (
          <Loader2 className="mx-auto size-6 animate-spin text-neutral-400" aria-label="Loading" />
        ) : (
          <>
            <Section form="53" rows={list.pnd53} total={list.totals.pnd53} />
            <Section form="3" rows={list.pnd3} total={list.totals.pnd3} />
            <p className="border-t border-neutral-300 pt-2 text-[9px] leading-relaxed text-neutral-500">{t("note")}</p>
          </>
        )}
      </article>
    </div>
  );
}
