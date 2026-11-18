"use client";

// 세금 신고 모아보기 (owner 2026-11-18, from the for-sale version): one tax month's returns on one screen — ภ.พ.30, ภ.ง.ด.53,
// ภ.ง.ด.3, ภ.ง.ด.1 + social security — each with its amount, deadline, status and the way to its numbers (the filing
// helper, payroll). The "filed" tick is the tax calendar's own (the same as the filing helper's). Admins who may open
// sales; follows the branch being worked in like the filing helper. Pure parts: lib/tax-hub.

import { ChevronLeft, ChevronRight, CircleCheck, Landmark, Loader2, ReceiptText, Users, WalletCards } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useScreenDate } from "@/components/ScreenDate";
import { Badge, DueBadge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { useBranch } from "@/lib/branch-store";
import { setDone, useCalendar } from "@/lib/calendar-store";
import { useCompany } from "@/lib/company-store";
import { buildPp30, buildWhtFiling, carriedIn } from "@/lib/filing";
import { pick, useLedger } from "@/lib/ledger-store";
import { baht, fromSatang, toSatang } from "@/lib/money";
import { loadPayroll } from "@/lib/payroll-store";
import { useMe } from "@/lib/role-store";
import { useSales } from "@/lib/sales-store";
import { canOpen } from "@/lib/screens";
import { daysLeft, hubMonth, monthDeadlines, monthlyDoneKey, payrollTaxes, type ReturnKind, returnStatus, vatDoneKey } from "@/lib/tax-hub";
import { todayBangkok } from "@/lib/thai-tax";
import { cn } from "@/lib/utils";
import { useMonthLabel } from "./Stickers";
import { TaxAiCheck } from "./TaxAiCheck";
import type { TaxSheet } from "@/lib/tax-check";
import { summarize } from "@/lib/dashboard";
import { dupGroupsIn } from "@/lib/dup-groups";
import { monthKey } from "@/lib/archive";

const shift = (ym: string, n: number) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);
const ICON = { pp30: Landmark, pnd53: ReceiptText, pnd3: ReceiptText, pnd1: WalletCards } as const;

