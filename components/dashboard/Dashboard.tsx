"use client";

import { AlertTriangle, ChevronDown, ChevronRight, CircleCheck, Clock, Loader2, Receipt, TrendingUp, Undo2, Wallet, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useScreenDate } from "@/components/ScreenDate";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { monthKey } from "@/lib/archive";
import { useCompany } from "@/lib/company-store";
import { type Doc, type DueItem, summarize, trend, upcoming } from "@/lib/dashboard";
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
import { ActivityList } from "./ActivityList";
import { BranchTable } from "./BranchTable";
import { TeamCard } from "./TeamCard";
import { UncheckedList } from "./UncheckedList";
import { useDocName } from "@/components/ledger/doc-name";
import { VatCard } from "./VatCard";
import { monthLabor } from "@/lib/cost-control";
import { useLabor } from "@/lib/labor-store";
import { fixedForMonth } from "@/lib/fixed-costs";
import { useFixedCosts } from "@/lib/fixed-store";

// The chart library (recharts) is the heaviest part of this page: load it after the numbers are on screen
const TrendChart = dynamic(() => import("./TrendChart").then((m) => m.TrendChart), {
  ssr: false,
  loading: () => <div className="workspace-panel h-[330px] animate-pulse" aria-hidden />,
});

/** Step 8 dashboard: the 4 summary tiles, bills due soon (mark paid here), 6-month trend, recent activity. */
export function Dashboard() {
  const t = useTranslations();
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
  const points = useMemo(() => trend(docs, month), [docs, month]);
  const { sales } = useSales();
  const { lines: labor } = useLabor();
  const { lines: fixed } = useFixedCosts();
  const isAdmin = useMe().role === "admin";
  const allBranches = useBranch() === ALL;
  const branchCount = useBranches().branches.length;
  // Several branches seen together: the combined board carries the profit, so the single line steps aside
  const combined = allBranches && branchCount > 1;
  const result = useMemo(() => monthResult(sales, docs.map((d) => d.doc), month, company.taxId, monthLabor(labor, month), fixedForMonth(fixed, month)), [sales, docs, month, company.taxId, labor, fixed]);
  const hasSales = result.days > 0;
  const purchases = useMemo(() => docs.map((d) => d.doc), [docs]);

  if (!loaded) return <Loader2 className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" aria-label="Loading" />;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight">{monthLabel(month)}</h2>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {t("dash.month")}
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 rounded-full border bg-card px-3 text-sm text-foreground">
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* The one number owners ask first: what is left this month (same figure as the sales page) */}
      {!combined && (
      <Link href="/sales" className="workspace-panel tap-row flex items-center gap-3 px-4 py-3.5 sm:px-5">
        <span className="intelligence-mark is-soft size-10 flex-none">
          <TrendingUp className="size-4 text-brand" aria-hidden />
        </span>
        {/* title, the amount under it, then the sum in whole baht: each gets the full width, so nothing wraps or cuts on a phone */}
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-xs font-medium text-muted-foreground">{t("dash.profitTitle")}</span>
          {hasSales ? (
            <>
              <span className={cn("text-[clamp(1.15rem,5.2vw,1.5rem)] leading-tight font-semibold whitespace-nowrap tabular-nums", result.profit < 0 ? "text-bad" : "text-brand")}>
                {baht(result.profit)}
              </span>
              <span className="truncate text-xs text-muted-foreground tabular-nums" title={t("dash.profitLine", { sales: baht(result.salesValue), cost: baht(result.purchasesCost) })}>
                {t("dash.profitLine", { sales: bahtWhole(result.salesValue), cost: bahtWhole(result.purchasesCost) })}
              </span>
            </>
          ) : (
            <span className="text-xs text-primary">{t("dash.profitEmpty")}</span>
          )}
        </span>
        <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden />
      </Link>
      )}

      {/* The office's in-tray: what staff and the LINE bot saved and nobody has looked at */}
      {isAdmin && <UncheckedList />}

      {/* What owners watch first: food, labour and rent against sales (FL / FLR) */}
      <CostCard month={month} salesValue={result.salesValue} purchases={purchases} fixed={fixed} />

      {/* Several branches, looking at all of them: each one's month side by side */}
      {allBranches && <BranchTable month={month} companyTaxId={company.taxId} />}

      {/* Phones, until installed or closed: put the app on the home screen */}
      <InstallCard compact />

      {/* The four tiles of PROMPT §3 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={Receipt} label={t("app.sTotal")} value={baht(s.total)} note={t("dash.monthDocs", { count: s.count })} />
        <Tile
          icon={Wallet}
          label={t("app.sVat")}
          value={baht(s.claimableVat)}
          tone="brand"
          note={
            company.taxId ? (
              t("app.sVatNote")
            ) : (
              <Link href="/settings" className="text-primary hover:underline">
                {t("dash.companyMissing")}
              </Link>
            )
          }
        />
        <Tile
          icon={Clock}
          label={t("app.sUnpaid")}
          value={baht(s.unpaid)}
          tone={s.overdueCount ? "bad" : undefined}
          note={
            <>
              {t("dash.unpaidCount", { count: s.unpaidCount })}
              {s.overdueCount > 0 && <span className="font-semibold text-bad"> · {t("dash.overdueCount", { count: s.overdueCount })}</span>}
            </>
          }
        />
        <Tile icon={AlertTriangle} label={t("app.sCheck")} value={String(s.toCheck)} tone={s.toCheck ? "warn" : undefined} note={t("dash.checkHint")} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <DueList items={due} docs={docs} />
        <TrendChart data={points} active={month} />
      </div>

      {/* The VAT return that is due next: still here, after the costs */}
      <VatCard entries={entries} companyTaxId={company.taxId} today={today} />

      {/* Admins: who did what this month */}
      {isAdmin && <TeamCard month={month} />}

      <ActivityList limit={5} />
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
  value: string;
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
          // Shrinks with the screen so "฿ 162,105.00" stays on one line in a two-column phone grid
          "num-in text-[clamp(1.15rem,5.2vw,1.625rem)] leading-tight font-semibold tracking-tight whitespace-nowrap tabular-nums",
          tone === "brand" && "text-brand",
          tone === "bad" && "text-bad",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </span>
      {note && <span className="text-[11px] leading-snug text-muted-foreground">{note}</span>}
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
                <Button type="button" variant="outline" className="h-8 flex-none rounded-full px-3 text-xs" disabled={busy === it.id} onClick={() => void setPaid(it, true)}>
                  {busy === it.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {t("dash.markPaid")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
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
