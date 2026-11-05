"use client";

// The calendar screen's upgrade (owner, 2026-11-06: "심심하지 않게, AI로"): the next deadline big with how ready it is,
// this week's three things from the AI, the month's money going out (by kind and week, with a warning when the next
// week needs more than the last week brought in), a sentence that becomes a date, and the phone-calendar link.

import { AlarmClock, ArrowRight, Calendar, Loader2, Lock, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import type { AiEvent } from "@/lib/assistant";
import { bahtWhole } from "@/lib/money";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// ── Next deadline ────────────────────────────────────────────────────────────────────────────────────────────────

export function NextDeadline({
  title,
  date,
  daysLeft,
  amount,
  ready,
  href,
  then = [],
}: {
  title: string;
  date: string;
  daysLeft: number;
  /** Baht to pay (estimated), when known */
  amount: number | null;
  /** Documents checked out of all, for the VAT return */
  ready: { checked: number; total: number } | null;
  href?: string;
  /** The dates after it (title, date text, days left, dot colour) — a short timeline under the card */
  then?: { key: string; title: string; date: string; daysLeft: number; dot: string }[];
}) {
  const t = useTranslations("calendar.x");
  const late = daysLeft < 0;
  const pct = ready && ready.total ? Math.round((ready.checked / ready.total) * 100) : null;
  return (
    <section className={cn("workspace-panel relative grid content-start gap-4 overflow-hidden p-5 sm:p-6", late && "ring-1 ring-bad/30 dark:ring-bad/25")} aria-label={t("nextTitle")}>
      <span className={cn("pointer-events-none absolute -top-24 -right-24 size-60 rounded-full blur-3xl", late ? "bg-bad/10 dark:bg-bad/8" : "bg-primary/10")} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <span className={cn("flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold", late ? "bg-bad-soft text-bad" : "bg-primary/10 text-primary")}>
            <AlarmClock className="size-3.5" aria-hidden />
            {t("nextTitle")}
          </span>
          <p className="text-[19px] leading-snug font-semibold text-pretty">{title}</p>
          <span className="text-[13px] text-muted-foreground">{date}</span>
        </div>
        <div
          className={cn(
            "grid min-w-[76px] flex-none justify-items-center rounded-2xl px-4 py-2.5 text-center shadow-sm",
            late ? "bg-bad text-white dark:bg-bad/85" : daysLeft <= 3 ? "bg-warn text-white dark:bg-warn/85" : "bg-primary text-primary-foreground",
          )}
        >
          <span className="text-[11px] font-semibold opacity-90">{late ? t("lateLabel") : daysLeft === 0 ? t("todayLabel") : "D-DAY"}</span>
          <b className="text-[30px] leading-none font-bold tabular-nums">{late ? `+${-daysLeft}` : daysLeft === 0 ? "!" : daysLeft}</b>
        </div>
      </div>
      {amount !== null && (
        <div className="flex items-baseline justify-between gap-3 rounded-2xl border border-border/60 bg-muted/40 px-4 py-3">
          <span className="text-[13px] text-muted-foreground">{amount < 0 ? t("refund") : t("toPay")}</span>
          <b className="text-[22px] tabular-nums">{bahtWhole(Math.abs(amount))}</b>
        </div>
      )}
      {ready && ready.total > 0 && pct !== null && (
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="font-medium">{t("ready")}</span>
            <span className="text-muted-foreground tabular-nums">{t("readyLine", { done: ready.checked, total: ready.total })}</span>
          </div>
          <span className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <span className={cn("block h-full rounded-full transition-[width]", pct === 100 ? "bg-ok" : "bg-primary")} style={{ width: `${pct}%` }} />
          </span>
          {ready.total > ready.checked && (
            <span className="text-[12px] text-warn">{t("toCheck", { n: ready.total - ready.checked })}</span>
          )}
        </div>
      )}
      {href && (
        <Button asChild className="h-10 w-fit rounded-full px-4">
          <Link href={href}>
            {t("prepare")}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      )}
      {then.length > 0 && (
        <div className="grid gap-2 border-t border-border/60 pt-3.5">
          <span className="text-[12px] font-semibold text-muted-foreground">{t("thenTitle")}</span>
          <ol className="relative grid gap-2.5 before:absolute before:top-2 before:bottom-2 before:left-[4.5px] before:w-px before:bg-border">
            {then.map((i) => (
              <li key={i.key} className="relative flex items-center gap-3 pl-0">
                <span className={cn("relative size-2.5 flex-none rounded-full ring-4 ring-card", i.dot)} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[13.5px]">{i.title}</span>
                <span className="flex-none text-[12px] text-muted-foreground tabular-nums">{i.date}</span>
                <span className={cn("w-12 flex-none text-right text-[12px] font-semibold tabular-nums", i.daysLeft < 0 ? "text-bad" : i.daysLeft <= 3 ? "text-warn" : "text-muted-foreground")}>
                  {i.daysLeft < 0 ? `+${-i.daysLeft}` : i.daysLeft === 0 ? t("todayLabel") : `D-${i.daysLeft}`}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

// ── This week from the AI ────────────────────────────────────────────────────────────────────────────────────────

interface Brief {
  summary: string;
  items: { title: string; why: string; link: string }[];
}

export function WeekBrief({ canAi }: { canAi: boolean }) {
  const t = useTranslations("calendar.x");
  const locale = useLocale();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "none" | "fail">("loading");
  useEffect(() => {
    if (!canAi) return;
    let live = true;
    void fetch("/api/calendar/brief", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang: locale }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { body?: Brief | null }) => live && (j.body ? (setBrief(j.body), setState("ok")) : setState("none")))
      .catch(() => live && setState("fail"));
    return () => void (live = false);
  }, [canAi, locale]);
  return (
    <section className="workspace-panel ai-ring grid content-start gap-3 p-5 sm:p-6" aria-label={t("briefTitle")}>
      <span className="flex items-center gap-2 text-[13px] font-semibold text-primary">
        <Sparkles className="size-4" aria-hidden />
        {t("briefTitle")}
      </span>
      {!canAi ? (
        <p className="text-[14px] text-muted-foreground">{t("briefAdmins")}</p>
      ) : state === "loading" ? (
        <div className="grid gap-2.5" aria-busy>
          <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("briefMaking")}
          </span>
          {[1, 2, 3].map((n) => (
            <span key={n} className="h-11 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : state === "ok" && brief ? (
        <>
          {brief.summary && <p className="text-[14px] leading-relaxed text-pretty text-foreground/80">{brief.summary}</p>}
          <ol className="grid gap-2">
            {brief.items.map((i, n) => {
              const body = (
                <>
                  <span className={cn("grid size-7 flex-none place-items-center rounded-full text-[13px] font-bold", n === 0 ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")}>{n + 1}</span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <b className="text-[14.5px] leading-snug">{i.title}</b>
                    {i.why && <span className="text-[12.5px] leading-snug text-muted-foreground">{i.why}</span>}
                  </span>
                  {i.link && <ArrowRight className="mt-1 size-4 flex-none text-muted-foreground" aria-hidden />}
                </>
              );
              return (
                <li key={n}>
                  {i.link ? (
                    <Link href={i.link} className="press flex items-start gap-3 rounded-2xl bg-muted/50 px-3.5 py-3 hover:bg-muted">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-3 rounded-2xl bg-muted/50 px-3.5 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <p className="text-[14px] text-muted-foreground">{state === "fail" ? t("briefFail") : t("briefNone")}</p>
      )}
    </section>
  );
}

// ── Money going out this month ───────────────────────────────────────────────────────────────────────────────────

/** ฿45k, ฿1.2k, ฿850 — for small spaces (calendar days, week bars) */
export const compactBaht = (v: number) => {
  const a = Math.abs(v);
  return a >= 1000 ? `฿${(a / 1000).toFixed(a >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k` : bahtWhole(a);
};

export type OutKind = "tax" | "bill" | "event";
const OUT_COLOR: Record<OutKind, string> = { tax: "bg-primary", bill: "bg-bad", event: "bg-[#7c5cff]" };

export function MoneyOut({
  monthName,
  byKind,
  weeks,
  nextWeek,
  lastWeekSales,
}: {
  monthName: string;
  byKind: Record<OutKind, number>;
  /** Week 1…5 of the month, baht */
  weeks: number[];
  /** Baht due in the next 7 days, and what the last 7 days of sales brought in (with VAT) */
  nextWeek: number;
  lastWeekSales: number | null;
}) {
  const t = useTranslations("calendar.x");
  const total = byKind.tax + byKind.bill + byKind.event;
  const max = Math.max(1, ...weeks);
  const short = lastWeekSales !== null && nextWeek > 0 && nextWeek > lastWeekSales;
  return (
    <section className="workspace-panel grid gap-4 p-5 sm:p-6" aria-label={t("outTitle", { month: monthName })}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-0.5">
          <span className="text-[13px] font-semibold text-muted-foreground">{t("outTitle", { month: monthName })}</span>
          <b className="text-[28px] leading-tight font-bold tabular-nums">{bahtWhole(total)}</b>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
          {(["tax", "bill", "event"] as const).map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full", OUT_COLOR[k])} aria-hidden />
              <span className="text-muted-foreground">{t(`out.${k}`)}</span>
              <b className="tabular-nums">{bahtWhole(byKind[k])}</b>
            </li>
          ))}
        </ul>
      </div>
      {total > 0 && (
        <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={t("outTitle", { month: monthName })}>
          {(["tax", "bill", "event"] as const).map((k) => (byKind[k] > 0 ? <span key={k} className={cn("h-full", OUT_COLOR[k])} style={{ width: `${(byKind[k] / total) * 100}%` }} /> : null))}
        </div>
      )}
      {/* By week */}
      <div className="grid grid-cols-5 items-end gap-2 sm:gap-3">
        {weeks.map((v, i) => (
          <div key={i} className="grid justify-items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground tabular-nums">{v ? compactBaht(v) : "—"}</span>
            <span className="flex h-20 w-full items-end overflow-hidden rounded-xl bg-muted/60">
              <span className="w-full rounded-xl bg-gradient-to-t from-primary to-primary/60" style={{ height: `${(v / max) * 100}%` }} />
            </span>
            <span className="text-[11.5px] font-medium text-muted-foreground">{t("week", { n: i + 1 })}</span>
          </div>
        ))}
      </div>
      {short && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl bg-warn-soft px-3.5 py-2.5 text-[13px] text-foreground">
          <TriangleAlert className="mt-0.5 size-4 flex-none text-warn" aria-hidden />
          {t("shortWarn", { out: bahtWhole(nextWeek), sales: bahtWhole(lastWeekSales ?? 0) })}
        </p>
      )}
    </section>
  );
}

// ── A sentence becomes a date ────────────────────────────────────────────────────────────────────────────────────

export function SpeakAdd({ onEvent }: { onEvent: (e: AiEvent) => void }) {
  const t = useTranslations("calendar.x");
  const locale = useLocale();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/calendar/parse", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, lang: locale }) });
      const j = (await res.json().catch(() => ({}))) as { event?: AiEvent; error?: string };
      if (j.event) {
        onEvent(j.event);
        setText("");
      } else toast.error(j.error === "none" ? t("speakNone") : j.error === "rate" ? t("speakRate") : t("speakFail"));
    } catch {
      toast.error(t("speakFail"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={go} className="workspace-panel ai-ring flex flex-wrap items-center gap-2 p-2.5 pl-4">
      <Wand2 className="size-5 flex-none text-primary" aria-hidden />
      <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={t("speakPh")} aria-label={t("speakLabel")} className="h-11 min-w-0 flex-1 border-0 bg-transparent px-1 text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent" />
      <Button type="submit" className="h-10 rounded-full px-4" disabled={busy || !text.trim()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {t("speakGo")}
      </Button>
    </form>
  );
}

// ── Phone calendar (iCal) ────────────────────────────────────────────────────────────────────────────────────────

/** The connect dialog. `url` is empty while the address is still loading. */
export function PhoneCalendarDialog({
  onClose,
  url,
  busy,
  onCopy,
  onRenew,
}: {
  onClose: () => void;
  url: string;
  busy: boolean;
  onCopy: () => void;
  onRenew: () => void;
}) {
  const t = useTranslations("calendar.x");
  const webcal = url.replace(/^https?:/, "webcal:");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-0 overflow-x-clip rounded-2xl p-0 shadow-lg sm:max-w-sm">
        <div className="grid min-w-0 gap-4 px-5 pt-5 pb-4">
          <div className="flex min-w-0 items-start gap-3 pr-8">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden>
              <Calendar className="size-5" />
            </span>
            <DialogHeader className="min-w-0 gap-1">
              <DialogTitle className="text-left text-[17px] leading-tight font-semibold">{t("icalTitle")}</DialogTitle>
              <DialogDescription className="text-left text-[13.5px] leading-relaxed text-pretty">{t("icalSub")}</DialogDescription>
            </DialogHeader>
          </div>
          {!url ? (
            <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            <>
              <Button asChild className="h-12 w-full min-w-0 rounded-xl text-[15px] font-semibold">
                <a href={webcal}>{t("icalOpen")}</a>
              </Button>
              <div className="grid min-w-0 gap-2">
                <p className="text-[13px] text-muted-foreground">{t("icalGoogleLabel")}</p>
                <div className="flex min-w-0 items-center gap-2 overflow-hidden rounded-xl bg-muted p-1.5 pl-3 ring-1 ring-foreground/10 dark:bg-black/40">
                  <code className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{url}</code>
                  <Button type="button" variant="outline" className="h-10 shrink-0 rounded-lg bg-popover px-3 font-medium text-primary" onClick={onCopy}>
                    {t("icalCopy")}
                  </Button>
                </div>
                <p className="text-[13px] leading-snug text-muted-foreground">{t("icalIphone")}</p>
                <p className="text-[13px] leading-snug text-muted-foreground">{t("icalGoogle")}</p>
              </div>
              <p className="flex min-w-0 items-start gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-[13px] leading-snug text-foreground">
                <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0">{t("icalSecret")}</span>
              </p>
            </>
          )}
        </div>
        <DialogFooter className="mx-0 mb-0 min-w-0 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-none bg-transparent px-5 py-3 sm:flex-row sm:justify-between">
          <p className="min-w-0 text-[13px] text-muted-foreground">{t("icalRenewHint")}</p>
          <Button type="button" variant="ghost" className="h-10 shrink-0 px-2 text-[13px] font-medium text-bad hover:text-bad" disabled={busy || !url} onClick={onRenew}>
            {t("icalRenew")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PhoneCalendar({ onClose }: { onClose: () => void }) {
  const t = useTranslations("calendar.x");
  const locale = useLocale();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async (fresh: boolean) => {
    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc("calendar_feed_token", { p_new: fresh, p_which: 1 });
    setBusy(false);
    if (error) return void toast.error(t("icalFail"));
    setToken(data as string);
    if (fresh) toast.success(t("icalRenewed"));
  };
  useEffect(() => void load(false), []); // eslint-disable-line react-hooks/exhaustive-deps -- once
  const url = token ? `${window.location.origin}/api/calendar/feed?t=${token}&lang=${locale}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("icalCopied"));
    } catch {
      toast.error(t("icalFail"));
    }
  };
  return (
    <PhoneCalendarDialog
      onClose={onClose}
      url={url}
      busy={busy}
      onCopy={() => void copy()}
      onRenew={() => {
        if (window.confirm(t("icalRenewAsk"))) void load(true);
      }}
    />
  );
}