export function TaxesHub() {
  const t = useTranslations("taxes");
  const sd = useScreenDate();
  const monthLabel = useMonthLabel();
  const me = useMe();
  const company = useCompany();
  const branch = useBranch();
  const { entries, loaded } = useLedger();
  const { sales, loaded: salesLoaded } = useSales();
  const cal = useCalendar();
  const today = todayBangkok();
  const asked = useSearchParams().get("month");
  const [month, setMonth] = useState(() => hubMonth(asked, today));
  const [pay, setPay] = useState<{ month: string; pnd1: number; sso: number; people: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Payroll's part (admins read pay lines)
  useEffect(() => {
    let live = true;
    void loadPayroll({ month, branch })
      .then((lines) => live && setPay({ month, ...payrollTaxes(lines) }))
      .catch(() => live && setPay({ month, pnd1: 0, sso: 0, people: 0 }));
    return () => {
      live = false;
    };
  }, [month, branch]);

  const ledger = useMemo(() => pick(entries, "ledger"), [entries]);
  const docs = useMemo(() => ledger.map((e) => ({ id: e.id, doc: e.doc })), [ledger]);
  const { pp30 } = useMemo(() => buildPp30(sales, ledger.map((e) => e.doc), month, company.taxId), [sales, ledger, month, company.taxId]);
  const wht = useMemo(() => buildWhtFiling(docs, month), [docs, month]);
  const carry = useMemo(() => toSatang(carriedIn(sales, ledger.map((e) => e.doc), month, company.taxId)), [sales, ledger, month, company.taxId]);
  const vatNet = toSatang(pp30.toPay) - toSatang(pp30.overpaid) - carry;
  const due = monthDeadlines(month);
  const payOk = pay?.month === month;

  // The facts the AI check words (lib/tax-check): the month against the three before it, what is wrong, what is filed
  const aiSheet = useMemo<TaxSheet>(() => {
    const docsOnly = ledger.map((e) => e.doc);
    const vatOf = (m: string) => {
      const p = buildPp30(sales, docsOnly, m, company.taxId).pp30;
      return fromSatang(toSatang(p.toPay) - toSatang(p.overpaid));
    };
    return {
      month,
      today,
      vat: { output: pp30.outputVat, input: pp30.inputVat, toPay: fromSatang(Math.max(vatNet, 0)), credit: fromSatang(Math.max(-vatNet, 0)), carriedIn: fromSatang(carry) },
      vatBefore: [1, 2, 3].map((n) => ({ month: shift(month, -n), toPay: vatOf(shift(month, -n)) })),
      wht: { pnd53Count: wht.pnd53.length, pnd53Tax: wht.totals.pnd53.tax, pnd3Count: wht.pnd3.length, pnd3Tax: wht.totals.pnd3.tax, badTaxIds: wht.badIds.length, notMarkedPaid: wht.unpaid },
      payroll: payOk ? { lines: pay.people, tax: fromSatang(pay.pnd1), socialSecurity: fromSatang(pay.sso) } : { lines: 0, tax: 0, socialSecurity: 0 },
      documentsToCheck: summarize(docs, month, company.taxId, today).toCheck,
      drafts: pick(entries, "drafts").filter((e) => monthKey(e.doc) === month).length,
      possibleDuplicates: dupGroupsIn(ledger, month),
      deadlines: { vat: due.pp30.online, vatDaysLeft: daysLeft(today, due.pp30.online), withholding: due.pnd53.online, withholdingDaysLeft: daysLeft(today, due.pnd53.online) },
      filed: { vat: cal.done.has(vatDoneKey(month)), monthly: cal.done.has(monthlyDoneKey(month)) },
    };
    // due is derived from month
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger, sales, month, company.taxId, pp30, vatNet, carry, wht, payOk, pay, docs, entries, today, cal.done]);

  if (me.loaded && (me.role !== "admin" || !canOpen(me, "sales") || !canOpen(me, "ledger"))) return <p className="text-sm text-muted-foreground">{t("adminOnly")}</p>;
  if (!loaded || !salesLoaded || !cal.loaded) return <Loader2 className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" aria-label={t("loading")} />;

  type Row = { kind: ReturnKind; amount: number | null; note: string; key: string; nothing: boolean; href: string };
  const rows: Row[] = [
    {
      kind: "pp30",
      amount: Math.max(vatNet, 0),
      note: vatNet < 0 ? t("vatCredit", { amount: baht(fromSatang(-vatNet)) }) : t("vatNote", { sales: baht(pp30.outputVat), buy: baht(pp30.inputVat) }),
      key: vatDoneKey(month),
      nothing: false,
      href: `/ledger/filing/${month}`,
    },
    {
      kind: "pnd53",
      amount: toSatang(wht.totals.pnd53.tax),
      note: t("whtNote", { count: wht.pnd53.length }),
      key: monthlyDoneKey(month),
      nothing: wht.pnd53.length === 0,
      href: `/ledger/filing/${month}`,
    },
    {
      kind: "pnd3",
      amount: toSatang(wht.totals.pnd3.tax),
      note: t("whtNote", { count: wht.pnd3.length }),
      key: monthlyDoneKey(month),
      nothing: wht.pnd3.length === 0,
      href: `/ledger/filing/${month}`,
    },
    {
      kind: "pnd1",
      amount: payOk ? pay.pnd1 + pay.sso : null,
      note: payOk ? t("payNote", { tax: baht(fromSatang(pay.pnd1)), sso: baht(fromSatang(pay.sso)), people: pay.people }) : t("loading"),
      key: monthlyDoneKey(month),
      nothing: payOk && pay.people === 0,
      href: "/payroll",
    },
  ];
  const total = rows.reduce((a, r) => a + (r.nothing || cal.done.has(r.key) ? 0 : (r.amount ?? 0)), 0);

  const toggle = async (key: string, on: boolean) => {
    setBusy(key);
    try {
      await setDone(key, on);
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight sm:text-[32px]">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("sub")}</p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-card p-1 shadow-[var(--shadow-soft)] ring-1 ring-border">
          <button type="button" onClick={() => setMonth(shift(month, -1))} aria-label={t("prev")} className="press grid size-11 place-items-center rounded-full hover:bg-muted pointer-fine:size-9">
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <span className="min-w-28 text-center text-[15px] font-semibold tabular-nums">{monthLabel(month)}</span>
          <button type="button" onClick={() => setMonth(shift(month, 1))} aria-label={t("next")} className="press grid size-11 place-items-center rounded-full hover:bg-muted pointer-fine:size-9">
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </header>

      <section className="workspace-panel hover-lift [--lift:1.006] grid gap-1 p-5 sm:p-6" aria-label={t("total")}>
        <p className="text-sm font-medium text-muted-foreground">{t("total")}</p>
        <p className="text-[34px] leading-tight font-bold tracking-tight tabular-nums">{baht(fromSatang(total))}</p>
        <p className="text-xs text-muted-foreground">{t("totalNote")}</p>
      </section>

      {/* AI 신고 전 점검 (lib/tax-check) */}
      <TaxAiCheck sheet={aiSheet} />

      <ul className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => {
          const Icon = r.kind === "pnd1" ? Users : ICON[r.kind];
          const d = due[r.kind];
          const filed = cal.done.has(r.key);
          const status = returnStatus({ filed, nothing: r.nothing, deadline: d.online, today });
          const left = daysLeft(today, d.online);
          return (
            <li key={r.kind} className="workspace-panel hover-lift [--lift:1.01] grid gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 flex-none place-items-center rounded-xl bg-brand-soft text-brand">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="grid min-w-0">
                    <h2 className="truncate text-[16px] font-semibold">{t(`kind.${r.kind}`)}</h2>
                    <p className="truncate text-xs text-muted-foreground">{t(`kindSub.${r.kind}`)}</p>
                  </div>
                </div>
                {status === "filed" ? (
                  <Badge tone="ok">
                    <CircleCheck className="size-3.5" aria-hidden />
                    {t("status.filed")}
                  </Badge>
                ) : status === "none" ? (
                  <Badge tone="muted">{t("status.none")}</Badge>
                ) : (
                  <DueBadge daysLeft={left}>{left < 0 ? t("status.late", { days: -left }) : left === 0 ? t("status.today") : `D-${left}`}</DueBadge>
                )}
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="grid min-w-0 gap-0.5">
                  <p className={cn("text-2xl font-semibold tracking-tight tabular-nums", r.nothing && "text-muted-foreground")}>{r.amount === null ? "…" : baht(fromSatang(r.amount))}</p>
                  <p className="text-xs text-muted-foreground">{r.note}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{t("deadline", { online: sd(d.online), paper: sd(d.paper) })}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={r.href} className="press inline-flex h-11 items-center rounded-full bg-primary px-4 text-[14px] font-semibold text-primary-foreground pointer-fine:h-9">
                  {r.kind === "pnd1" ? t("openPayroll") : t("openNumbers")}
                </Link>
                {!r.nothing && (
                  <button
                    type="button"
                    disabled={busy === r.key}
                    onClick={() => void toggle(r.key, !filed)}
                    aria-pressed={filed}
                    className={cn("press inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium ring-1 pointer-fine:h-9", filed ? "bg-ok-soft text-ok ring-ok/30" : "bg-card ring-border hover:bg-muted")}
                  >
                    {busy === r.key ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CircleCheck className="size-4" aria-hidden />}
                    {filed ? t("filedUndo") : t("markFiled")}
                  </button>
                )}
              </div>
              {r.kind !== "pp30" && <p className="text-[11.5px] text-muted-foreground">{t("sharedTick")}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
