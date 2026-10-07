"use client";

import { CalendarClock, ChevronDown, ChevronRight, CircleCheck, Clock, Inbox, Landmark, Loader2, Lock, QrCode, Receipt, TrendingUp, Undo2, Wallet, Check } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { canPay, PayQr } from "@/components/vendors/PayQr";
import { amountToPay, hasWht, whtTax } from "@/lib/wht";
import { useLocale, useTranslations } from "next-intl";
import { useScreenDate } from "@/components/ScreenDate";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { monthKey } from "@/lib/archive";
import { useCompany } from "@/lib/company-store";
import { type Doc, type DueItem, summarize, upcoming, vatFiling } from "@/lib/dashboard";
import { pick, setQuick, useLedger } from "@/lib/ledger-store";
import { baht, bahtWhole } from "@/lib/money";
import { todayBangkok } from "@/lib/thai-tax";
import { cn } from "@/lib/utils";
import { useMonthLabel } from "@/components/ledger/Stickers";
import { CategoryIcon } from "@/components/vendors/CategoryIcon";
import { digitsOnly } from "@/lib/thai-tax";
import { useVendors } from "@/lib/vendor-store";
import { vendorCategory } from "@/lib/vendors";
import { monthResult } from "@/lib/sales";
import { useSales } from "@/lib/sales-store";
import { InstallCard } from "@/components/settings/InstallCard";
import { CostCard } from "@/components/sales/CostCard";
import { useMe } from "@/lib/role-store";
import { ALL } from "@/lib/branches";
import { useBranch, useBranches } from "@/lib/branch-store";
import { BranchTable } from "./BranchTable";
import { GoalBars } from "./GoalBars";
import { RecentSalesCard } from "./RecentSalesCard";
import { FoldAllButton, SettingsFold } from "@/components/settings/SettingsFold";
import { useMonthLocks } from "@/lib/month-lock-store";
import { useDocName } from "@/components/ledger/doc-name";
import { monthLabor } from "@/lib/cost-control";
import { useLabor } from "@/lib/labor-store";
import { fixedForMonth } from "@/lib/fixed-costs";
import { useCostLines } from "@/lib/cash-store";
import { stockChange } from "@/lib/stock";
import { useStock } from "@/lib/stock-store";
import dynamic from "next/dynamic";

// Lists behind the to-do rows (and the admins' team card) load when needed, so the first screen comes up sooner
const later = <Loader2 className="mx-auto my-4 size-5 animate-spin text-muted-foreground" aria-hidden />;
const UncheckedList = dynamic(() => import("./UncheckedList").then((m) => m.UncheckedList), { loading: () => later });
const VatCard = dynamic(() => import("./VatCard").then((m) => m.VatCard), { loading: () => later });
const MonthCloseCard = dynamic(() => import("./MonthCloseCard").then((m) => m.MonthCloseCard), { loading: () => later });
const TeamCard = dynamic(() => import("./TeamCard").then((m) => m.TeamCard));


