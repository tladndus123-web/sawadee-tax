"use client";

import { AlertTriangle, CircleCheck, Clock, Loader2, Receipt, Undo2, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { monthKey } from "@/lib/archive";
import { useCompany } from "@/lib/company-store";
import { type DueItem, summarize, trend, upcoming } from "@/lib/dashboard";
import { exportLang } from "@/lib/export";
import { pick, setQuick, useLedger } from "@/lib/ledger-store";
import { baht } from "@/lib/money";
import { dmy, todayBangkok } from "@/lib/thai-tax";
import { cn } from "@/lib/utils";
import { useMonthLabel } from "@/components/ledger/Stickers";
import { ActivityList } from "./ActivityList";

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
  const docs = useMemo(() => pick(entries, "ledger").map((e) => ({ id: e.id, doc: e.doc })), [entries]);
  const months = useMemo(() => {
    const set = new Set([thisMonth, ...docs.map((d) => monthKey(d.doc)).filter((k) => k !== "none")]);
    return [...set].sort().reverse();
  }, [docs, thisMonth]);
  const [month, setMonth] = useState(thisMonth);

  const s = useMemo(() => summarize(docs, month, company.taxId, today), [docs, month, company.taxId, today]);
  const due = useMemo(() => upcoming(docs, today), [docs, today]);
  const points = useMemo(() => trend(docs, month), [docs, month]);

  if (!loaded) return <Loader2 className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" aria-label="Loading" />;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{monthLabel(month)}</h2>
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
        <DueList items={due} />
        <TrendChart data={points} active={month} />
      </div>

      <ActivityList limit={8} />
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
          "num-in text-[clamp(1.05rem,4.6vw,1.5rem)] leading-tight font-semibold tracking-tight whitespace-nowrap tabular-nums",
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
function DueList({ items }: { items: DueItem[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const lang = exportLang(locale);
  const [busy, setBusy] = useState<string | null>(null);

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
      <div>
        <h2 id="due-title" className="text-lg font-semibold tracking-tight">
          {t("dash.upcoming")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("dash.upcomingHint")}</p>
      </div>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-ok" aria-hidden />
          {t("dash.upcomingEmpty")}
        </p>
      ) : (
        <ul className="grid">
          {items.slice(0, 8).map((it) => {
            const b = badge(it);
            const name = it.doc.seller.name[lang] || it.doc.seller.name.en || it.doc.seller.name.th || it.doc.docNo;
            return (
              <li key={it.id} className="flex min-w-0 items-center gap-3 border-b border-border/60 py-2.5 last:border-0">
                <Link href={`/documents/${it.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className={cn("rounded-full px-2 py-0.5 font-semibold", b.cls)}>{b.text}</span>
                    {it.doc.dueDate && <span className="tabular-nums">{dmy(it.doc.dueDate)}</span>}
                  </span>
                </Link>
                <span className="text-sm font-semibold tabular-nums">{baht(it.doc.totals.net)}</span>
                <Button type="button" variant="secondary" className="h-9 rounded-full px-3" disabled={busy === it.id} onClick={() => void setPaid(it, true)}>
                  {busy === it.id ? <Loader2 className="size-4 animate-spin" /> : <CircleCheck className="size-4 text-ok" />}
                  <span className="max-sm:sr-only">{t("dash.markPaid")}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
