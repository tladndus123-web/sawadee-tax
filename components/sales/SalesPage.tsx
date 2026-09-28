"use client";

// Sales: the month's result (sales − purchases), the days of sales by channel, and the two ways to add a day —
// a photo / PDF of the POS closing report (the AI reads it) or typing it in. The sales tax report opens from here.

import { Camera, FileSpreadsheet, FileText, Keyboard, Loader2, Table2, TrendingUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useScreenDate } from "@/components/ScreenDate";
import { useMonthLabel } from "@/components/ledger/Stickers";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { invoiceMonth, NO_DATE } from "@/lib/archive";
import { ALL } from "@/lib/branches";
import { useBranch } from "@/lib/branch-store";
import { useCompany } from "@/lib/company-store";
import { pick, useLedger } from "@/lib/ledger-store";
import { baht } from "@/lib/money";
import { type Channel, monthResult, type Sale, saleMonth } from "@/lib/sales";
import { salePhotoUrl, useSales } from "@/lib/sales-store";
import { todayBangkok } from "@/lib/thai-tax";
import { preparePhoto } from "@/lib/upload-queue";
import { isPdf } from "@/lib/pdf-render";
import { cn } from "@/lib/utils";
import { monthFees } from "@/lib/app-fees";
import { AppFeesCard } from "./AppFeesCard";
import { PosImport } from "./PosImport";
import { type SaleDraft, SaleSheet } from "./SaleSheet";

type Open = { draft: SaleDraft; photo?: File | null; preview?: string | null; unclear?: string[] };

const blank = (date: string, branchId = ""): SaleDraft => ({ branchId, date, channel: "store", docFrom: "", docTo: "", bills: 0, gross: 0, vat: 0, exempt: 0, note: "", source: "manual" });

