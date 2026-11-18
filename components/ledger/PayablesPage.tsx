"use client";

// 줄 돈 (owner 2026-11-18, from the for-sale version): every unpaid bill in due-date buckets and per supplier, soonest
// first; tick bills and mark them paid today (undo on the toast). Follows the branch being worked in (the ledger store).
// Admins. Pure parts: lib/payables.

import { Check, ChevronRight, Loader2, ReceiptText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useScreenDate } from "@/components/ScreenDate";
import { DueBadge, Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { pick, setPaidMany, useLedger } from "@/lib/ledger-store";
import { baht, fromSatang } from "@/lib/money";
import { type Bucket, BUCKETS, bucketTotals, bySupplier, unpaidBills } from "@/lib/payables";
import { useMe } from "@/lib/role-store";
import { canOpen } from "@/lib/screens";
import { todayBangkok } from "@/lib/thai-tax";
import { cn } from "@/lib/utils";
import { PayAi } from "./PayAi";

const TONE: Record<Bucket, string> = { late: "text-bad", week: "text-warn", month: "text-foreground", later: "text-foreground", none: "text-muted-foreground" };

export function PayablesPage() {
  const t = useTranslations("payables");
  const locale = useLocale();
  const sd = useScreenDate();
  const me = useMe();
  const { entries, loaded } = useLedger();
  const today = todayBangkok();
  const [only, setOnly] = useState<Bucket | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const bills = useMemo(() => unpaidBills(pick(entries, "ledger"), today), [entries, today]);
  const totals = useMemo(() => bucketTotals(bills), [bills]);
  const shown = only ? bills.filter((b) => b.bucket === only) : bills;
  const groups = useMemo(() => bySupplier(shown), [shown]);
  const name = (n: { th?: string; en?: string; ja?: string }) => (locale === "ja" && n.ja) || (locale === "th" && n.th) || n.en || n.th || n.ja || "—";
  const all = bills.reduce((a, b) => a + b.amount, 0);

  if (me.loaded && (me.role !== "admin" || !canOpen(me, "ledger"))) return <p className="text-sm text-muted-foreground">{t("adminOnly")}</p>;
  if (!loaded) return <Loader2 className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" aria-label={t("loading")} />;

  const flip = (id: string) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id])));
  const pay = async () => {
    const ids = [...picked];
    setBusy(true);
    try {
      await setPaidMany(ids, true, today);
      setPicked(new Set());
      toast.success(t("paidDone", { count: ids.length }), { action: { label: t("undo"), onClick: () => void setPaidMany(ids, false, "") } });
    } catch {
      toast.error(t("failed"));
    } finally {
      setBusy(false);
    }
  };
  const pickedTotal = bills.filter((b) => picked.has(b.id)).reduce((a, b) => a + b.amount, 0);

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-5 pb-24">
      <header className="grid gap-1">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight sm:text-[32px]">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("sub")}</p>
      </header>

      <section className="workspace-panel hover-lift [--lift:1.006] grid gap-4 p-5 sm:p-6" aria-label={t("total")}>
        <div className="grid gap-0.5">
          <p className="text-sm font-medium text-muted-foreground">{t("total")}</p>
          <p className="text-[34px] leading-tight font-bold tracking-tight tabular-nums">{baht(fromSatang(all))}</p>
          <p className="text-xs text-muted-foreground">{t("count", { count: bills.length })}</p>
        </div>
        {/* The buckets double as filters */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="group" aria-label={t("filter")}>
          {BUCKETS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setOnly(only === b ? null : b)}
              aria-pressed={only === b}
              className={cn("press grid min-h-11 gap-0.5 rounded-xl bg-muted/50 px-3.5 py-2.5 text-left ring-1 ring-transparent transition-colors", only === b && "bg-brand-soft ring-brand/40")}
            >
              <span className="truncate text-[12.5px] font-medium text-muted-foreground">{t(`bucket.${b}`)}</span>
              <span className={cn("truncate text-lg font-semibold tabular-nums", TONE[b])}>{baht(fromSatang(totals[b].amount))}</span>
              <span className="text-[12px] text-muted-foreground">{t("count", { count: totals[b].count })}</span>
            </button>
          ))}
        </div>
      </section>

      {/* AI 지급 순서 추천 (lib/pay-advice): which bills first, and pick them in one tap */}
      {bills.length > 0 && (
        <PayAi
          sheet={{
            today,
            totals: { late: fromSatang(totals.late.amount), week: fromSatang(totals.week.amount), month: fromSatang(totals.month.amount), later: fromSatang(totals.later.amount), none: fromSatang(totals.none.amount) },
            bills: bills.slice(0, 40).map((b, i) => ({ n: i + 1, supplier: name(b.doc.seller.name), amount: fromSatang(b.amount), days: b.days, date: b.doc.date })),
          }}
          onPick={(ns) => setPicked(new Set(ns.map((n) => bills[n - 1]?.id).filter((x): x is string => !!x)))}
        />
      )}

      {groups.length === 0 ? (
        <p className="workspace-panel p-6 text-center text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="grid gap-3">
          {groups.map((g) => (
            <li key={g.key} className="workspace-panel hover-lift [--lift:1.01] grid gap-2 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid size-9 flex-none place-items-center rounded-xl bg-brand-soft text-brand">
                    <ReceiptText className="size-4.5" aria-hidden />
                  </span>
                  <div className="grid min-w-0">
                    <h2 className="truncate text-[15px] font-semibold">{name(g.name)}</h2>
                    <p className="text-xs text-muted-foreground">{t("count", { count: g.bills.length })}</p>
                  </div>
                </div>
                <div className="grid flex-none justify-items-end">
                  <span className="text-[17px] font-semibold tabular-nums">{baht(fromSatang(g.amount))}</span>
                  {g.late > 0 && <span className="text-xs font-medium text-bad tabular-nums">{t("lateAmount", { amount: baht(fromSatang(g.late)) })}</span>}
                </div>
              </div>
              <ul className="grid divide-y divide-border">
                {g.bills.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 py-2">
                    <button
                      type="button"
                      onClick={() => flip(b.id)}
                      aria-pressed={picked.has(b.id)}
                      aria-label={t("pick")}
                      className={cn("relative grid size-5 flex-none place-items-center rounded-md ring-1 ring-border after:absolute after:-inset-3", picked.has(b.id) && "bg-primary text-primary-foreground ring-primary")}
                    >
                      {picked.has(b.id) && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
                    </button>
                    <Link href={`/documents/${b.id}`} className="press flex min-w-0 flex-1 items-center gap-3 rounded-lg">
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate text-[14px]">{b.doc.docNo || "—"}</span>
                        <span className="truncate text-xs text-muted-foreground tabular-nums">
                          {sd(b.doc.date)}
                          {b.doc.dueDate ? ` · ${t("due", { date: sd(b.doc.dueDate) })}` : ""}
                        </span>
                      </span>
                      {b.days === null ? (
                        <Badge tone="muted">{t("noDue")}</Badge>
                      ) : (
                        <DueBadge daysLeft={b.days}>{b.days < 0 ? t("late", { days: -b.days }) : b.days === 0 ? t("today") : `D-${b.days}`}</DueBadge>
                      )}
                      <span className="w-28 flex-none text-right text-[14px] font-semibold tabular-nums max-sm:w-24">{baht(fromSatang(b.amount))}</span>
                      <ChevronRight className="size-4 flex-none text-muted-foreground max-sm:hidden" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {picked.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 px-4 md:bottom-6">
          <div className="mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-foreground p-3 pl-4 text-background shadow-2xl">
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium tabular-nums">{t("picked", { count: picked.size, amount: baht(fromSatang(pickedTotal)) })}</span>
            <button type="button" onClick={() => setPicked(new Set())} className="press h-11 rounded-full px-3 text-[14px] opacity-80 pointer-fine:h-9">
              {t("clear")}
            </button>
            <button type="button" disabled={busy} onClick={() => void pay()} className="press inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-[14px] font-semibold text-primary-foreground pointer-fine:h-9">
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("markPaid")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
