"use client";

// Monthly sales tax report (รายงานภาษีขาย, s.87 + DG VAT Notification No.89) → "Save as PDF" in the print dialog.
// A retail shop reports its abbreviated tax invoices as one line per day with their number range; delivery apps get
// their own line per day. Header and columns in Thai (the legal form); black on white.

import { ChevronLeft, Loader2, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { monthDate } from "@/lib/archive";
import { ALL, byId } from "@/lib/branches";
import { useBranch, useBranches } from "@/lib/branch-store";
import { useCompany } from "@/lib/company-store";
import { pick, useLedger } from "@/lib/ledger-store";
import { fmt, fromSatang, toSatang } from "@/lib/money";
import { saleValue, salesReportRows } from "@/lib/sales";
import { useSales } from "@/lib/sales-store";
import { branchLabel, branchNo, digitsOnly, dmy, todayBangkok } from "@/lib/thai-tax";

const BUYER: Record<string, string> = {
  store: "ขายปลีก (ใบกำกับภาษีอย่างย่อ)",
  grab: "ขายผ่าน Grab",
  lineman: "ขายผ่าน LINE MAN",
  foodpanda: "ขายผ่าน foodpanda",
  shopee: "ขายผ่าน ShopeeFood",
  robinhood: "ขายผ่าน Robinhood",
  other: "ขายอื่น ๆ",
};

export function SalesReport({ month }: { month: string }) {
  const t = useTranslations();
  const company = useCompany();
  const { sales, loaded } = useSales();
  const { entries } = useLedger();
  const rows = useMemo(() => salesReportRows(sales, month), [sales, month]);

  // Our company as printed on the invoices addressed to it (newest first)
  // A chosen branch: its number goes on the report, whatever the invoices printed
  const working = useBranch();
  const { branches } = useBranches();
  const workingNo = working !== ALL ? byId(branches, working)?.no : undefined;
  const us = useMemo(() => {
    const id = digitsOnly(company.taxId);
    if (!id) return null;
    const d = pick(entries, "ledger")
      .map((e) => e.doc)
      .filter((x) => digitsOnly(x.customer.taxId) === id)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    return { taxId: id, name: d?.customer.name.th || d?.customer.name.en || "", branchNo: workingNo ?? branchNo(d?.customer.branch) };
  }, [entries, company.taxId, workingNo]);

  const sum = rows.reduce((a, r) => ({ value: a.value + toSatang(saleValue(r)), vat: a.vat + toSatang(r.vat), gross: a.gross + toSatang(r.gross) }), { value: 0, vat: 0, gross: 0 });
  // The form is Thai: Thai month name and Buddhist Era year (e.g. กันยายน 2569)
  const period = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(monthDate(month));

  useEffect(() => {
    const prev = document.title;
    document.title = `รายงานภาษีขาย · ${period}`;
    return () => void (document.title = prev);
  }, [period]);

  const pageCss = `@media print {
    @page { size: A4 landscape; margin: 14mm 12mm;
      @bottom-left { content: ${JSON.stringify(`รายงานภาษีขาย · ${period}`)}; font-size: 8pt; color: #555; }
      @bottom-right { content: counter(page) " / " counter(pages); font-size: 8pt; color: #555; } }
  }`;
  const head = "px-2 py-1 text-left align-bottom font-semibold";
  const num = "px-2 py-1 text-right tabular-nums whitespace-nowrap";
  const cell = "px-2 py-1 align-top";

  if (!loaded || !company.loaded) return <Loader2 className="mx-auto mt-20 size-6 animate-spin text-muted-foreground" aria-label="Loading" />;

  return (
    <div className="grid gap-4">
      <style>{pageCss}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="ghost" className="-ml-3 text-primary">
          <Link href="/sales">
            <ChevronLeft className="size-4" />
            {t("sales.title")}
          </Link>
        </Button>
        <Button type="button" className="rounded-full px-5" onClick={() => window.print()}>
          <Printer className="size-4" />
          {t("whtList.print")}
        </Button>
      </div>

      <article lang="th" className="mx-auto grid w-full max-w-[1100px] gap-4 bg-white p-8 text-[11px] leading-snug text-neutral-900 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="grid gap-2 text-center">
          <h1 className="text-[16px] font-bold">รายงานภาษีขาย</h1>
          <p>เดือนภาษี {period}</p>
        </header>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 sm:grid-cols-[auto_1fr_auto_1fr] print:grid-cols-[auto_1fr_auto_1fr] gap-y-1 border-y border-neutral-900 py-2">
          <dt className="font-semibold">ชื่อผู้ประกอบการ</dt>
          <dd>{us?.name || "………………………………"}</dd>
          <dt className="font-semibold">เลขประจำตัวผู้เสียภาษีอากร</dt>
          <dd className="tabular-nums">{company.taxId || "………………"}</dd>
          <dt className="font-semibold">ชื่อสถานประกอบการ</dt>
          <dd>{us?.name || "………………………………"}</dd>
          <dt className="font-semibold">สถานประกอบการ</dt>
          <dd>{us?.branchNo ? branchLabel(us.branchNo, "th") : "สำนักงานใหญ่"}</dd>
        </dl>

        <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full min-w-[900px] border-collapse print:min-w-0">
          <thead>
            <tr className="border-y border-neutral-900">
              <th className={`${head} w-10`}>ลำดับที่</th>
              <th className={head}>วัน เดือน ปี</th>
              <th className={head}>เลขที่ใบกำกับภาษี</th>
              <th className={head}>ชื่อผู้ซื้อสินค้า/ผู้รับบริการ</th>
              <th className={head}>เลขประจำตัวผู้เสียภาษีอากรของผู้ซื้อ</th>
              <th className={head}>สถานประกอบการ</th>
              <th className={`${head} text-right`}>มูลค่าสินค้าหรือบริการ</th>
              <th className={`${head} text-right`}>จำนวนเงินภาษีมูลค่าเพิ่ม</th>
              <th className={`${head} text-right`}>รวม</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-2 py-6 text-center text-neutral-500">
                  ไม่มีรายการ
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.id} className="border-b border-neutral-200">
                  <td className={`${cell} text-center`}>{i + 1}</td>
                  <td className={`${cell} whitespace-nowrap tabular-nums`}>{dmy(r.date)}</td>
                  <td className={`${cell} mono`}>{r.docFrom ? (r.docTo && r.docTo !== r.docFrom ? `${r.docFrom} – ${r.docTo}` : r.docFrom) : "—"}</td>
                  <td className={cell}>{company.channelNames?.[r.channel]?.trim() && r.channel !== "store" ? `ขายผ่าน ${company.channelNames[r.channel].trim()}` : BUYER[r.channel]}</td>
                  <td className={`${cell} text-center`}>—</td>
                  <td className={`${cell} text-center`}>—</td>
                  <td className={num}>{fmt(saleValue(r))}</td>
                  <td className={num}>{fmt(r.vat)}</td>
                  <td className={num}>{fmt(r.gross)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-y border-neutral-900 font-semibold">
              <td colSpan={6} className="px-2 py-1 text-right">
                รวมทั้งสิ้น ({rows.length} รายการ)
              </td>
              <td className={num}>{fmt(fromSatang(sum.value))}</td>
              <td className={num}>{fmt(fromSatang(sum.vat))}</td>
              <td className={num}>{fmt(fromSatang(sum.gross))}</td>
            </tr>
          </tfoot>
        </table>
        </div>
        <p className="text-[9px] text-neutral-500">
          ใบกำกับภาษีอย่างย่อสรุปรวมเป็นรายวันตามเลขที่ · จัดทำเมื่อ {dmy(todayBangkok())} · กรุณาตรวจสอบกับรายงานปิดยอดของเครื่อง POS ก่อนยื่นแบบ
        </p>
      </article>
    </div>
  );
}
