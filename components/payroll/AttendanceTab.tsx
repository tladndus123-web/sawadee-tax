"use client";

// Attendance calendar (admins): one row per employee, one column per day of the month; a tap on a day opens a small
// sheet (worked / day off / absent / annual / sick, overtime hours). Phones scroll it sideways with the names pinned.
// Under it, each person's leave for the year. The pay run reads its inputs from here ("from attendance").

import { CalendarCheck, Loader2, Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/invoice/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ATTENDANCE_KINDS, type AttendanceKind, type AttendanceRow, daysOfMonth, leaveBalance } from "@/lib/attendance";
import { fillWorked, loadAttendance, saveAttendance } from "@/lib/attendance-store";
import { isMonthLocked, useMonthLocks } from "@/lib/month-lock-store";
import { useCompany } from "@/lib/company-store";
import { type Employee, payrollSettingsOf, timesText } from "@/lib/payroll";
import { useBranchEmployees } from "@/lib/payroll-store";
import { THAI_HOLIDAYS } from "@/lib/thai-holidays";
import { todayBangkok } from "@/lib/thai-tax";
import { cn } from "@/lib/utils";
import { inMonth } from "./PayRunTab";

const CELL: Record<AttendanceKind, string> = {
  work: "bg-ok/15 text-ok",
  off: "bg-muted text-muted-foreground",
  absent: "bg-bad/15 text-bad",
  annual: "bg-brand-soft text-brand",
  sick: "bg-warn/15 text-warn",
};

