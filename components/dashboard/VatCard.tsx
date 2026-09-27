"use client";

import { CalendarClock, CircleCheck, FileText, ListChecks, Lock, TriangleAlert } from "lucide-react";
import { useScreenDate } from "@/components/ScreenDate";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { MonthLockButton } from "@/components/ledger/MonthLockButton";
import { useMonthLabel } from "@/components/ledger/Stickers";
import { Link } from "@/i18n/navigation";
import { monthKey } from "@/lib/archive";
import { summarize, vatFiling } from "@/lib/dashboard";
import { type LedgerEntry, pick } from "@/lib/ledger-store";
import { baht } from "@/lib/money";
import { useMonthLocks } from "@/lib/month-lock-store";
import { useMe } from "@/lib/role-store";
import { reviewQueue } from "@/lib/review-queue";
import { reviewRun } from "@/lib/review-run";
import { cn } from "@/lib/utils";

/**
 * The monthly VAT return (ภ.พ.30) at a glance: which month, how many days are left, the input VAT that can be
 * claimed, what still needs a look, and the way to the report and to closing the month.
 */
export function VatCard({ entries, companyTaxId, today }: { entries: LedgerEntry[]; companyTaxId: string; today: string }) {
  const t = useTranslations("vat");
  const sd = useScreenDate();
  const tf = useTranslations("flow");
  const monthLabel = useMonthLabel();
  const me = useMe();
  const locks = useMonthLocks();
  const f = vatFiling(today);
  const label = monthLabel(f.month);
  const closed = locks.has(f.month);

  const s = useMemo(
    () => summarize(pick(entries, "ledger").map((e) => ({ id: e.id, doc: e.doc })), f.month, companyTaxId, today),
    [entries, f.month, companyTaxId, today],
  );
  const drafts = useMemo(() => pick(entries, "drafts").filter((e) => monthKey(e.doc) === f.month).length, [entries, f.month]);

  // Everything that still needs a look, any month, oldest first
  const firstToCheck = useMemo(() => reviewQueue(entries, companyTaxId, today)[0], [entries, companyTaxId, today]);

  const urgent = !closed && f.daysLeft <= 5;
  const late = !closed && f.daysLeft < 0;

  return (
    <section aria-labelledby="vat-title" className="workspace-panel hover-lift [--lift:1.006] grid gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 id="vat-title" className="text-lg font-semibold tracking-tight">
            {t("title", { month: label })}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("deadline", { due: sd(f.due), online: sd(f.dueOnline) })}
          </p>
        </div>
        {closed ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-3 py-1 text-sm font-semibold text-ok">
            <Lock className="size-3.5" aria-hidden />
            {t("closed")}
          </span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold tabular-nums",
              late ? "bg-bad-soft text-bad" : urgent ? "bg-warn-soft text-warn" : "bg-brand-soft text-brand",
            )}
          >
            <CalendarClock className="size-3.5" aria-hidden />
            {late ? t("late") : f.daysLeft === 0 ? t("today") : t("daysLeft", { days: f.daysLeft })}
            {f.onlineOnly && !late && <span className="font-normal">· {t("onlineOnly")}</span>}
          </span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label={t("claimable")} value={baht(s.claimableVat)} tone="brand" />
        <Fact label={t("docs")} value={t("count", { count: s.count })} />
        <Fact label={t("toCheck")} value={t("count", { count: s.toCheck })} tone={s.toCheck ? "warn" : undefined} />
        <Fact label={t("drafts")} value={t("count", { count: drafts })} tone={drafts ? "warn" : undefined} />
      </dl>

      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        {closed ? (
          <CircleCheck className="mt-0.5 size-4 flex-none text-ok" aria-hidden />
        ) : s.toCheck || drafts ? (
          <TriangleAlert className="mt-0.5 size-4 flex-none text-warn" aria-hidden />
        ) : (
          <CircleCheck className="mt-0.5 size-4 flex-none text-ok" aria-hidden />
        )}
        {closed ? t("doneHint") : s.toCheck || drafts ? t("todoHint") : t("readyHint")}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {firstToCheck && (
          <Link
            href={`/documents/${firstToCheck}?check=1`}
            onClick={() => reviewRun.start()}
            className="press inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 active:scale-[0.97]"
          >
            <ListChecks className="size-4" aria-hidden />
            {tf("start")}
          </Link>
        )}
        <Link
          href={`/ledger/report/${f.month}`}
          className="press inline-flex h-10 items-center gap-2 rounded-full bg-secondary px-4 text-sm font-medium hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] active:scale-[0.97]"
        >
          <FileText className="size-4 text-bad" aria-hidden />
          {t("report")}
        </Link>
        {(s.toCheck > 0 || drafts > 0) && (
          <Link href="/ledger" className="press inline-flex h-10 items-center rounded-full px-4 text-sm font-medium text-primary hover:bg-primary/10 active:scale-[0.97]">
            {t("toLedger")}
          </Link>
        )}
        {me.role === "admin" && <MonthLockButton month={f.month} label={label} locked={closed} />}
      </div>
    </section>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: "brand" | "warn" }) {
  return (
    <div className="grid gap-0.5 rounded-2xl bg-muted/60 px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-[15px] font-semibold tabular-nums", tone === "brand" && "text-brand", tone === "warn" && "text-warn")}>{value}</dd>
    </div>
  );
}
