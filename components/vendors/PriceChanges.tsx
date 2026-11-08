"use client";

// 거래처별 가격 변화 (owner 2026-11-08: "같은 재료가 지난달보다 얼마나 올랐는지 한눈에"): per supplier, every item bought in
// the month against the last time it was bought before the month — up / down / same, and how much more (or less) that
// cost this month. Numbers from lib/price-watch priceBoard (pure, tested). Opens at /vendors/prices[?month=YYYY-MM].

import { ArrowDownRight, ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight, ExternalLink, Loader2, Minus, Search, TrendingUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useMonthLabel } from "@/components/ledger/Stickers";
import { useScreenDate } from "@/components/ScreenDate";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { pick, useLedger } from "@/lib/ledger-store";
import { baht, bahtWhole, fromSatang } from "@/lib/money";
import { type PriceChange, priceBoard } from "@/lib/price-watch";
import { todayBangkok } from "@/lib/thai-tax";
import { cn } from "@/lib/utils";

type Show = "all" | "up" | "down";

const shift = (m: string, by: number) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export function PriceChanges() {
  const t = useTranslations("prices");
  const locale = useLocale();
  const monthLabel = useMonthLabel();
  const sd = useScreenDate();
  const { entries, loaded } = useLedger();
  const thisMonth = todayBangkok().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [show, setShow] = useState<Show>("up");
  const [q, setQ] = useState("");
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("month");
    if (m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m)) setMonth(m);
  }, []);

  const docs = useMemo(() => pick(entries, "ledger").map((e) => ({ ...e.doc, id: e.id })), [entries]);
  const board = useMemo(() => priceBoard(docs, month), [docs, month]);
  const vendor = (n: PriceChange["vendorName"]) => (locale === "ja" && n.ja) || (locale === "th" && n.th) || n.en || n.th || n.ja;
  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      board.vendors
        .map((v) => ({
          ...v,
          items: v.items.filter(
            (i) =>
              (show === "all" || (show === "up" ? i.pct > 0 : i.pct < 0)) &&
              (!needle || i.item.toLowerCase().includes(needle) || vendor(v.vendorName).toLowerCase().includes(needle)),
          ),
        }))
        .filter((v) => v.items.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- vendor() only reads the locale
    [board, show, needle, locale],
  );

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-5">
      <header className="grid gap-2">
        <Link href="/vendors" className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground pointer-fine:min-h-6">
          <ArrowLeft className="size-4" aria-hidden />
          {t("back")}
        </Link>
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("title")}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("hint")}</p>
      </header>

      {/* Month */}
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setMonth((m) => shift(m, -1))} className="press grid size-11 place-items-center rounded-full hover:bg-muted" aria-label={t("prev")}>
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <span className="min-w-36 text-center text-[17px] font-semibold">{monthLabel(month)}</span>
        <button type="button" disabled={month >= thisMonth} onClick={() => setMonth((m) => shift(m, 1))} className="press grid size-11 place-items-center rounded-full hover:bg-muted disabled:opacity-30" aria-label={t("next")}>
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>

      {!loaded ? (
        <Loader2 className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" aria-label="Loading" />
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile tone="bad" label={t("paidMore")} value={bahtWhole(fromSatang(board.paidMore))} sub={t("upCount", { count: board.up })} />
            <Tile tone="ok" label={t("saved")} value={bahtWhole(fromSatang(board.saved))} sub={t("downCount", { count: board.down })} />
            <Tile label={t("sameLabel")} value={String(board.same)} sub={t("sameSub")} />
            <Tile label={t("firstLabel")} value={String(board.first)} sub={t("firstSub")} />
          </div>

          {/* Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full bg-muted p-1" role="group" aria-label={t("show")}>
              {(["up", "down", "all"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={show === s}
                  onClick={() => setShow(s)}
                  className={cn("flex h-11 pointer-fine:h-9 items-center gap-1 rounded-full px-3.5 text-sm", show === s ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}
                >
                  {t(`f.${s}`, { count: s === "up" ? board.up : s === "down" ? board.down : board.up + board.down + board.same })}
                </button>
              ))}
            </div>
            <label className="relative block min-w-0 flex-1 basis-56 sm:max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="h-11 rounded-full pl-10" />
            </label>
          </div>

          {shown.length === 0 ? (
            <div className="workspace-panel grid justify-items-center gap-3 px-6 py-14 text-center">
              <span className="intelligence-mark is-soft size-14 text-muted-foreground">
                <TrendingUp className="size-6" aria-hidden />
              </span>
              <p className="text-[15px] text-muted-foreground">{board.vendors.length ? t("noneHere") : t("none")}</p>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {shown.map((v) => (
                <section key={v.vendorTaxId} className="workspace-panel grid content-start gap-1 p-3 sm:p-4">
                  <div className="flex items-baseline justify-between gap-2 px-1 pb-1">
                    <h2 className="min-w-0 truncate text-[15px] font-semibold">{vendor(v.vendorName)}</h2>
                    {v.extra !== 0 && (
                      <span className={cn("flex-none text-[13px] font-semibold tabular-nums", v.extra > 0 ? "text-bad" : "text-ok")}>
                        {v.extra > 0 ? t("vendorMore", { amount: bahtWhole(fromSatang(v.extra)) }) : t("vendorLess", { amount: bahtWhole(fromSatang(-v.extra)) })}
                      </span>
                    )}
                  </div>
                  <ul className="grid">
                    {v.items.map((i) => (
                      <li key={i.item} className="flex items-center gap-3 rounded-xl px-1 py-2 [&+&]:border-t">
                        <span className={cn("grid size-9 flex-none place-items-center rounded-full", i.pct > 0 ? "bg-bad-soft text-bad" : i.pct < 0 ? "bg-ok-soft text-ok" : "bg-muted text-muted-foreground")}>
                          {i.pct > 0 ? <ArrowUpRight className="size-4" aria-hidden /> : i.pct < 0 ? <ArrowDownRight className="size-4" aria-hidden /> : <Minus className="size-4" aria-hidden />}
                        </span>
                        <span className="grid min-w-0 flex-1 gap-0.5">
                          <span className="truncate text-[14px] font-medium">
                            {i.item}
                            {i.unit && <span className="font-normal text-muted-foreground"> / {i.unit}</span>}
                          </span>
                          <span className="text-[12.5px] text-muted-foreground tabular-nums">
                            {baht(fromSatang(i.before))} <span className="text-[11px]">({sd(i.beforeDate)})</span> → <b className="font-semibold text-foreground">{baht(fromSatang(i.now))}</b>{" "}
                            <span className="text-[11px]">({sd(i.date)})</span>
                          </span>
                        </span>
                        <span className="grid flex-none justify-items-end gap-0.5">
                          <span className={cn("rounded-full px-2 py-0.5 text-[13px] font-semibold tabular-nums", i.pct > 0 ? "bg-bad-soft text-bad" : i.pct < 0 ? "bg-ok-soft text-ok" : "bg-muted text-muted-foreground")}>
                            {i.pct > 0 ? `+${i.pct}%` : i.pct < 0 ? `${i.pct}%` : t("same")}
                          </span>
                          {i.extra !== 0 && (
                            <span className="text-[11.5px] text-muted-foreground tabular-nums">
                              {i.extra > 0 ? t("itemMore", { amount: baht(fromSatang(i.extra)) }) : t("itemLess", { amount: baht(fromSatang(-i.extra)) })}
                            </span>
                          )}
                        </span>
                        {i.docId && (
                          <Link href={`/documents/${i.docId}`} className="flex-none rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-primary" aria-label={t("open")}>
                            <ExternalLink className="size-4" aria-hidden />
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">{t("how")}</p>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "bad" | "ok" }) {
  return (
    <div className={cn("grid gap-0.5 rounded-2xl px-4 py-3", tone === "bad" ? "bg-bad-soft" : tone === "ok" ? "bg-ok-soft" : "bg-card shadow-[0_0_0_1px_var(--border)]")}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-[22px] leading-tight font-semibold tabular-nums", tone === "bad" ? "text-bad" : tone === "ok" ? "text-ok" : "")}>{value}</span>
      <span className="text-[11.5px] text-muted-foreground">{sub}</span>
    </div>
  );
}
