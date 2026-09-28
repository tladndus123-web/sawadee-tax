"use client";

// Yearly payroll papers → "Save as PDF" in the print dialog (Thai, black on white):
// - pnd1a: the attachment list of ภ.ง.ด.1ก (the year's income and tax withheld per employee), filed by the end of
//   February — copy into the e-Filing form;
// - cert50: หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ), one per employee, given to them by 15 February for their own
//   tax return. Income under s.40(1); the social security paid is listed too (they may deduct it).
// From the payroll lines as saved (lib/payroll-store), so the figures match the monthly filings.

import { ChevronLeft, Loader2, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { bahtText } from "@/lib/baht-text";
import { fmt } from "@/lib/money";
import { annualDeadlines, type Employee } from "@/lib/payroll";
import { loadPayroll, type PayrollLineRow, useEmployees } from "@/lib/payroll-store";
import { useMe } from "@/lib/role-store";
import { branchLabel, dmy, todayBangkok } from "@/lib/thai-tax";
import { useOurCompany } from "./our-company";

export type YearForm = "pnd1a" | "cert50";
const TITLE: Record<YearForm, string> = { pnd1a: "ใบแนบ ภ.ง.ด.1ก", cert50: "หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)" };

interface Person {
  employee: Employee;
  gross: number;
  wht: number;
  ss: number;
  months: number;
}

const add = (...v: number[]) => v.reduce((a, n) => a + Math.round((n || 0) * 100), 0) / 100;

export function YearPrint({ form, year }: { form: YearForm; year: string }) {
  const t = useTranslations("pay");
  const me = useMe();
  const us = useOurCompany();
  const { employees, loaded } = useEmployees();
  const [lines, setLines] = useState<PayrollLineRow[] | null>(null);
  const [only, setOnly] = useState("");
  useEffect(() => {
    loadPayroll({ year })
      .then(setLines)
      .catch(() => setLines([]));
  }, [year]);

  const people = useMemo<Person[]>(() => {
    if (!lines) return [];
    return employees
      .map((employee) => {
        const mine = lines.filter((l) => l.employeeId === employee.id);
        const gross = add(...mine.map((l) => l.gross));
        if (!mine.length || gross <= 0) return null;
        return { employee, gross, wht: add(...mine.map((l) => l.wht)), ss: add(...mine.map((l) => l.ssEmployee)), months: new Set(mine.map((l) => l.month)).size };
      })
      .filter((p): p is Person => !!p);
  }, [employees, lines]);

  const be = Number(year) + 543;
  const title = `${TITLE[form]} · ${be}`;
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => void (document.title = prev);
  }, [title]);

  if (!me.loaded || !loaded || !lines || !us.loaded) return <Loader2 className="mx-auto mt-20 size-6 animate-spin text-muted-foreground" aria-label="Loading" />;
  if (me.role !== "admin") return <p className="mx-auto mt-16 max-w-md text-center text-sm text-muted-foreground">{t("adminOnly")}</p>;

  const pageCss = `@media print {
    @page { size: A4 ${form === "cert50" ? "portrait" : "landscape"}; margin: 14mm 12mm;
      ${form === "cert50" ? "" : `@bottom-left { content: ${JSON.stringify(title)}; font-size: 8pt; color: #555; }`}
      @bottom-right { content: counter(page) " / " counter(pages); font-size: 8pt; color: #555; } }
  }`;
  const shown = form === "cert50" && only ? people.filter((p) => p.employee.id === only) : people;

  return (
    <div className="grid gap-4">
      <style>{pageCss}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="ghost" className="-ml-3 text-primary">
          <Link href="/payroll">
            <ChevronLeft className="size-4" />
            {t("title")}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {form === "cert50" && people.length > 1 && (
            <select className="h-10 rounded-full border bg-card px-3 text-sm" value={only} onChange={(e) => setOnly(e.target.value)} aria-label={t("whichSlip")}>
              <option value="">{t("allSlips", { n: people.length })}</option>
              {people.map((p) => (
                <option key={p.employee.id} value={p.employee.id}>
                  {p.employee.name}
                </option>
              ))}
            </select>
          )}
          <Button type="button" className="rounded-full px-5" disabled={!people.length} onClick={() => window.print()}>
            <Printer className="size-4" />
            {t("print")}
          </Button>
        </div>
      </div>

      {people.length === 0 ? (
        <p className="workspace-panel px-5 py-10 text-center text-sm text-muted-foreground">{t("nothingSavedYear", { year })}</p>
      ) : form === "pnd1a" ? (
        <Pnd1a people={people} us={us} year={year} />
      ) : (
        <div className="grid gap-4 overflow-x-auto print:block print:overflow-visible">
          {shown.map((p) => (
            <Cert50 key={p.employee.id} p={p} us={us} year={year} />
          ))}
        </div>
      )}
    </div>
  );
}

type Us = ReturnType<typeof useOurCompany>;

function Pnd1a({ people, us, year }: { people: Person[]; us: Us; year: string }) {
  const head = "px-2 py-1 text-left align-bottom font-semibold";
  const num = "px-2 py-1 text-right tabular-nums whitespace-nowrap";
  const cell = "px-2 py-1 align-top";
  const due = annualDeadlines(Number(year));
  return (
    <article lang="th" className="mx-auto grid w-full max-w-[1100px] gap-4 bg-white p-8 text-[11px] leading-snug text-neutral-900 shadow-sm print:max-w-none print:p-0 print:shadow-none">
      <header className="grid gap-1 text-center">
        <h1 className="text-[16px] font-bold">ใบแนบ ภ.ง.ด.1ก</h1>
        <p>สรุปการจ่ายเงินได้ตามมาตรา 40 (1) และภาษีที่หักไว้ ประจำปีภาษี {Number(year) + 543}</p>
      </header>
      <dl className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-4 gap-y-1 border-y border-neutral-900 py-2">
        <dt className="font-semibold">ชื่อผู้มีหน้าที่หักภาษี</dt>
        <dd>{us.name || "………………………………"}</dd>
        <dt className="font-semibold">เลขประจำตัวผู้เสียภาษีอากร</dt>
        <dd className="tabular-nums">{us.taxId || "………………"}</dd>
        <dt className="font-semibold">สถานประกอบการ</dt>
        <dd>{us.branchNo ? branchLabel(us.branchNo, "th") : "สำนักงานใหญ่"}</dd>
      </dl>
      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full min-w-[760px] border-collapse print:min-w-0">
          <thead>
            <tr className="border-y border-neutral-900">
              <th className={`${head} w-10`}>ลำดับที่</th>
              <th className={head}>เลขประจำตัวผู้เสียภาษีอากร</th>
              <th className={head}>ชื่อ - ชื่อสกุล</th>
              <th className={`${head} text-right`}>จำนวนเดือน</th>
              <th className={`${head} text-right`}>เงินได้ทั้งปี</th>
              <th className={`${head} text-right`}>ภาษีที่หักและนำส่ง</th>
              <th className={`${head} text-center`}>เงื่อนไข</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p, i) => (
              <tr key={p.employee.id} className="border-b border-neutral-200">
                <td className={`${cell} text-center`}>{i + 1}</td>
                <td className={`${cell} mono whitespace-nowrap`}>{p.employee.nationalId || "—"}</td>
                <td className={cell}>{p.employee.name}</td>
                <td className={num}>{p.months}</td>
                <td className={num}>{fmt(p.gross)}</td>
                <td className={num}>{fmt(p.wht)}</td>
                <td className={`${cell} text-center`}>1</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-y border-neutral-900 font-semibold">
              <td colSpan={4} className="px-2 py-1 text-right">
                รวม ({people.length} ราย)
              </td>
              <td className={num}>{fmt(add(...people.map((p) => p.gross)))}</td>
              <td className={num}>{fmt(add(...people.map((p) => p.wht)))}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[9px] text-neutral-500">
        เงื่อนไข 1 = หัก ณ ที่จ่าย · ยื่นภายใน {dmy(due.pnd1a)} · จัดทำเมื่อ {dmy(todayBangkok())} · กรุณาตรวจสอบกับ ภ.ง.ด.1 รายเดือนก่อนยื่นแบบ
      </p>
    </article>
  );
}

function Cert50({ p, us, year }: { p: Person; us: Us; year: string }) {
  const e = p.employee;
  const be = Number(year) + 543;
  const num = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";
  const party = (title: string, name: string, id: string, address: string) => (
    <section className="grid gap-1 rounded border border-neutral-900 p-3">
      <p className="font-bold">{title}</p>
      <p>
        ชื่อ <span className="font-semibold">{name || "………………………………"}</span>
      </p>
      <p>
        เลขประจำตัวผู้เสียภาษีอากร <span className="mono tabular-nums">{id || "………………"}</span>
      </p>
      <p>ที่อยู่ {address || "………………………………………………"}</p>
    </section>
  );
  return (
    <article lang="th" className="mx-auto grid w-full max-w-[760px] min-w-[640px] gap-4 bg-white p-8 text-[12px] leading-snug text-neutral-900 shadow-sm break-after-page print:max-w-none print:min-w-0 print:p-0 print:shadow-none">
      <header className="grid gap-1 text-center">
        <h1 className="text-[15px] font-bold">หนังสือรับรองการหักภาษี ณ ที่จ่าย</h1>
        <p>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร · ปีภาษี {be}</p>
      </header>
      {party("ผู้มีหน้าที่หักภาษี ณ ที่จ่าย", us.name, us.taxId, us.address)}
      {party("ผู้ถูกหักภาษี ณ ที่จ่าย", e.name, e.nationalId, e.address)}
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-neutral-900">
            <th className="px-2 py-1.5 text-left font-semibold">ประเภทเงินได้พึงประเมินที่จ่าย</th>
            <th className="px-2 py-1.5 text-right font-semibold">วัน เดือน ปี ที่จ่าย</th>
            <th className="px-2 py-1.5 text-right font-semibold">จำนวนเงินที่จ่าย</th>
            <th className="px-2 py-1.5 text-right font-semibold">ภาษีที่หักและนำส่งไว้</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-neutral-200">
            <td className="px-2 py-1.5">1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)</td>
            <td className={num}>ปี {be}</td>
            <td className={num}>{fmt(p.gross)}</td>
            <td className={num}>{fmt(p.wht)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr className="border-y border-neutral-900 font-semibold">
            <td colSpan={2} className="px-2 py-1.5 text-right">
              รวมเงินที่จ่ายและภาษีที่หักนำส่ง
            </td>
            <td className={num}>{fmt(p.gross)}</td>
            <td className={num}>{fmt(p.wht)}</td>
          </tr>
          <tr>
            <td colSpan={4} className="px-2 py-1.5">
              รวมเงินภาษีที่หักนำส่ง (ตัวอักษร) <span className="font-semibold">{bahtText(p.wht)}</span>
            </td>
          </tr>
        </tfoot>
      </table>
      <p>
        เงินที่จ่ายเข้ากองทุนประกันสังคม <span className="font-semibold tabular-nums">{fmt(p.ss)}</span> บาท
      </p>
      <p>
        ผู้จ่ายเงิน <span className="font-semibold">☑</span> หัก ณ ที่จ่าย ☐ ออกให้ตลอดไป ☐ ออกให้ครั้งเดียว
      </p>
      <p className="text-[11px] text-neutral-700">ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</p>
      <div className="mt-6 grid grid-cols-2 gap-10 text-center">
        <p className="border-t border-neutral-400 pt-1">ลงชื่อ ผู้จ่ายเงิน</p>
        <p className="border-t border-neutral-400 pt-1">
          วันที่ {dmy(todayBangkok())}
        </p>
      </div>
    </article>
  );
}