/** Step 8 dashboard: the 4 summary tiles, bills due soon (mark paid here), 6-month trend, recent activity. */
export function Dashboard() {
  const t = useTranslations();
  const locale = useLocale();
  const company = useCompany();
  const monthLabel = useMonthLabel();
  const { entries, loaded } = useLedger();
  const today = todayBangkok();
  const thisMonth = today.slice(0, 7);
  const docs = useMemo(() => pick(entries, "ledger").map((e) => ({ id: e.id, doc: e.doc, ack: e.ackFlags })), [entries]);
  const months = useMemo(() => {
    const set = new Set([thisMonth, ...docs.map((d) => monthKey(d.doc)).filter((k) => k !== "none")]);
    return [...set].sort().reverse();
  }, [docs, thisMonth]);
  const [month, setMonth] = useState(thisMonth);

  const s = useMemo(() => summarize(docs, month, company.taxId, today), [docs, month, company.taxId, today]);
  const due = useMemo(() => upcoming(docs, today), [docs, today]);
  const { sales } = useSales();
  const { lines: labor } = useLabor();
  const { lines: fixed } = useCostLines();
  const isAdmin = useMe().role === "admin";
  const allBranches = useBranch() === ALL;
  const branchCount = useBranches().branches.length;
  // Several branches seen together: the combined board carries the profit, so the single line steps aside
  const combined = allBranches && branchCount > 1;
  const { counts: stock } = useStock();
  const result = useMemo(
    () => monthResult(sales, docs.map((d) => d.doc), month, company.taxId, monthLabor(labor, month), fixedForMonth(fixed, month), stockChange(stock, month).change),
    [sales, docs, month, company.taxId, labor, fixed, stock],
  );
  const hasSales = result.days > 0;
  const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const unchecked = useMemo(() => pick(entries, "ledger").filter((e) => e.checkedAt === null).length, [entries]);
  const dueTotal = due.reduce((a, it) => a + Math.round(it.doc.totals.net * 100), 0) / 100;
  // The VAT return due next: days left, and what still needs a look in that month
  const locks = useMonthLocks();
  const filing = vatFiling(today);
  const filingCheck = useMemo(() => summarize(docs, filing.month, company.taxId, today).toCheck, [docs, filing.month, company.taxId, today]);
  const vatStatus = locks.has(filing.month)
    ? { text: t("vat.closed"), tone: "ok" as const }
    : {
        text: [filing.daysLeft < 0 ? t("vat.late") : filing.daysLeft === 0 ? t("vat.today") : t("vat.daysLeft", { days: filing.daysLeft }), filingCheck ? t("dash.vatCheck", { count: filingCheck }) : ""]
          .filter(Boolean)
          .join(" · "),
        tone: filing.daysLeft < 0 ? ("bad" as const) : filing.daysLeft <= 5 || filingCheck ? ("warn" as const) : ("brand" as const),
      };
  const purchases = useMemo(() => docs.map((d) => d.doc), [docs]);

  if (!loaded) return <Loader2 className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" aria-label="Loading" />;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* The month is the heading, and changes right there */}
        <span className="relative">
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            aria-label={t("dash.month")}
            className="press h-11 cursor-pointer appearance-none rounded-full bg-card py-0 pr-10 pl-4 text-xl font-bold tracking-tight shadow-[var(--shadow-soft)] ring-1 ring-border"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        </span>
        {/* A new company: what a read document looks like */}
        {docs.length === 0 && (
          <Link href="/documents/sample" className="press flex min-h-11 items-center gap-1 rounded-full px-4 text-sm font-medium text-primary hover:bg-primary/10">
            {t("dash.sample")}
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>

      {/* 1. How the month is going: what is left (the one number owners ask first), then four figures */}
      {combined ? (
        // Several branches seen together: each branch's month side by side carries the profit
        <BranchTable month={month} companyTaxId={company.taxId} />
      ) : (
        <section className="workspace-panel grid gap-3 p-5 ring-1 ring-brand/25 sm:p-6" aria-label={t("dash.profitTitle")}>
          <Link href="/sales" className="press -my-2 flex items-center justify-between gap-3 rounded-lg py-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-brand">
              <TrendingUp className="size-4" aria-hidden />
              {t("dash.profitTitle")}
            </span>
            <ChevronRight className="size-4 flex-none text-brand/70" aria-hidden />
          </Link>
          {hasSales ? (
            <>
              <span
                key={result.profit}
                className={cn("num-in text-[clamp(2rem,9vw,3rem)] leading-none font-bold tracking-tight whitespace-nowrap tabular-nums", result.profit < 0 ? "text-bad" : "text-foreground")}
              >
                {bahtWhole(result.profit)}
              </span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground tabular-nums">
                <span>{t("dash.profitLine", { sales: bahtWhole(result.salesValue), cost: bahtWhole(result.purchasesCost) })}</span>
                {result.salesValue > 0 && (
                  <span className="rounded-full bg-background/70 px-2 py-0.5 text-xs font-semibold text-foreground">{t("sales.margin", { pct: pct.format(result.margin) })}</span>
                )}
              </span>
            </>
          ) : (
            <Link href="/sales" className="-my-2 w-fit py-2 text-[15px] font-medium text-primary hover:underline">
              {t("dash.profitEmpty")}
            </Link>
          )}
          {/* How far towards break-even and the month's target (once there are sales to measure) */}
          {hasSales && <GoalBars month={month} today={today} salesValue={result.salesValue} />}
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={TrendingUp} label={t("sales.salesValue")} value={result.salesValue} note={t("dash.salesDays", { count: result.days })} />
        <Tile icon={Receipt} label={t("app.sTotal")} value={s.total} note={t("dash.monthDocs", { count: s.count })} />
        <Tile
          icon={Clock}
          label={t("app.sUnpaid")}
          value={s.unpaid}
          tone={s.overdueCount ? "bad" : undefined}
          note={
            <>
              {t("dash.unpaidCount", { count: s.unpaidCount })}
              {s.overdueCount > 0 && <span className="font-semibold text-bad"> · {t("dash.overdueCount", { count: s.overdueCount })}</span>}
            </>
          }
        />
        <Tile
          icon={Landmark}
          label={t("dash.vatToPay")}
          value={result.vatPayable}
          tone={result.vatPayable < 0 ? "brand" : undefined}
          note={result.vatPayable < 0 ? t("dash.vatCreditShort") : `${bahtWhole(result.salesVat)} − ${bahtWhole(result.claimableVat)}`}
        />
      </div>

      {/* 2. What to do: one card, one line each; a line opens its list */}
      <div className="grid items-start gap-5 lg:grid-cols-2 lg:items-stretch">
        <div className="flex min-w-0 flex-col gap-5">
        <section aria-labelledby="todo-title" className="workspace-panel grid min-w-0 grid-cols-1 content-start px-4 pt-3 pb-1 sm:px-5">
          <div className="flex items-center justify-between gap-2 pt-1 pb-1">
            <h2 id="todo-title" className="px-1 text-lg font-semibold tracking-tight">
              {t("dash.todo")}
            </h2>
            <FoldAllButton />
          </div>
          {isAdmin && (
            <SettingsFold
              row
              lazy
              icon={<Inbox className="text-brand" />}
              title={t("dash.unchecked")}
              status={unchecked ? { text: t("dash.nItems", { count: unchecked }), tone: "brand" } : { text: t("dash.none"), tone: "ok" }}
            >
              <UncheckedList />
            </SettingsFold>
          )}
          <SettingsFold
            row
            icon={<Wallet className="text-warn" />}
            title={t("dash.upcoming")}
            status={
              due.length
                ? { text: t("dash.dueStatus", { count: due.length, amount: bahtWhole(dueTotal) }), tone: s.overdueCount ? "bad" : "warn" }
                : { text: t("dash.none"), tone: "ok" }
            }
          >
            <DueList items={due} docs={docs} />
          </SettingsFold>
          <SettingsFold row lazy icon={<CalendarClock className="text-primary" />} title={t("dash.vatRow", { month: new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(`${filing.month}-01T00:00:00Z`)) })} status={vatStatus}>
            <VatCard entries={entries} companyTaxId={company.taxId} today={today} />
          </SettingsFold>
          {isAdmin && (
            <SettingsFold row lazy icon={<Lock className="text-muted-foreground" />} title={t("close.row")}>
              <MonthCloseCard />
            </SettingsFold>
          )}
        </section>

          {/* The last week of sales, ending yesterday */}
          <RecentSalesCard today={today} />
        </div>

        {/* 3. In more detail: food, labour and rent against sales (FL / FLR) */}
        {/* Stays in view beside a long to-do list */}
        <div className="min-w-0">
          <div className="lg:sticky lg:top-24">
            <CostCard month={month} salesValue={result.salesValue} purchases={purchases} fixed={fixed} fold />
          </div>
        </div>
      </div>

      {/* Phones, until installed or closed: put the app on the home screen */}
      <InstallCard compact />

      {/* Admins: who did what this month */}
      {isAdmin && <TeamCard month={month} />}
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: typeof Receipt;
  label: string;
  value: number;
  note?: React.ReactNode;
  tone?: "brand" | "bad" | "warn";
}) {
  return (
    <div className="workspace-panel hover-lift grid content-start gap-1.5 p-4 sm:p-5">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </span>
      <span
        // A new value (another month) remounts the number, so it rolls in
        key={value}
        className={cn(
          // Whole baht here (the ledger keeps the satang); shrinks with the screen to stay on one line
          "num-in text-[clamp(1.25rem,5.6vw,1.75rem)] leading-tight font-semibold tracking-tight whitespace-nowrap tabular-nums",
          value === 0 && "text-muted-foreground/60",
          value !== 0 && tone === "brand" && "text-brand",
          value !== 0 && tone === "bad" && "text-bad",
          value !== 0 && tone === "warn" && "text-warn",
        )}
      >
        {value === 0 ? "฿0" : bahtWhole(value)}
      </span>
      {note && <span className="text-xs leading-snug text-muted-foreground">{note}</span>}
    </div>
  );
}

/** Unpaid credit purchases, most urgent first; paying one is a single tap (with undo) */
function DueList({ items, docs }: { items: DueItem[]; docs: Doc[] }) {
  const { vendors } = useVendors();
  // The same icon as on the vendor page: the vendor's rule, else the category its documents use most
  const iconOf = useMemo(() => {
    const cats = new Map<string, { date: string; cat: string }[]>();
    for (const { doc } of docs) {
      const k = digitsOnly(doc.seller.taxId);
      cats.set(k, [...(cats.get(k) ?? []), { date: doc.date, cat: doc.category }]);
    }
    const rule = new Map(vendors.map((v) => [v.taxId, v.ruleCategory]));
    return (taxId: string, own: string) => {
      const k = digitsOnly(taxId);
      const seen = (cats.get(k) ?? []).sort((a, b) => b.date.localeCompare(a.date)).map((x) => x.cat);
      return vendorCategory(rule.get(k) ?? null, seen.length ? seen : [own]);
    };
  }, [docs, vendors]);
  const t = useTranslations();
  const sd = useScreenDate();
  const [busy, setBusy] = useState<string | null>(null);
  // Paying a bill: the vendor's PromptPay QR / bank account (when an admin saved them)
  const payOf = useMemo(() => new Map(vendors.filter((v) => canPay(v.pay)).map((v) => [v.taxId, v.pay])), [vendors]);
  const [paying, setPaying] = useState<DueItem | null>(null);
  const payingPay = paying ? payOf.get(digitsOnly(paying.doc.seller.taxId)) : undefined;
  const docName = useDocName();
  // Five at first; the rest one tap away
  const [all, setAll] = useState(false);
  const SHOWN = 5;
  const total = items.reduce((a, it) => a + Math.round(it.doc.totals.net * 100), 0) / 100;

  const setPaid = async (it: DueItem, paid: boolean) => {
    setBusy(it.id);
    try {
      await setQuick(it.id, { paid, paidDate: paid ? todayBangkok() : "" });
      if (paid)
        toast.success(t("dash.markedPaid"), {
          action: { label: <Undo2 className="size-4" aria-label="Undo" />, onClick: () => void setPaid(it, false) },
        });
    } catch {
      toast.error(t("app.saveFail"));
    } finally {
      setBusy(null);
    }
  };

  const badge = (it: DueItem) =>
    it.state === "overdue"
      ? { text: t("dash.overdueBy", { days: -(it.days ?? 0) }), cls: "bg-bad-soft text-bad" }
      : it.state === "soon"
        ? { text: it.days === 0 ? t("dash.dueToday") : t("dash.dueIn", { days: it.days ?? 0 }), cls: "bg-warn-soft text-warn" }
        : it.state === "later"
          ? { text: t("dash.dueIn", { days: it.days ?? 0 }), cls: "bg-muted text-muted-foreground" }
          : { text: t("dash.noDue"), cls: "bg-muted text-muted-foreground" };

  return (
    <section aria-labelledby="due-title" className="workspace-panel hover-lift [--lift:1.006] grid gap-3 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 id="due-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            {t("dash.upcoming")}
            {items.length > 0 && (
              <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn tabular-nums">{t("dash.upcomingCount", { count: items.length })}</span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">{t("dash.upcomingHint")}</p>
        </div>
        {items.length > 0 && (
          <span className="grid flex-none text-right">
            <span className="text-[11px] text-muted-foreground">{t("dash.upcomingTotal")}</span>
            <span className="text-[15px] font-semibold tabular-nums">{baht(total)}</span>
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-ok" aria-hidden />
          {t("dash.upcomingEmpty")}
        </p>
      ) : (
        <ul className="grid">
          {(all ? items : items.slice(0, SHOWN)).map((it) => {
            const b = badge(it);
            const name = docName(it.doc);
            return (
              <li key={it.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-border/60 py-3 last:border-0">
                <CategoryIcon category={iconOf(it.doc.seller.taxId, it.doc.category)} className="row-span-2" />
                <Link href={`/documents/${it.id}`} className="truncate text-[15px] font-semibold hover:underline">
                  {name}
                </Link>
                <span className="text-right text-[15px] font-semibold tabular-nums">{baht(it.doc.totals.net)}</span>
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className={cn("rounded-full px-2 py-0.5 font-semibold", b.cls)}>{b.text}</span>
                  {it.doc.dueDate && <span className="tabular-nums">{sd(it.doc.dueDate)}</span>}
                </span>
                <span className="flex flex-none gap-1.5">
                  {payOf.has(digitsOnly(it.doc.seller.taxId)) && (
                    <Button type="button" variant="outline" className="h-10 rounded-full px-3 text-xs pointer-fine:h-8" onClick={() => setPaying(it)}>
                      <QrCode className="size-4" />
                      {t("pay2.pay")}
                    </Button>
                  )}
                  <Button type="button" variant="outline" className="h-10 rounded-full px-3 text-xs pointer-fine:h-8" disabled={busy === it.id} onClick={() => void setPaid(it, true)}>
                    {busy === it.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    {t("dash.markPaid")}
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <Dialog open={!!paying} onOpenChange={(o) => !o && setPaying(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{paying ? docName(paying.doc) : ""}</DialogTitle>
            <DialogDescription className="text-xs">{t("pay2.hint")}</DialogDescription>
          </DialogHeader>
          {paying && payingPay && <PayQr pay={payingPay} amount={amountToPay(paying.doc)} withheld={hasWht(paying.doc) ? whtTax(paying.doc) : undefined} />}
          {paying && (
            <Button
              type="button"
              className="h-11 rounded-full"
              disabled={busy === paying.id}
              onClick={() => {
                const it = paying;
                setPaying(null);
                void setPaid(it, true);
              }}
            >
              <Check className="size-4" />
              {t("pay2.paidNow")}
            </Button>
          )}
        </DialogContent>
      </Dialog>
      {items.length > SHOWN && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          className="press flex h-10 items-center justify-center gap-1 rounded-full text-sm font-medium text-primary hover:bg-primary/10"
        >
          {all ? t("dash.upcomingLess") : t("dash.upcomingMore", { count: items.length - SHOWN })}
          <ChevronDown className={cn("size-4 transition-transform", all && "rotate-180")} aria-hidden />
        </button>
      )}
    </section>
  );
}
