"use client";

// Payroll (admins only): pay run per month, employees, filings. Staff never see salaries or ID numbers — the database
// refuses them too (RLS).

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { monthDate } from "@/lib/archive";
import { useEmployees } from "@/lib/payroll-store";
import { useMe } from "@/lib/role-store";
import { todayBangkok } from "@/lib/thai-tax";
import { cn } from "@/lib/utils";
import { AttendanceTab } from "./AttendanceTab";
import { EmployeesTab } from "./EmployeesTab";
import { FilingTab } from "./FilingTab";
import { PayRunTab } from "./PayRunTab";

type Tab = "attendance" | "run" | "employees" | "filing";
const TABS: Tab[] = ["attendance", "run", "employees", "filing"];

export function PayrollPage() {
  const t = useTranslations("pay");
  const locale = useLocale();
  const me = useMe();
  const { employees, loaded } = useEmployees();
  const [tab, setTab] = useState<Tab | null>(null);
  const today = todayBangkok().slice(0, 7);
  const [month, setMonth] = useState(today);
  // A link can open the page at a month (/…?month=2026-08, from the closing checklist)
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("month");
    if (m && /^\d{4}-\d{2}$/.test(m)) setMonth(m);
  }, []);
  // This month and the 12 before it
  const months = useMemo(
    () => Array.from({ length: 13 }, (_, i) => new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1)).toISOString().slice(0, 7)),
    [today],
  );
  const long = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "UTC" });

  if (me.loaded && me.role !== "admin") return <p className="mx-auto mt-16 max-w-md text-center text-sm text-muted-foreground">{t("adminOnly")}</p>;
  const shown: Tab = tab ?? (loaded && employees.length === 0 ? "employees" : "run");

  return (
    <div className={cn("mx-auto grid w-full gap-5", shown === "attendance" ? "max-w-6xl" : shown === "run" ? "max-w-4xl" : "max-w-3xl")}>
      <header className="grid gap-1">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("title")}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("intro")}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-muted p-1" role="tablist" aria-label={t("title")}>
          {TABS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={shown === k}
              onClick={() => setTab(k)}
              className={cn("h-8 rounded-full px-3.5 text-sm", shown === k ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}
            >
              {t(`tab.${k}`)}
            </button>
          ))}
        </div>
        {shown !== "employees" && (
          <select className="h-10 rounded-full border bg-card px-3 text-sm" value={month} onChange={(e) => setMonth(e.target.value)} aria-label={t("month")}>
            {months.map((m) => (
              <option key={m} value={m}>
                {long.format(monthDate(m))}
              </option>
            ))}
          </select>
        )}
      </div>

      {shown === "attendance" && <AttendanceTab month={month} />}
      {shown === "run" && <PayRunTab month={month} />}
      {shown === "employees" && <EmployeesTab />}
      {shown === "filing" && <FilingTab month={month} />}
    </div>
  );
}