export function AttendanceTab({ month }: { month: string }) {
  const t = useTranslations("pay");
  const locale = useLocale();
  const { employees, loaded } = useBranchEmployees();
  const locked = useMonthLocks().has(month);
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);
  const [yearRows, setYearRows] = useState<AttendanceRow[]>([]);
  const [open, setOpen] = useState<{ employee: Employee; day: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const today = todayBangkok();
  const year = Number(month.slice(0, 4));

  const reload = async () => {
    const [m, y] = await Promise.all([loadAttendance({ month }), loadAttendance({ year })]);
    setRows(m);
    setYearRows(y);
  };
  useEffect(() => {
    setRows(null);
    void loadAttendance({ month })
      .then(setRows)
      .catch(() => setRows([]));
    void loadAttendance({ year })
      .then(setYearRows)
      .catch(() => undefined);
  }, [month, year]);

  const staff = useMemo(() => employees.filter((e) => inMonth(e, month)), [employees, month]);
  const days = useMemo(() => daysOfMonth(month), [month]);
  const cellOf = useMemo(() => new Map((rows ?? []).map((r) => [`${r.employeeId}|${r.day}`, r])), [rows]);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" });
  const isWeekend = (d: string) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());

  const fill = async (e: Employee) => {
    setBusy(e.id);
    try {
      const unmarked = days.filter((d) => !cellOf.has(`${e.id}|${d}`) && (!e.startDate || d >= e.startDate) && (!e.endDate || d <= e.endDate));
      await fillWorked(e.id, unmarked);
      await reload();
      toast.success(t("filled", { count: unmarked.length }));
    } catch (err) {
      toast.error(isMonthLocked(err) ? t("locked") : t("fail"));
    } finally {
      setBusy(null);
    }
  };

  if (!loaded || !rows) return <Loader2 className="mx-auto my-10 size-5 animate-spin text-muted-foreground" aria-hidden />;
  if (staff.length === 0) return <p className="workspace-panel px-5 py-10 text-center text-sm text-muted-foreground">{t("noStaffThisMonth")}</p>;

  return (
    <div className="grid gap-3">
      {locked && (
        <p className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Lock className="size-4 flex-none" aria-hidden />
          {t("locked")}
        </p>
      )}
      <div className="workspace-panel overflow-x-auto p-0">
        <table className="w-max min-w-full border-separate border-spacing-0 text-[12px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-semibold">{t("employee")}</th>
              {days.map((d) => (
                <th key={d} className={cn("min-w-10 px-[3px] py-1.5 text-center font-medium", THAI_HOLIDAYS.has(d) ? "text-bad" : isWeekend(d) ? "text-muted-foreground" : "", d === today && "underline underline-offset-4")}>
                  <span className="block leading-none">{Number(d.slice(8))}</span>
                  <span className="block text-[10px] leading-none text-muted-foreground">{weekday.format(new Date(`${d}T00:00:00Z`))}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((e) => (
              <tr key={e.id} className="border-t border-border/60">
                <th scope="row" className="sticky left-0 z-10 w-[8.5rem] max-w-[8.5rem] bg-card px-3 py-1.5 text-left font-medium">
                  <span className="block truncate">{e.nickname || e.name}</span>
                  {!locked && (
                    <Button type="button" variant="ghost" className="-ml-2 mt-0.5 h-9 rounded-full px-2 text-[11px] font-medium text-primary" disabled={busy === e.id} onClick={() => void fill(e)}>
                      {busy === e.id ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarCheck className="size-3.5" />}
                      {t("fillWorked")}
                    </Button>
                  )}
                </th>
                {days.map((d) => {
                  const r = cellOf.get(`${e.id}|${d}`);
                  const out = (e.startDate && d < e.startDate) || (e.endDate && d > e.endDate);
                  return (
                    <td key={d} className="p-[3px]">
                      <button
                        type="button"
                        disabled={locked || !!out}
                        aria-label={`${e.name} ${d}`}
                        onClick={() => setOpen({ employee: e, day: d })}
                        className={cn("press grid h-10 w-10 place-items-center rounded-xl text-[12px] font-semibold leading-none disabled:opacity-40", r ? CELL[r.kind] : "bg-muted/40 text-muted-foreground/60")}
                      >
                        {r ? t(`kindShort.${r.kind}`) : out ? "" : "·"}
                        {r && r.otHours > 0 && <span className="text-[9px] font-normal">+{r.otHours}</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {ATTENDANCE_KINDS.map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className={cn("grid size-4 place-items-center rounded text-[9px] font-semibold", CELL[k])}>{t(`kindShort.${k}`)}</span>
            {t(`kind.${k}`)}
          </span>
        ))}
        <span>{t("legendHint")}</span>
      </p>

      {/* Leave this year */}
      <div className="workspace-panel hover-lift [--lift:1.006] grid gap-2 p-4">
        <p className="text-sm font-semibold">{t("leaveTitle", { year })}</p>
        <ul className="grid gap-1 text-sm">
          {staff.map((e) => {
            const b = leaveBalance(e, yearRows.filter((r) => r.employeeId === e.id), year);
            return (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="truncate font-medium">{e.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {b.annualEntitled ? t("annualLeft", { used: b.annualUsed, left: Math.max(0, b.annualEntitled - b.annualUsed) }) : t("annualNotYet")} · {t("sickUsed", { used: b.sickUsed, max: b.sickEntitled })}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] leading-snug text-muted-foreground">{t("leaveHint")}</p>
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        {open && (
          <DaySheet
            employee={open.employee}
            day={open.day}
            current={cellOf.get(`${open.employee.id}|${open.day}`) ?? null}
            onDone={async (changed) => {
              setOpen(null);
              if (changed) await reload();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function DaySheet({ employee, day, current, onDone }: { employee: Employee; day: string; current: AttendanceRow | null; onDone: (changed: boolean) => void }) {
  const t = useTranslations("pay");
  const locale = useLocale();
  const [kind, setKind] = useState<AttendanceKind>(current?.kind ?? "work");
  const [ot, setOt] = useState(current?.otHours ?? 0);
  const rates = payrollSettingsOf(useCompany().payrollSettings).ot;
  const [busy, setBusy] = useState(false);
  const dayText = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
  const holiday = THAI_HOLIDAYS.has(day);

  const save = async (clear = false) => {
    setBusy(true);
    try {
      await saveAttendance(employee.id, day, clear ? null : { kind, otHours: kind === "work" ? ot : 0 });
      onDone(true);
    } catch (e) {
      toast.error(isMonthLocked(e) ? t("locked") : t("fail"));
      setBusy(false);
    }
  };

  return (
    <DialogContent className="rounded-3xl sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{employee.name}</DialogTitle>
        <DialogDescription>
          {dayText}
          {holiday && <span className="ml-2 text-bad">{t("publicHoliday")}</span>}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-3 gap-2">
        {ATTENDANCE_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={cn("press h-11 rounded-2xl text-sm font-medium ring-1 ring-foreground/10", kind === k ? cn(CELL[k], "ring-2 ring-current") : "bg-background")}
          >
            {t(`kind.${k}`)}
          </button>
        ))}
      </div>
      {kind === "work" && (
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{holiday ? t("otHoursHoliday", { rate: timesText(rates.holidayOt) }) : t("otHoursDay", { rate: timesText(rates.ot) })}</span>
          <MoneyInput kind="qty" className="h-10 bg-background text-right" value={ot} onChange={(v) => setOt(Math.max(0, Math.min(24, Number(v) || 0)))} />
        </label>
      )}
      <div className="flex items-center justify-between gap-2">
        {current ? (
          <Button type="button" variant="ghost" className="rounded-full text-muted-foreground" disabled={busy} onClick={() => void save(true)}>
            {t("clearDay")}
          </Button>
        ) : (
          <span />
        )}
        <Button type="button" className="rounded-full px-5" disabled={busy} onClick={() => void save()}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {t("save")}
        </Button>
      </div>
    </DialogContent>
  );
}
