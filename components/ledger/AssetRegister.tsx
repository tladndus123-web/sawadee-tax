"use client";

// Equipment being written off (lib/cost-split assetRegister): cost, written off so far, what is left, and when it
// ends. "Sold / thrown away" stops the depreciation and puts what is left into that month — only into an open
// month (the database refuses a closed one, so filed figures never move).

import { ChevronLeft, Loader2, PackageX, Refrigerator, Undo2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useScreenDate } from "@/components/ScreenDate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { useCompany } from "@/lib/company-store";
import { type AssetRow, assetRegister } from "@/lib/cost-split";
import { exportLang } from "@/lib/export";
import { pick, setDisposed, useLedger } from "@/lib/ledger-store";
import { isMonthLocked } from "@/lib/month-lock-store";
import { baht, fromSatang } from "@/lib/money";
import { todayBangkok } from "@/lib/thai-tax";
import { cn } from "@/lib/utils";

export function AssetRegister() {
  const t = useTranslations("assets");
  const company = useCompany();
  const { entries, loaded } = useLedger();
  const month = todayBangkok().slice(0, 7);
  const rows = useMemo(() => assetRegister(pick(entries, "ledger").map((e) => e.doc), month, company.taxId), [entries, month, company.taxId]);
  const sum = (k: "cost" | "writtenOff" | "bookValue") => fromSatang(rows.reduce((a, r) => a + r[k], 0));

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5">
      <Button asChild variant="ghost" className="-ml-3 w-fit text-primary">
        <Link href="/ledger">
          <ChevronLeft className="size-4" />
          {t("back")}
        </Link>
      </Button>
      <header className="grid gap-1">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("title")}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("intro")}</p>
      </header>

      {!loaded ? (
        <Loader2 className="mx-auto my-10 size-6 animate-spin text-muted-foreground" aria-label="Loading" />
      ) : rows.length === 0 ? (
        <div className="workspace-panel grid justify-items-center gap-3 px-6 py-14 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-emerald-500/12 text-emerald-700 dark:text-emerald-400">
            <Refrigerator className="size-6" aria-hidden />
          </span>
          <p className="max-w-sm text-[15px] text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Total label={t("cost")} value={baht(sum("cost"))} />
            <Total label={t("writtenOff")} value={baht(sum("writtenOff"))} />
            <Total label={t("bookValue")} value={baht(sum("bookValue"))} strong />
          </div>
          <ul className="grid gap-3">
            {rows.map((r) => (
              <AssetCard key={r.doc.id ?? r.doc.docNo} r={r} />
            ))}
          </ul>
        </>
      )}
      <p className="text-[11px] leading-relaxed text-muted-foreground">{t("note")}</p>
    </div>
  );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="workspace-panel grid min-w-0 gap-0.5 px-3 py-3">
      <span className="truncate text-[11px] text-muted-foreground">{label}</span>
      <span className={cn("truncate text-[13px] font-semibold tabular-nums sm:text-[15px]", strong && "text-brand")}>{value}</span>
    </div>
  );
}

function AssetCard({ r }: { r: AssetRow }) {
  const t = useTranslations("assets");
  const locale = useLocale();
  const lang = exportLang(locale);
  const sd = useScreenDate();
  const [asking, setAsking] = useState(false);
  const [date, setDate] = useState(todayBangkok());
  const [busy, setBusy] = useState(false);
  const d = r.doc;
  const what = d.items.map((i) => i.desc[lang] || i.desc.en || i.desc.th).find(Boolean) || d.seller.name[lang] || d.seller.name.en || d.docNo || "—";
  const seller = d.seller.name[lang] || d.seller.name.en || d.seller.name.th;
  const pct = r.cost ? Math.round((r.writtenOff / r.cost) * 100) : 0;

  const save = async (value: string) => {
    setBusy(true);
    try {
      if (!d.id) return;
      await setDisposed(d.id, value);
      toast.success(value ? t("disposed") : t("undone"));
      setAsking(false);
    } catch (e) {
      toast.error(isMonthLocked(e) ? t("locked") : t("fail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="workspace-panel grid gap-3 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 flex-none place-items-center rounded-2xl bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" aria-hidden>
          <Refrigerator className="size-5" />
        </span>
        <Link href={`/documents/${d.id}`} className="grid min-w-0 flex-1 gap-0.5 hover:underline">
          <span className="line-clamp-2 text-[15px] leading-snug font-semibold break-words">{what}</span>
          <span className="truncate text-xs text-muted-foreground">
            {[seller, d.date && sd(d.date), t("years", { count: d.depYears })].filter(Boolean).join(" · ")}
          </span>
        </Link>
        <State r={r} />
      </div>

      <div className="grid gap-1.5">
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("writtenOff")}>
          <div className={cn("h-full rounded-full", r.state === "disposed" ? "bg-muted-foreground/40" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <span className="grid gap-0.5">
            <span className="text-muted-foreground">{t("cost")}</span>
            <span className="font-semibold tabular-nums">{baht(fromSatang(r.cost))}</span>
          </span>
          <span className="grid gap-0.5">
            <span className="text-muted-foreground">{t("monthly")}</span>
            <span className="font-semibold tabular-nums">{r.state === "active" ? baht(fromSatang(r.monthly)) : "–"}</span>
          </span>
          <span className="grid gap-0.5 text-right">
            <span className="text-muted-foreground">{t("bookValue")}</span>
            <span className="font-semibold text-brand tabular-nums">{baht(fromSatang(r.bookValue))}</span>
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {r.state === "disposed" ? t("disposedOn", { date: sd(d.disposedOn) }) : r.state === "done" ? t("doneOn", { month: r.endsIn }) : t("endsIn", { month: r.endsIn })}
        </p>
      </div>

      {r.state === "disposed" ? (
        <Button type="button" variant="ghost" className="h-9 w-fit rounded-full px-3 text-[13px]" disabled={busy} onClick={() => void save("")}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
          {t("undo")}
        </Button>
      ) : asking ? (
        <div className="grid gap-2 rounded-2xl bg-muted/50 p-3">
          <p className="text-xs leading-relaxed text-muted-foreground">{t("askHint", { value: baht(fromSatang(r.bookValue)) })}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={date} min={d.date || undefined} max={todayBangkok()} onChange={(e) => setDate(e.target.value)} className="h-10 w-auto bg-background" aria-label={t("date")} />
            <Button type="button" variant="ghost" className="rounded-full" disabled={busy} onClick={() => setAsking(false)}>
              {t("cancel")}
            </Button>
            <Button type="button" className="rounded-full" disabled={busy || !date} onClick={() => void save(date)}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {t("confirm")}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" className="h-9 w-fit rounded-full px-3 text-[13px]" onClick={() => setAsking(true)}>
          <PackageX className="size-4" />
          {t("dispose")}
        </Button>
      )}
    </li>
  );
}

function State({ r }: { r: AssetRow }) {
  const t = useTranslations("assets");
  const cls = r.state === "active" ? "bg-ok-soft text-ok" : "bg-muted text-muted-foreground";
  return <span className={cn("flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold", cls)}>{t(`state.${r.state}`)}</span>;
}