export function SalesPage() {
  const t = useTranslations();
  const locale = useLocale();
  const sd = useScreenDate();
  const monthLabel = useMonthLabel();
  const company = useCompany();
  const branch = useBranch();
  const branchId = branch === ALL ? "" : branch;
  const { sales, loaded } = useSales();
  const { entries } = useLedger();
  const today = todayBangkok();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [open, setOpen] = useState<Open | null>(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const purchases = useMemo(() => pick(entries, "ledger").map((e) => e.doc), [entries]);
  const months = useMemo(() => {
    const set = new Set<string>([today.slice(0, 7), ...sales.map(saleMonth), ...purchases.map((d) => invoiceMonth(d)).filter((m) => m !== NO_DATE)]);
    return [...set].sort().reverse();
  }, [sales, purchases, today]);
  const r = useMemo(() => monthResult(sales, purchases, month, company.taxId), [sales, purchases, month, company.taxId]);
  const fees = useMemo(() => monthFees(sales, month, company.appFees), [sales, month, company.appFees]);
  const days = useMemo(() => sales.filter((s) => saleMonth(s) === month), [sales, month]);
  const existingFor = (d: SaleDraft) => sales.find((x) => x.date === d.date && x.channel === d.channel && (x.branchId || "") === (d.branchId || "") && x.id !== d.id) ?? null;

  // A closing report: prepare the picture, let the AI read it, then open the sheet to check and save
  const readReport = async (file: File) => {
    setReading(true);
    try {
      const pdf = isPdf(file);
      const prepared = pdf ? file : await preparePhoto(file);
      const body = new FormData();
      body.append("file", prepared, pdf ? file.name : "report.jpg");
      const res = await fetch("/api/extract-sales", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { reading?: SaleDraft & { unclear: string[] }; error?: string };
      if (!res.ok || !json.reading) {
        toast.error(json.error === "notReport" ? t("sales.notReport") : json.error === "rate" ? t("app.rateLimited") : t("sales.readFail"));
        return;
      }
      const { unclear, ...rest } = json.reading;
      const draft: SaleDraft = { ...blank(rest.date || today, branchId), ...rest, source: "photo" };
      setOpen({ draft, photo: prepared, preview: URL.createObjectURL(prepared), unclear });
    } catch {
      toast.error(t("sales.readFail"));
    } finally {
      setReading(false);
    }
  };

  const openSale = async (s: Sale) => {
    const preview = s.photoPath && !s.photoPath.endsWith(".pdf") ? await salePhotoUrl(s.photoPath) : null;
    setOpen({ draft: { ...s }, preview });
  };

  const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("sales.title")}</h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">{t("sales.intro")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" className="h-11 rounded-full px-5 text-[15px]" disabled={reading} onClick={() => fileRef.current?.click()}>
            {reading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
            {reading ? t("sales.reading") : t("sales.addPhoto")}
          </Button>
          <Button type="button" variant="secondary" className="h-11 rounded-full px-4" onClick={() => setImporting(true)}>
            <FileSpreadsheet className="size-4" />
            {t("pos.button")}
          </Button>
          <Button type="button" variant="secondary" className="h-11 rounded-full px-4" onClick={() => setOpen({ draft: blank(today, branchId) })}>
            <Keyboard className="size-4" />
            {t("sales.addManual")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf,.pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void readReport(f);
            }}
          />
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{monthLabel(month)}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/sales/pl" className="press inline-flex h-10 items-center gap-2 rounded-full bg-secondary px-4 text-sm font-medium">
            <Table2 className="size-4 text-brand" aria-hidden />
            {t("pl.title")}
          </Link>
          <Link href={`/sales/report/${month}`} className="press inline-flex h-10 items-center gap-2 rounded-full bg-secondary px-4 text-sm font-medium">
            <FileText className="size-4 text-bad" aria-hidden />
            {t("sales.report")}
          </Link>
          <select className="h-10 rounded-xl border bg-background px-3 text-sm" value={month} onChange={(e) => setMonth(e.target.value)} aria-label={t("dash.month")}>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* The month's result */}
      <section className="workspace-panel grid gap-4 p-5 sm:p-6" aria-label={t("sales.result")}>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="size-4 text-brand" aria-hidden />
          {t("sales.result")}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Fact label={t("sales.salesValue")} value={baht(r.salesValue)} sub={t("sales.salesSub", { gross: baht(r.salesGross), days: r.days })} />
          <Fact label={t("sales.cost")} value={baht(r.purchasesCost)} sub={t("sales.costSub", { gross: baht(r.purchasesGross) })} />
          <Fact label={t("sales.profit")} value={baht(r.profit)} sub={r.salesValue ? t("sales.margin", { pct: pct.format(r.margin) }) : "—"} tone={r.profit < 0 ? "bad" : "brand"} />
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t pt-3 text-sm">
          <span className="text-muted-foreground">{t("sales.vatLine")}</span>
          <span className="tabular-nums">
            {baht(r.salesVat)} − {baht(r.claimableVat)} = <b className={r.vatPayable < 0 ? "text-ok" : ""}>{baht(r.vatPayable)}</b>
          </span>
          <span className="text-xs text-muted-foreground">{r.vatPayable < 0 ? t("sales.vatCredit") : t("sales.vatPay")}</span>
        </div>
        {r.byChannel.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {r.byChannel.map((c) => (
              <span key={c.channel} className="rounded-full bg-muted px-3 py-1 text-xs">
                {t(`sales.ch.${c.channel}`)} <b className="tabular-nums">{baht(c.gross)}</b>
              </span>
            ))}
          </div>
        )}
        {fees.fee > 0 && (
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="text-muted-foreground">{t("fees.afterFee")}</span>
            <b className={cn("tabular-nums", r.profit - fees.fee < 0 ? "text-bad" : "text-brand")}>{baht(r.profit - fees.fee)}</b>
          </p>
        )}
        <p className="text-[11px] leading-relaxed text-muted-foreground">{t("sales.resultNote")}</p>
      </section>

      {/* Delivery apps: commission and payout (shown once the month has app sales) */}
      {fees.lines.length > 0 && <AppFeesCard f={fees} />}

      {/* Days */}
      <section className="grid gap-2" aria-label={t("sales.days")}>
        {!loaded ? (
          <Loader2 className="mx-auto my-8 size-5 animate-spin text-muted-foreground" aria-label="Loading" />
        ) : days.length === 0 ? (
          <div className="workspace-panel grid justify-items-center gap-2 px-6 py-12 text-center">
            <p className="text-[15px] text-muted-foreground">{t("sales.empty")}</p>
          </div>
        ) : (
          days.map((s) => (
            <button key={s.id} type="button" onClick={() => void openSale(s)} className="workspace-panel tap-row flex items-center gap-3 p-4 text-left">
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                  {sd(s.date)}
                  <ChannelChip channel={s.channel} label={t(`sales.ch.${s.channel}`)} />
                </span>
                <span className="text-xs text-muted-foreground">
                  {[s.docFrom && `${s.docFrom} – ${s.docTo}`, s.bills ? t("sales.billsN", { count: s.bills }) : ""].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
              <span className="grid text-right">
                <span className="text-[15px] font-semibold tabular-nums">{baht(s.gross)}</span>
                <span className="text-xs text-muted-foreground tabular-nums">VAT {baht(s.vat)}</span>
              </span>
            </button>
          ))
        )}
      </section>

      {importing && <PosImport existing={sales} onClose={() => setImporting(false)} />}
      {open && (
        <SaleSheet
          key={open.draft.id ?? "new"}
          draft={open.draft}
          photo={open.photo}
          preview={open.preview}
          unclear={open.unclear}
          existing={open.draft.id ? null : existingFor(open.draft)}
          onClose={() => {
            if (open.preview?.startsWith("blob:")) URL.revokeObjectURL(open.preview);
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}

function Fact({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "brand" | "bad" }) {
  return (
    <div className="grid gap-0.5 rounded-2xl bg-muted/60 px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-[22px] font-semibold tracking-tight tabular-nums", tone === "brand" && "text-brand", tone === "bad" && "text-bad")}>{value}</span>
      <span className="text-[11px] text-muted-foreground">{sub}</span>
    </div>
  );
}

function ChannelChip({ channel, label }: { channel: Channel; label: string }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", channel === "store" ? "bg-brand-soft text-brand" : "bg-muted text-foreground")}>{label}</span>
  );
}
