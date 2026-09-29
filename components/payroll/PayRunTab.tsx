"use client";

// A month's payroll (admins): per employee, what happened in each half of the month (days, unpaid days off, overtime,
// holiday work, bonus, allowance, other deductions); the app works out pay, social security and withholding (taken
// from the month-end payment). Saving keeps the lines (payslips, filing lists) and puts each branch's labour cost into
// the cost control. The list shows each person's position, name, pay, deductions and take-home, and whether the office
// checked that saved pay (stamped who and when; new figures clear it).

import { CalendarCheck, Check, ChevronDown, CircleCheck, Loader2, Lock, Printer, Undo2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/invoice/fields";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { periodFromAttendance } from "@/lib/attendance";
import { loadAttendance } from "@/lib/attendance-store";
import { useCompany } from "@/lib/company-store";
import { refreshLabor } from "@/lib/labor-store";
import { fmt } from "@/lib/money";
import { isMonthLocked, useMonthLocks } from "@/lib/month-lock-store";
import { daysNotEmployed, type Employee, EMPTY_PERIOD, monthPay, payrollSettingsOf, type PeriodInput } from "@/lib/payroll";
import { loadPayroll, loadPayrollChecks, type PayrollCheck, savePayrollMonth, setPayrollCheck, useEmployees } from "@/lib/payroll-store";
import { cn } from "@/lib/utils";

// Row: the pay figures, then the office check (a column on a computer, a strip under the figures on a phone)
const ROW = "grid sm:grid-cols-[minmax(0,1fr)_12.5rem]";
const COLS = "grid-cols-[6rem_minmax(0,1fr)_5.75rem_5.75rem_6.25rem_1rem] items-center gap-x-3";

type Inputs = Record<string, { first: PeriodInput; second: PeriodInput }>;

const lastDay = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
/** Employed at some point in the month */
export const inMonth = (e: Employee, month: string) => (!e.startDate || e.startDate <= lastDay(month)) && (!e.endDate || e.endDate >= `${month}-01`);

export function PayRunTab({ month }: { month: string }) {
  const t = useTranslations("pay");
  const { employees, loaded } = useEmployees();
  const company = useCompany();
  const settings = useMemo(() => payrollSettingsOf(company.payrollSettings), [company.payrollSettings]);
  const locked = useMonthLocks().has(month);
  const [inputs, setInputs] = useState<Inputs>({});
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [checks, setChecks] = useState<Map<string, PayrollCheck>>(new Map());
  const [checking, setChecking] = useState<string | null>(null);
  const locale = useLocale();

  useEffect(() => {
    let live = true;
    setReady(false);
    // A failed check lookup must never hide the saved pay
    Promise.all([loadPayroll({ month }), loadPayrollChecks(month).catch(() => new Map<string, PayrollCheck>())])
      .then(([lines, found]) => {
        if (!live) return;
        const next: Inputs = {};
        for (const l of lines) {
          const row = (next[l.employeeId] ??= { first: EMPTY_PERIOD, second: EMPTY_PERIOD });
          const p: PeriodInput = { daysWorked: l.daysWorked, absentDays: l.absentDays, otHours: l.otHours, holidayHours: l.holidayHours, holidayOtHours: l.holidayOtHours, bonus: l.bonus, allowance: l.allowance, otherDeduction: l.otherDeduction };
          if (l.period === 1) row.first = p;
          else row.second = p;
        }
        setInputs(next);
        setSaved(new Set(lines.map((l) => l.employeeId)));
        setChecks(found);
        setDirty(false);
        setReady(true);
      })
      .catch(() => live && setReady(true));
    return () => void (live = false);
  }, [month]);

  const staff = useMemo(() => employees.filter((e) => inMonth(e, month) || saved.has(e.id)), [employees, month, saved]);
  // Not typed in yet: a monthly employee who joins or leaves during the month starts with those days as unpaid
  const rows = useMemo(() => {
    const out = new Map<string, { first: PeriodInput; second: PeriodInput }>();
    for (const e of staff) {
      const off = e.payType === "monthly" ? daysNotEmployed(e, month) : { first: 0, second: 0 };
      out.set(e.id, inputs[e.id] ?? { first: { ...EMPTY_PERIOD, absentDays: off.first }, second: { ...EMPTY_PERIOD, absentDays: off.second } });
    }
    return out;
  }, [staff, inputs, month]);
  const rowOf = (id: string) => rows.get(id) ?? { first: EMPTY_PERIOD, second: EMPTY_PERIOD };
  const pays = useMemo(() => new Map(staff.map((e) => [e.id, monthPay(e, rows.get(e.id)!.first, rows.get(e.id)!.second, settings)])), [staff, rows, settings]);
  const total = [...pays.values()].reduce(
    (a, m) => ({ gross: a.gross + m.gross, ss: a.ss + m.ssEmployee, er: a.er + m.ssEmployer, wht: a.wht + m.wht, net: a.net + m.netFirst + m.netSecond, cost: a.cost + m.employerCost }),
    { gross: 0, ss: 0, er: 0, wht: 0, net: 0, cost: 0 },
  );

  const set = (id: string, half: "first" | "second", k: keyof PeriodInput, v: number) => {
    setInputs((all) => ({ ...all, [id]: { ...rowOf(id), [half]: { ...rowOf(id)[half], [k]: Math.max(0, v || 0) } } }));
    setDirty(true);
  };

  // Days, absences and overtime from the attendance calendar; bonus, allowance and deductions stay as typed
  const [pulling, setPulling] = useState(false);
  const fromAttendance = async () => {
    setPulling(true);
    try {
      const rows = await loadAttendance({ month });
      if (!rows.length) return toast.info(t("noAttendance"));
      setInputs((all) => {
        const next = { ...all };
        for (const e of staff) {
          const p = periodFromAttendance(e, rows.filter((r) => r.employeeId === e.id), month);
          const cur = all[e.id] ?? { first: EMPTY_PERIOD, second: EMPTY_PERIOD };
          next[e.id] = {
            first: { ...cur.first, daysWorked: p.first.daysWorked, absentDays: p.first.absentDays, otHours: p.first.otHours, holidayHours: p.first.holidayHours, holidayOtHours: p.first.holidayOtHours },
            second: { ...cur.second, daysWorked: p.second.daysWorked, absentDays: p.second.absentDays, otHours: p.second.otHours, holidayHours: p.second.holidayHours, holidayOtHours: p.second.holidayOtHours },
          };
        }
        return next;
      });
      setDirty(true);
      toast.success(t("pulled"));
    } catch {
      toast.error(t("fail"));
    } finally {
      setPulling(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await savePayrollMonth(
        month,
        staff.map((e) => ({ employee: e, ...rowOf(e.id) })),
        settings,
      );
      await refreshLabor();
      setSaved(new Set(staff.map((e) => e.id)));
      // Changed figures lost their check in the database
      setChecks(await loadPayrollChecks(month).catch(() => new Map()));
      setDirty(false);
      toast.success(t("runSaved"));
    } catch (e) {
      toast.error(isMonthLocked(e) ? t("locked") : t("fail"));
    } finally {
      setBusy(false);
    }
  };

  // The office checks one person's saved pay (or undoes it); the database stamps who and when
  const toggleCheck = async (e: Employee, on: boolean) => {
    setChecking(e.id);
    try {
      await setPayrollCheck(e.id, month, on);
      setChecks(await loadPayrollChecks(month));
      if (on) toast.success(t("checkedDone", { name: e.name }), { action: { label: <Undo2 className="size-4" aria-label={t("uncheck")} />, onClick: () => void toggleCheck(e, false) } });
    } catch {
      toast.error(t("checkFail"));
    } finally {
      setChecking(null);
    }
  };
  const day = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" });
  const stamp = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const checkedCount = staff.filter((e) => checks.has(e.id)).length;

  if (!loaded || !ready || !company.loaded) return <Loader2 className="mx-auto my-10 size-5 animate-spin text-muted-foreground" aria-hidden />;
  if (staff.length === 0) return <p className="workspace-panel px-5 py-10 text-center text-sm text-muted-foreground">{t("noStaffThisMonth")}</p>;

  return (
    <div className="grid gap-3">
      {locked && (
        <p className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Lock className="size-4 flex-none" aria-hidden />
          {t("locked")}
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">{t("checkHint")}</p>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums", checkedCount === staff.length ? "bg-ok-soft text-ok" : "bg-muted text-muted-foreground")}>
          {t("checkedCount", { done: checkedCount, all: staff.length })}
        </span>
      </div>
      <div aria-hidden className={cn(ROW, "hidden px-0 text-[11px] font-medium text-muted-foreground sm:grid")}>
        <span className={cn(COLS, "grid px-4")}>
          <span>{t("position")}</span>
          <span>{t("name")}</span>
          <span className="text-right">{t("gross")}</span>
          <span className="text-right">{t("deducted")}</span>
          <span className="text-right">{t("net")}</span>
          <span />
        </span>
        <span className="px-3">{t("checkCol")}</span>
      </div>
      <ul className="grid gap-2">
        {staff.map((e) => {
          const m = pays.get(e.id)!;
          const net = m.netFirst + m.netSecond;
          const deducted = Math.round(m.gross * 100 - net * 100) / 100;
          const isOpen = open === e.id;
          const check = checks.get(e.id);
          const canCheck = saved.has(e.id) && !dirty;
          return (
            <li key={e.id} className={cn(ROW, "workspace-panel overflow-hidden p-0")}>
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.id)} className="press w-full px-4 py-3 text-left">
                {/* Phone: position over name, take-home on the right, pay and deductions below */}
                <span className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 sm:hidden">
                  <span className="grid min-w-0 gap-0.5">
                    {e.position && <span className="truncate text-xs text-muted-foreground">{e.position}</span>}
                    <span className="truncate text-[15px] font-semibold">{e.name}</span>
                  </span>
                  <span className="grid text-right">
                    <span className="text-[15px] font-semibold tabular-nums">{fmt(net)}</span>
                    <span className="text-[11px] text-muted-foreground">{t("net")}</span>
                  </span>
                  <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} aria-hidden />
                  <span className="col-span-3 mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
                    <span>
                      {t("gross")} {fmt(m.gross)}
                    </span>
                    <span>
                      {t("deducted")} {deducted ? fmt(-deducted) : fmt(0)}
                    </span>
                    {!saved.has(e.id) && <span className="text-warn">{t("notSaved")}</span>}
                  </span>
                </span>
                {/* Computer: one line under the column heads */}
                <span className={cn(COLS, "hidden sm:grid")}>
                  <span className="truncate text-sm text-muted-foreground">{e.position || "—"}</span>
                  <span className="grid min-w-0">
                    <span className="truncate text-[15px] font-semibold">{e.name}</span>
                    {!saved.has(e.id) && <span className="text-[11px] text-warn">{t("notSaved")}</span>}
                  </span>
                  <span className="text-right text-sm tabular-nums">{fmt(m.gross)}</span>
                  <span className="text-right text-sm text-muted-foreground tabular-nums">{deducted ? fmt(-deducted) : fmt(0)}</span>
                  <span className="text-right text-[15px] font-semibold tabular-nums">{fmt(net)}</span>
                  <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} aria-hidden />
                </span>
              </button>
              <div className="flex min-h-12 items-center gap-2 border-t border-border/60 px-4 py-2 sm:border-t-0 sm:border-l sm:px-3">
                <span className="text-xs text-muted-foreground sm:hidden">{t("checkCol")}</span>
                <span className="ml-auto flex min-w-0 items-center gap-2 sm:ml-0 sm:w-full">
                  {check ? (
                    <>
                      <CircleCheck className="size-4 flex-none text-ok" aria-hidden />
                      <span className="grid min-w-0 flex-1 leading-tight">
                        <span className="text-[13px] font-semibold text-ok">{t("checkedMark")}</span>
                        <span className="truncate text-[11px] text-muted-foreground" title={stamp.format(check.checkedAt)}>
                          {check.checkedBy ?? "—"} · {day.format(check.checkedAt)}
                        </span>
                      </span>
                      <Button type="button" variant="ghost" size="icon" className="size-8 flex-none rounded-full" disabled={checking !== null} aria-label={t("uncheck")} title={t("uncheck")} onClick={() => void toggleCheck(e, false)}>
                        {checking === e.id ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
                      </Button>
                    </>
                  ) : canCheck ? (
                    <Button type="button" variant="outline" className="h-8 rounded-full px-3 text-xs sm:w-full" disabled={checking !== null} onClick={() => void toggleCheck(e, true)}>
                      {checking === e.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                      {t("checkBtn")}
                    </Button>
                  ) : (
                    <span className="text-[11px] leading-tight text-muted-foreground">{t("checkAfterSave")}</span>
                  )}
                </span>
              </div>
              {isOpen && (
                <div className="sm:col-span-2">
                  <PeriodGrid employee={e} row={rowOf(e.id)} pay={m} disabled={locked} onSet={(half, k, v) => set(e.id, half, k, v)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <dl className="workspace-panel grid grid-cols-2 gap-x-4 gap-y-1.5 p-4 text-sm sm:grid-cols-3">
        {(
          [
            ["gross", total.gross],
            ["ssEmployee", total.ss],
            ["wht", total.wht],
            ["netTotal", total.net],
            ["ssEmployer", total.er],
            ["employerCost", total.cost],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="grid">
            <dt className="text-xs text-muted-foreground">{t(k)}</dt>
            <dd className={cn("tabular-nums", k === "employerCost" ? "text-[17px] font-semibold" : "font-medium")}>{fmt(v)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs leading-relaxed text-muted-foreground">{t("runHint")}</p>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {!locked && (
          <Button type="button" variant="secondary" className="rounded-full px-4" disabled={pulling} onClick={() => void fromAttendance()}>
            {pulling ? <Loader2 className="size-4 animate-spin" /> : <CalendarCheck className="size-4" />}
            {t("fromAttendance")}
          </Button>
        )}
        {saved.size > 0 && !dirty && (
          <Button asChild variant="secondary" className="rounded-full px-4">
            <Link href={`/payroll/print/slip/${month}`}>
              <Printer className="size-4" />
              {t("printSlips")}
            </Link>
          </Button>
        )}
        <Button type="button" className="rounded-full px-5" disabled={busy || locked} onClick={() => void save()}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {t("saveRun")}
        </Button>
      </div>
    </div>
  );
}

function PeriodGrid({
  employee: e,
  row,
  pay,
  disabled,
  onSet,
}: {
  employee: Employee;
  row: { first: PeriodInput; second: PeriodInput };
  pay: ReturnType<typeof monthPay>;
  disabled: boolean;
  onSet: (half: "first" | "second", k: keyof PeriodInput, v: number) => void;
}) {
  const t = useTranslations("pay");
  const fields: { k: keyof PeriodInput; label: string; kind: "qty" | "money" }[] = [
    e.payType === "daily" ? { k: "daysWorked", label: t("daysWorked"), kind: "qty" } : { k: "absentDays", label: t("absentDays"), kind: "qty" },
    { k: "otHours", label: t("otHours"), kind: "qty" },
    { k: "holidayHours", label: t("holidayHours"), kind: "qty" },
    { k: "holidayOtHours", label: t("holidayOtHours"), kind: "qty" },
    { k: "bonus", label: t("bonus"), kind: "money" },
    { k: "allowance", label: t("allowance"), kind: "money" },
    { k: "otherDeduction", label: t("otherDeduction"), kind: "money" },
  ];
  const line = "grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_9rem]";
  const out = (label: string, a: number | string, b: number | string, strong = false) => (
    <div className={cn(line, "text-sm", strong && "font-semibold")}>
      <span className={cn("truncate", !strong && "text-muted-foreground")}>{label}</span>
      <span className="text-right tabular-nums">{typeof a === "number" ? fmt(a) : a}</span>
      <span className="text-right tabular-nums">{typeof b === "number" ? fmt(b) : b}</span>
    </div>
  );
  return (
    <div className="grid gap-2 border-t border-border/60 bg-muted/30 px-4 py-3">
      <div className={cn(line, "text-[11px] font-medium text-muted-foreground")}>
        <span />
        <span className="text-right">{t("half1")}</span>
        <span className="text-right">{t("half2")}</span>
      </div>
      {fields.map((f) => (
        <label key={f.k} className={line}>
          <span className="text-[13px] leading-tight">{f.label}</span>
          {(["first", "second"] as const).map((h) => (
            <MoneyInput key={h} kind={f.kind} disabled={disabled} aria-label={`${f.label} ${t(h === "first" ? "half1" : "half2")}`} className="h-9 bg-background text-right" value={row[h][f.k]} onChange={(v) => onSet(h, f.k, v)} />
          ))}
        </label>
      ))}
      <div className="mt-1 grid gap-1 border-t border-border/60 pt-2">
        {out(t("gross"), pay.first.gross, pay.second.gross)}
        {out(t("ssEmployee"), "—", pay.ssEmployee ? -pay.ssEmployee : 0)}
        {out(t("wht"), "—", pay.wht ? -pay.wht : 0)}
        {(row.first.otherDeduction > 0 || row.second.otherDeduction > 0) && out(t("otherDeduction"), -row.first.otherDeduction, -row.second.otherDeduction)}
        {out(t("net"), pay.netFirst, pay.netSecond, true)}
      </div>
      {e.whtFixed !== null && <p className="text-[11px] text-muted-foreground">{t("whtFixedOn")}</p>}
    </div>
  );
}
