"use client";

// Printable payroll papers for a month → "Save as PDF" in the print dialog. Black on white, in Thai (the forms):
// - slip: payslips (ใบแจ้งเงินเดือน), one per page, Thai with English, from the lines as saved;
// - pnd1: the attachment list of ภ.ง.ด.1 (income under s.40(1), tax withheld) — copy into the e-Filing form;
// - sso: the employee list of สปส.1-10 (wages and contributions) — copy into the SSO e-Service form.
// Full ID numbers print here: they are what the forms need (admins only, like everything in payroll).

import { ChevronLeft, Loader2, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { ALLOWANCE_PRINT, rowsFromSaved } from "@/lib/allowances";
import { monthDate } from "@/lib/archive";
import { useCompany } from "@/lib/company-store";
import { fmt } from "@/lib/money";
import { type Employee, maskId, payrollDeadlines, payrollSettingsOf, periodPay, timesText } from "@/lib/payroll";
import { loadPayroll, type PayrollLineRow, useEmployees } from "@/lib/payroll-store";
import { useMe } from "@/lib/role-store";
import { branchLabel, dmy, todayBangkok } from "@/lib/thai-tax";
import { useOurCompany } from "./our-company";

export type PayForm = "slip" | "pnd1" | "sso";
const TITLE: Record<PayForm, string> = { slip: "ใบแจ้งเงินเดือน", pnd1: "ใบแนบ ภ.ง.ด.1", sso: "สปส.1-10 ส่วนที่ 2" };

interface Person {
  employee: Employee;
  first: PayrollLineRow | undefined;
  second: PayrollLineRow | undefined;
  gross: number;
  wages: number;
  ssEmployee: number;
  ssEmployer: number;
  wht: number;
  paidOn: string;
}

const add = (...v: number[]) => v.reduce((a, n) => a + Math.round((n || 0) * 100), 0) / 100;

export function PayrollPrint({ form, month }: { form: PayForm; month: string }) {
  const t = useTranslations("pay");
  const me = useMe();
  const us = useOurCompany();
  const company = useCompany();
  const settings = payrollSettingsOf(company.payrollSettings);
  const { employees, loaded } = useEmployees();
  const [lines, setLines] = useState<PayrollLineRow[] | null>(null);
  const [only, setOnly] = useState("");

  useEffect(() => {
    loadPayroll({ month })
      .then(setLines)
      .catch(() => setLines([]));
  }, [month]);

  const people = useMemo<Person[]>(() => {
    if (!lines) return [];
    return employees
      .map((employee) => {
        const mine = lines.filter((l) => l.employeeId === employee.id);
        if (!mine.length) return null;
        const first = mine.find((l) => l.period === 1);
        const second = mine.find((l) => l.period === 2);
        return {
          employee,
          first,
          second,
          gross: add(...mine.map((l) => l.gross)),
          wages: add(...mine.map((l) => l.gross - l.bonus - l.allowance)),
          ssEmployee: add(...mine.map((l) => l.ssEmployee)),
          ssEmployer: add(...mine.map((l) => l.ssEmployer)),
          wht: add(...mine.map((l) => l.wht)),
          paidOn: second?.paidOn || first?.paidOn || "",
        };
      })
      // Nothing paid this month (e.g. a daily worker with no days): not on the lists or payslips
      .filter((p): p is Person => !!p && p.gross > 0);
  }, [employees, lines]);

  const period = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(monthDate(month));
  const title = `${TITLE[form]} · ${period}`;
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => void (document.title = prev);
  }, [title]);

  if (!me.loaded || !loaded || !lines || !us.loaded) return <Loader2 className="mx-auto mt-20 size-6 animate-spin text-muted-foreground" aria-label="Loading" />;
  if (me.role !== "admin") return <p className="mx-auto mt-16 max-w-md text-center text-sm text-muted-foreground">{t("adminOnly")}</p>;

  const pageCss = `@media print {
    @page { size: A4 ${form === "slip" ? "portrait" : "landscape"}; margin: 14mm 12mm;
      ${form === "slip" ? "" : `@bottom-left { content: ${JSON.stringify(title)}; font-size: 8pt; color: #555; }`}
      @bottom-right { content: counter(page) " / " counter(pages); font-size: 8pt; color: #555; } }
  }`;
  const shown = form === "slip" && only ? people.filter((p) => p.employee.id === only) : people;

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
          {form === "slip" && people.length > 1 && (
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
        <p className="workspace-panel px-5 py-10 text-center text-sm text-muted-foreground">{t("nothingSaved")}</p>
      ) : form === "slip" ? (
        // A4 paper: phones scroll it sideways rather than squeeze it
        <div className="grid gap-4 overflow-x-auto print:block print:overflow-visible">
          {shown.map((p) => (
            <Slip key={p.employee.id} p={p} us={us} period={period} month={month} />
          ))}
        </div>
      ) : (
        <FilingList form={form} people={people} us={us} period={period} month={month} ssRate={settings.ssRate} ssAccount={settings.ssAccount} />
      )}
    </div>
  );
}

type Us = ReturnType<typeof useOurCompany>;

function Header({ us, children }: { us: Us; children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 sm:grid-cols-[auto_1fr_auto_1fr] print:grid-cols-[auto_1fr_auto_1fr] gap-y-1 border-y border-neutral-900 py-2">
      <dt className="font-semibold">ชื่อผู้มีหน้าที่หักภาษี / นายจ้าง</dt>
      <dd>{us.name || "………………………………"}</dd>
      <dt className="font-semibold">เลขประจำตัวผู้เสียภาษีอากร</dt>
      <dd className="tabular-nums">{us.taxId || "………………"}</dd>
      <dt className="font-semibold">สถานประกอบการ</dt>
      <dd>{us.branchNo ? branchLabel(us.branchNo, "th") : "สำนักงานใหญ่"}</dd>
      {children}
    </dl>
  );
}

function FilingList({
  form,
  people,
  us,
  period,
  month,
  ssRate,
  ssAccount,
}: {
  form: "pnd1" | "sso";
  people: Person[];
  us: Us;
  period: string;
  month: string;
  ssRate: number;
  ssAccount: string;
}) {
  const head = "px-2 py-1 text-left align-bottom font-semibold";
  const num = "px-2 py-1 text-right tabular-nums whitespace-nowrap";
  const cell = "px-2 py-1 align-top";
  const rows = form === "sso" ? people.filter((p) => p.ssEmployee > 0) : people;
  const due = payrollDeadlines(month);
  const sum = {
    gross: add(...rows.map((p) => p.gross)),
    wht: add(...rows.map((p) => p.wht)),
    wages: add(...rows.map((p) => p.wages)),
    ee: add(...rows.map((p) => p.ssEmployee)),
    er: add(...rows.map((p) => p.ssEmployer)),
  };
  return (
    <article lang="th" className="mx-auto grid w-full max-w-[1100px] gap-4 bg-white p-8 text-[11px] leading-snug text-neutral-900 shadow-sm print:max-w-none print:p-0 print:shadow-none">
      <header className="grid gap-1 text-center">
        <h1 className="text-[16px] font-bold">{form === "pnd1" ? "ใบแนบ ภ.ง.ด.1" : "แบบรายการแสดงการส่งเงินสมทบ (สปส.1-10 ส่วนที่ 2)"}</h1>
        <p>
          {form === "pnd1" ? "เงินได้ตามมาตรา 40 (1) เงินเดือน ค่าจ้าง ฯลฯ กรณีทั่วไป · " : "ค่าจ้างประจำเดือน "}
          {period}
        </p>
      </header>
      <Header us={us}>
        {form === "sso" ? (
          <>
            <dt className="font-semibold">เลขที่บัญชีนายจ้าง</dt>
            <dd className="tabular-nums">{ssAccount ? `${ssAccount.slice(0, 2)}-${ssAccount.slice(2, 9)}-${ssAccount.slice(9)}` : "………………………………"}</dd>
          </>
        ) : null}
      </Header>
      {form === "sso" && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          <div className="flex justify-between gap-2"><dt>จำนวนผู้ประกันตน</dt><dd className="tabular-nums">{rows.length} คน</dd></div>
          <div className="flex justify-between gap-2"><dt>อัตราเงินสมทบ</dt><dd className="tabular-nums">ร้อยละ {ssRate}</dd></div>
          <div className="flex justify-between gap-2"><dt>ค่าจ้างทั้งสิ้น</dt><dd className="tabular-nums">{fmt(sum.wages)}</dd></div>
          <div className="flex justify-between gap-2"><dt>เงินสมทบผู้ประกันตน</dt><dd className="tabular-nums">{fmt(sum.ee)}</dd></div>
          <div className="flex justify-between gap-2"><dt>เงินสมทบนายจ้าง</dt><dd className="tabular-nums">{fmt(sum.er)}</dd></div>
          <div className="flex justify-between gap-2 font-semibold"><dt>รวมเงินสมทบทั้งสิ้น</dt><dd className="tabular-nums">{fmt(add(sum.ee, sum.er))}</dd></div>
        </dl>
      )}
      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full min-w-[760px] border-collapse print:min-w-0">
          <thead>
            <tr className="border-y border-neutral-900">
              <th className={`${head} w-10`}>ลำดับที่</th>
              <th className={head}>{form === "pnd1" ? "เลขประจำตัวผู้เสียภาษีอากร" : "เลขประจำตัวประชาชน"}</th>
              <th className={head}>ชื่อ - ชื่อสกุล</th>
              {form === "pnd1" ? (
                <>
                  <th className={head}>วัน เดือน ปี ที่จ่าย</th>
                  <th className={`${head} text-right`}>จำนวนเงินได้ที่จ่าย</th>
                  <th className={`${head} text-right`}>จำนวนเงินภาษีที่หักและนำส่ง</th>
                  <th className={`${head} text-center`}>เงื่อนไข</th>
                </>
              ) : (
                <>
                  <th className={`${head} text-right`}>ค่าจ้างที่จ่ายจริง</th>
                  <th className={`${head} text-right`}>เงินสมทบผู้ประกันตน</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.employee.id} className="border-b border-neutral-200">
                <td className={`${cell} text-center`}>{i + 1}</td>
                <td className={`${cell} mono whitespace-nowrap`}>{p.employee.nationalId || "—"}</td>
                <td className={cell}>{p.employee.name}</td>
                {form === "pnd1" ? (
                  <>
                    <td className={`${cell} whitespace-nowrap tabular-nums`}>{dmy(p.paidOn)}</td>
                    <td className={num}>{fmt(p.gross)}</td>
                    <td className={num}>{fmt(p.wht)}</td>
                    <td className={`${cell} text-center`}>1</td>
                  </>
                ) : (
                  <>
                    <td className={num}>{fmt(p.wages)}</td>
                    <td className={num}>{fmt(p.ssEmployee)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-y border-neutral-900 font-semibold">
              <td colSpan={form === "pnd1" ? 4 : 3} className="px-2 py-1 text-right">
                รวม ({rows.length} ราย)
              </td>
              {form === "pnd1" ? (
                <>
                  <td className={num}>{fmt(sum.gross)}</td>
                  <td className={num}>{fmt(sum.wht)}</td>
                  <td />
                </>
              ) : (
                <>
                  <td className={num}>{fmt(sum.wages)}</td>
                  <td className={num}>{fmt(sum.ee)}</td>
                </>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[9px] text-neutral-500">
        {form === "pnd1"
          ? `เงื่อนไข 1 = หัก ณ ที่จ่าย · ยื่นภายใน ${dmy(due.pnd1Paper)} (กระดาษ) / ${dmy(due.due)} (อินเทอร์เน็ต)`
          : `ยื่นและชำระภายใน ${dmy(due.due)} · ค่าจ้างไม่รวมโบนัสและเบี้ยเลี้ยง`}
        {` · จัดทำเมื่อ ${dmy(todayBangkok())} · กรุณาตรวจสอบก่อนยื่นแบบ`}
      </p>
    </article>
  );
}

function Slip({ p, us, period, month }: { p: Person; us: Us; period: string; month: string }) {
  const e = p.employee;
  // With the multiples each line was paid with (a later change of the settings leaves the payslip alone)
  const halves = [p.first, p.second].map((l) => (l ? periodPay({ payType: l.payType, rate: l.rate }, l, l.rates) : null));
  const x = (p.second ?? p.first)?.rates;
  const rate = p.second?.rate ?? p.first?.rate ?? e.rate;
  const payType = p.second?.payType ?? p.first?.payType ?? e.payType;
  const en = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(monthDate(month));
  const num = "px-2 py-1 text-right tabular-nums whitespace-nowrap";
  const row = (th: string, eng: string, k: "base" | "overtime" | "holiday" | "holidayOvertime" | "bonus") => {
    const a = halves[0]?.[k] ?? 0;
    const b = halves[1]?.[k] ?? 0;
    if (!a && !b) return null;
    return (
      <tr key={k} className="border-b border-neutral-200">
        <td className="px-2 py-1">
          {th} <span className="text-neutral-500">/ {eng}</span>
        </td>
        <td className={num}>{fmt(a)}</td>
        <td className={num}>{fmt(b)}</td>
        <td className={num}>{fmt(add(a, b))}</td>
      </tr>
    );
  };
  const minus = (th: string, eng: string, a: number, b: number) =>
    a || b ? (
      <tr className="border-b border-neutral-200">
        <td className="px-2 py-1">
          {th} <span className="text-neutral-500">/ {eng}</span>
        </td>
        <td className={num}>{a ? `-${fmt(a)}` : "—"}</td>
        <td className={num}>{b ? `-${fmt(b)}` : "—"}</td>
        <td className={num}>-{fmt(add(a, b))}</td>
      </tr>
    ) : null;
  // One line per named allowance (a line saved before names existed shows its total as "other")
  const allowances = rowsFromSaved({ items: p.first?.allowances ?? [], total: p.first?.allowance ?? 0 }, { items: p.second?.allowances ?? [], total: p.second?.allowance ?? 0 });
  const net1 = p.first?.net ?? 0;
  const net2 = p.second?.net ?? 0;
  return (
    <article lang="th" className="mx-auto grid w-full max-w-[760px] min-w-[640px] gap-4 bg-white p-8 text-[12px] leading-snug text-neutral-900 shadow-sm break-after-page print:max-w-none print:min-w-0 print:p-0 print:shadow-none">
      <header className="flex items-start justify-between gap-4 border-b border-neutral-900 pb-3">
        <div className="grid gap-0.5">
          <p className="text-[15px] font-bold">{us.name || "………………………………"}</p>
          <p className="text-neutral-600">เลขประจำตัวผู้เสียภาษีอากร {us.taxId || "………………"}</p>
        </div>
        <div className="grid text-right">
          <h1 className="text-[16px] font-bold">ใบแจ้งเงินเดือน</h1>
          <p className="text-neutral-600">Payslip · {period} / {en}</p>
        </div>
      </header>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 sm:grid-cols-[auto_1fr_auto_1fr] print:grid-cols-[auto_1fr_auto_1fr] gap-y-1">
        <dt className="text-neutral-600">ชื่อ / Name</dt>
        <dd className="font-semibold">{e.name}</dd>
        <dt className="text-neutral-600">ตำแหน่ง / Position</dt>
        <dd>{e.position || "—"}</dd>
        <dt className="text-neutral-600">เลขประจำตัว / ID</dt>
        <dd className="mono">{maskId(e.nationalId) || "—"}</dd>
        <dt className="text-neutral-600">{payType === "monthly" ? "เงินเดือน / Salary" : "ค่าจ้างรายวัน / Day rate"}</dt>
        <dd className="tabular-nums">{fmt(rate)}</dd>
      </dl>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-neutral-900">
            <th className="px-2 py-1 text-left font-semibold">รายการ / Item</th>
            <th className="px-2 py-1 text-right font-semibold">1–15</th>
            <th className="px-2 py-1 text-right font-semibold">16–{new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()}</th>
            <th className="px-2 py-1 text-right font-semibold">รวม / Total</th>
          </tr>
        </thead>
        <tbody>
          {row(payType === "monthly" ? "เงินเดือน" : "ค่าจ้าง", payType === "monthly" ? "Salary" : "Wages", "base")}
          {row(`ค่าล่วงเวลา (${timesText(x?.ot ?? 1.5)} เท่า)`, "Overtime", "overtime")}
          {row(`ค่าทำงานในวันหยุด (${timesText(x?.holiday ?? (payType === "monthly" ? 1 : 2))} เท่า)`, "Holiday work", "holiday")}
          {row(`ค่าล่วงเวลาในวันหยุด (${timesText(x?.holidayOt ?? 3)} เท่า)`, "Holiday overtime", "holidayOvertime")}
          {row("โบนัส", "Bonus", "bonus")}
          {allowances.map((a, i) =>
            a.first || a.second ? (
              <tr key={`a${i}`} className="border-b border-neutral-200">
                <td className="px-2 py-1">
                  {a.key ? (
                    <>
                      {ALLOWANCE_PRINT[a.key].th} <span className="text-neutral-500">/ {ALLOWANCE_PRINT[a.key].en}</span>
                    </>
                  ) : (
                    a.name
                  )}
                </td>
                <td className={num}>{fmt(a.first)}</td>
                <td className={num}>{fmt(a.second)}</td>
                <td className={num}>{fmt(add(a.first, a.second))}</td>
              </tr>
            ) : null,
          )}
          <tr className="border-b border-neutral-900 font-semibold">
            <td className="px-2 py-1">รวมเงินได้ / Gross pay</td>
            <td className={num}>{fmt(p.first?.gross ?? 0)}</td>
            <td className={num}>{fmt(p.second?.gross ?? 0)}</td>
            <td className={num}>{fmt(p.gross)}</td>
          </tr>
          {minus("เงินสมทบประกันสังคม", "Social security", p.first?.ssEmployee ?? 0, p.second?.ssEmployee ?? 0)}
          {minus("ภาษีหัก ณ ที่จ่าย", "Income tax", p.first?.wht ?? 0, p.second?.wht ?? 0)}
          {minus("รายการหักอื่น ๆ", "Other deductions", p.first?.otherDeduction ?? 0, p.second?.otherDeduction ?? 0)}
        </tbody>
        <tfoot>
          <tr className="border-y-2 border-neutral-900 text-[13px] font-bold">
            <td className="px-2 py-1.5">เงินได้สุทธิ / Net pay</td>
            <td className={num}>{fmt(net1)}</td>
            <td className={num}>{fmt(net2)}</td>
            <td className={num}>{fmt(add(net1, net2))}</td>
          </tr>
          <tr className="text-neutral-600">
            <td className="px-2 py-1">วันที่จ่าย / Paid on</td>
            <td className={num}>{dmy(p.first?.paidOn)}</td>
            <td className={num}>{dmy(p.second?.paidOn)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      <div className="mt-8 grid grid-cols-2 gap-10 text-center">
        <p className="border-t border-neutral-400 pt-1">ผู้จ่ายเงิน / Employer</p>
        <p className="border-t border-neutral-400 pt-1">ผู้รับเงิน / Employee</p>
      </div>
    </article>
  );
}
