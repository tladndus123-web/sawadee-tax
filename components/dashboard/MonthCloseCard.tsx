"use client";

// Admins: the month to close next (the oldest one before this month that is still open) and what is left in it —
// documents to look at, missing days of shop sales, staff pay to check. Each line opens the place to fix it; the
// month can be closed anyway (asks first, with what is left).

import { ChevronRight, CircleCheck, FileText, Store, Users, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { MonthLockButton } from "@/components/ledger/MonthLockButton";
import { useMonthLabel } from "@/components/ledger/Stickers";
import { Link } from "@/i18n/navigation";
import { monthKey } from "@/lib/archive";
import { useBranches } from "@/lib/branch-store";
import { useCompany } from "@/lib/company-store";
import { useLedger } from "@/lib/ledger-store";
import { closeTodo, monthToClose, openCount } from "@/lib/month-close";
import { useMonthLocks } from "@/lib/month-lock-store";
import { loadPayrollChecks, useEmployees } from "@/lib/payroll-store";
import { useSales } from "@/lib/sales-store";
import { todayBangkok } from "@/lib/thai-tax";
import { cn } from "@/lib/utils";
import { useFoldStatus } from "@/components/settings/SettingsFold";

export function MonthCloseCard() {
  const t = useTranslations("close");
  const monthLabel = useMonthLabel();
  const company = useCompany();
  // The whole company: a month is closed for every branch at once
  const { entries, loaded } = useLedger({ all: true });
  const { sales, loaded: salesLoaded } = useSales({ all: true });
  const { branches } = useBranches();
  const { employees, loaded: staffLoaded } = useEmployees();
  const locks = useMonthLocks();
  const today = todayBangkok();
  const locale = useLocale();
  const shortMonth = (m: string) => new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));

  const live = useMemo(() => entries.filter((e) => e.deletedAt === null), [entries]);
  const month = useMemo(() => monthToClose(live.map((e) => monthKey(e.doc)), sales, locks, today.slice(0, 7)), [live, sales, locks, today]);
  const [checked, setChecked] = useState<{ month: string; ids: Set<string> } | null>(null);
  useEffect(() => {
    if (!month) return;
    let on = true;
    loadPayrollChecks(month)
      .then((m) => on && setChecked({ month, ids: new Set(m.keys()) }))
      .catch(() => on && setChecked({ month, ids: new Set() }));
    return () => {
      on = false;
    };
  }, [month]);

  const todo = useMemo(
    () =>
      month && checked?.month === month
        ? closeTodo({ month, entries: live, companyTaxId: company.taxId, today, sales, branches, employees, payChecked: checked.ids })
        : null,
    [month, checked, live, company.taxId, today, sales, branches, employees],
  );
  const ready = !!month && !!todo && loaded && salesLoaded && staffLoaded;
  const left = todo ? openCount(todo) : 0;
  const label = month ? monthLabel(month) : "";
  // On the dashboard this card is a line of "할 일": the month and what is left show on the folded line
  useFoldStatus(ready && month ? `${shortMonth(month)} · ${left ? t("leftShort", { count: left }) : t("readyShort")}` : null, false, left ? "warn" : "ok");
  if (!ready || !month || !todo) return null;

  return (
    <section className="workspace-panel grid gap-3 p-4 sm:p-5" aria-labelledby="close-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-0.5">
          <h2 id="close-title" className="text-[15px] font-semibold">
            {t("title", { month: label })}
          </h2>
          <p className={cn("text-xs font-medium", left ? "text-warn" : "text-ok")}>{left ? t("left", { count: left }) : t("ready")}</p>
        </div>
        <MonthLockButton month={month} label={label} locked={false} primary={!left} note={left ? t("warn", { count: left }) : undefined} />
      </div>
      <ul className="grid gap-1.5">
        <Item icon={FileText} href="/ledger" count={todo.docs} text={t("docs", { count: todo.docs })} done={t("docsDone")} />
        <Item icon={Store} href={`/sales?month=${month}`} count={todo.missingDays} text={t("sales", { count: todo.missingDays })} done={t("salesDone")} />
        {todo.payroll && (
          <Item icon={Users} href={`/payroll?month=${month}`} count={todo.payroll.left} text={t("pay", { count: todo.payroll.left })} done={t("payDone")} />
        )}
      </ul>
    </section>
  );
}

function Item({ icon: Icon, href, count, text, done }: { icon: LucideIcon; href: string; count: number; text: string; done: string }) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "press flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm",
          count ? "bg-muted/60 font-medium hover:bg-muted" : "text-muted-foreground hover:bg-muted/60",
        )}
      >
        {count ? <Icon className="size-4 flex-none text-warn" aria-hidden /> : <CircleCheck className="size-4 flex-none text-ok" aria-hidden />}
        <span className="min-w-0 flex-1 truncate">{count ? text : done}</span>
        <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}
