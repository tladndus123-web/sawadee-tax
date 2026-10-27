"use client";

// The tax calendar (owner, 2026-10-28; ported 2026-10-27): a month grid and the list of what is coming — Thai tax
// deadlines, staff papers running out, bills by their due date and the company's own dates (lib/company-calendar).
// Admins only (owner's choice: money owed and staff visas); they tick items off and add, change or remove company
// dates; a closed month's VAT return shows as done by itself.

import { BadgeCheck, CalendarPlus, Camera, ChevronDown, ChevronLeft, ChevronRight, Circle, CircleCheck, FileText, Landmark, Loader2, Pencil, Receipt, Repeat, Sparkles, Trash2, Users, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { MoneyInput } from "@/components/invoice/fields";
import { dismissRecurring, removeEvent, saveEvent, setDone, useCalendar } from "@/lib/calendar-store";
import { useCompany } from "@/lib/company-store";
import { findRecurring, type Recurring } from "@/lib/recurring";
import { monthResult } from "@/lib/sales";
import { useSales } from "@/lib/sales-store";
import { type CalEvent, type CalItem, type CalKind, calendarItems, daysTo, TAX_KINDS } from "@/lib/company-calendar";
import { pick, useLedger } from "@/lib/ledger-store";
import { useMonthLocks } from "@/lib/month-lock-store";
import { baht, bahtWhole, fromSatang, toSatang } from "@/lib/money";
import { useEmployees } from "@/lib/payroll-store";
import { useMe } from "@/lib/role-store";
import { THAI_HOLIDAYS } from "@/lib/thai-holidays";
import { todayBangkok } from "@/lib/thai-tax";
import type { FoundDate } from "@/lib/calendar-read-server";
import { preparePhoto } from "@/lib/upload-queue";
import { cn } from "@/lib/utils";

type Group = "tax" | "doc" | "bill" | "event";
const groupOf = (k: CalKind): Group => (TAX_KINDS.includes(k) ? "tax" : (k as Group));
const TONE: Record<Group, { dot: string; chip: string; icon: typeof Landmark }> = {
  tax: { dot: "bg-primary", chip: "bg-primary/10 text-primary", icon: Landmark },
  doc: { dot: "bg-warn", chip: "bg-warn-soft text-warn", icon: Users },
  bill: { dot: "bg-bad", chip: "bg-bad-soft text-bad", icon: Receipt },
  event: { dot: "bg-[#7c5cff]", chip: "bg-[#7c5cff]/10 text-[#6a4ae6]", icon: CalendarPlus },
};
const HREF: Partial<Record<CalKind, string>> = { vat: "/ledger", monthly: "/payroll", cert50: "/payroll", pnd1a: "/payroll", doc: "/payroll", bill: "/vendors" };
const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const shiftMonth = (m: string, n: number) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);

export function CompanyCalendar() {
  const t = useTranslations("calendar");
  const tc = useTranslations("calendar.cal");
  const locale = useLocale();
  const today = todayBangkok();
  const me = useMe();
  const isAdmin = me.role === "admin";
  const { events, done, loaded, dismissed } = useCalendar();
  const company = useCompany();
  const { sales } = useSales({ all: true });
  const locked = useMonthLocks();
  const { entries } = useLedger();
  const { employees } = useEmployees();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [day, setDay] = useState<string | null>(null);
  const [show, setShow] = useState<Record<Group, boolean>>({ tax: true, doc: true, bill: true, event: true });
  const [editing, setEditing] = useState<(Partial<CalEvent> & { open: true }) | null>(null);
  // The list: what is late and the next two weeks first (at least 5), the rest (to 60 days) behind "more"
  const [all, setAll] = useState(false);

  // Everything from the month shown to 60 days ahead of today
  const from = `${shiftMonth(month, 0)}-01`;
  const to = [addDays(today, 60), `${shiftMonth(month, 1)}-01`].sort().at(-1)!;
  const items = useMemo(
    () =>
      calendarItems({
        from: from < today ? from : today,
        to,
        // The company files VAT; payroll filings once staff are on file
        vatRegistered: null,
        payroll: employees.length > 0,
        employees: employees.map((e) => ({ id: e.id, name: e.nickname || e.name, endDate: e.endDate, documents: e.documents })),
        bills: pick(entries, "ledger")
          .filter((e) => !e.doc.paid && e.doc.dueDate)
          .map((e) => ({ id: e.id, seller: e.doc.seller.name.en || e.doc.seller.name.th || e.doc.seller.name.ja, dueDate: e.doc.dueDate, net: e.doc.totals.net })),
        events,
        done,
        locked,
      }).filter((i) => show[groupOf(i.kind)]),
    [from, to, today, employees, entries, events, done, locked, show],
  );

  // The VAT return's amount to pay, estimated like the dashboard: output VAT on the sales − claimable input VAT
  const ledgerDocs = useMemo(() => pick(entries, "ledger").map((e) => ({ id: e.id, doc: e.doc, ack: e.ackFlags })), [entries]);
  const vatEstimate = (period: string): number | null => (sales.length ? monthResult(sales, ledgerDocs.map((d) => d.doc), period, company.taxId).vatPayable : null);
  // Repeating payments not yet in the calendar (admins): from the ledger
  const suggestions = useMemo<Recurring[]>(
    () =>
      isAdmin
        ? findRecurring(
            {
              docs: ledgerDocs.map(({ doc }) => ({ seller: doc.seller.name.en || doc.seller.name.th || doc.seller.name.ja, taxId: doc.seller.taxId, date: doc.date, dueDate: doc.dueDate, net: doc.totals.net, category: doc.category })),
              events: events.map((e) => e.title),
              dismissed,
            },
            today,
          )
        : [],
    [isAdmin, ledgerDocs, events, dismissed, today],
  );
  const monthName = (ym: string) => new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));
  const dateText = (d: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const title = (i: CalItem) =>
    i.kind === "vat" || i.kind === "monthly"
      ? tc(i.kind, { month: monthName(i.period!) })
      : TAX_KINDS.includes(i.kind)
        ? tc(i.kind as "cert50", { year: i.period! })
        : i.kind === "doc"
          ? t("docTitle", { name: i.sub ?? "", paper: i.title ?? "" })
          : i.kind === "bill"
            ? t("billTitle", { seller: i.title ?? "" })
            : (i.title ?? "");

  // The month grid (weeks start on Sunday)
  const first = new Date(`${month}-01T00:00:00Z`);
  const lead = first.getUTCDay();
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => {
    const d = i - lead + 1;
    return d >= 1 && d <= days ? `${month}-${String(d).padStart(2, "0")}` : null;
  });
  const byDay = new Map<string, CalItem[]>();
  for (const i of items) byDay.set(i.date, [...(byDay.get(i.date) ?? []), i]);
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 10, 1 + i))));

  const list = day ? byDay.get(day) ?? [] : items.filter((i) => i.date >= today || (!i.done && i.kind !== "bill" && daysTo(today, i.date) >= -30));
  const seen = new Set<string>();
  const upcoming = list.filter((i) => {
    if (!day && i.date > addDays(today, 60)) return false;
    // A repeating company date: only its next time in the list (the month grid still shows each one)
    if (!day && i.kind === "event" && i.eventId && i.date >= today) {
      if (seen.has(i.eventId)) return false;
      seen.add(i.eventId);
    }
    return true;
  });
  const soon = upcoming.filter((i) => i.date <= addDays(today, 14));
  const shown = day || all ? upcoming : soon.length >= 5 ? soon : upcoming.slice(0, 5);
  const hidden = upcoming.length - shown.length;

  const toggle = async (i: CalItem) => {
    try {
      await setDone(i.key, !i.done);
    } catch {
      toast.error(t("fail"));
    }
  };

  if (me.loaded && !isAdmin) return <p className="mx-auto mt-16 max-w-md text-center text-sm text-muted-foreground">{t("adminOnly")}</p>;
  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("title")}</h1>
          <p className="text-[15px] text-muted-foreground">{t("sub")}</p>
        </div>
        {isAdmin && (
          <Button type="button" className="h-11 rounded-full px-5" onClick={() => setEditing({ open: true, date: day ?? today, repeat: "none", remindDays: 7, title: "", note: "" })}>
            <CalendarPlus className="size-4" />
            {t("add")}
          </Button>
        )}
      </div>

      {/* What to show */}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("filter")}>
        {(Object.keys(TONE) as Group[]).map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={show[g]}
            onClick={() => setShow((s) => ({ ...s, [g]: !s[g] }))}
            className={cn("flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors", show[g] ? "border-transparent " + TONE[g].chip : "border-border text-muted-foreground")}
          >
            <span className={cn("size-2 rounded-full", show[g] ? TONE[g].dot : "bg-muted-foreground/40")} aria-hidden />
            {t(`group.${g}`)}
          </button>
        ))}
      </div>

      {suggestions.length > 0 && <RecurringCard items={suggestions} />}

      <div className="grid items-start gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* Month grid */}
        <section className="workspace-panel grid gap-2 p-3 sm:gap-3 sm:p-5" aria-label={monthName(month)}>
          <div className="flex items-center justify-between">
            <Button type="button" variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={t("prev")}>
              <ChevronLeft className="size-5" />
            </Button>
            <button type="button" className="min-h-10 rounded-full px-3 text-[18px] font-semibold hover:bg-muted/60" onClick={() => (setMonth(today.slice(0, 7)), setDay(null))}>
              {monthName(month)}
            </button>
            <Button type="button" variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => setMonth(shiftMonth(month, 1))} aria-label={t("next")}>
              <ChevronRight className="size-5" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
            {weekdays.map((w, i) => (
              <span key={w} className={cn(i === 0 && "text-bad")}>
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <span key={i} />;
              const its = byDay.get(d) ?? [];
              const off = new Date(`${d}T00:00:00Z`).getUTCDay() % 6 === 0 || THAI_HOLIDAYS.has(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDay(day === d ? null : d)}
                  aria-pressed={day === d}
                  aria-label={`${dateText(d)} ${its.length ? `· ${its.length}` : ""}`}
                  className={cn(
                    "grid min-h-11 content-start justify-items-center gap-1 rounded-xl p-1 text-left transition-colors sm:min-h-20 sm:justify-items-stretch sm:p-1.5",
                    day === d ? "bg-primary/10 ring-2 ring-primary/40" : "hover:bg-muted/60",
                  )}
                >
                  <span className={cn("text-[13px] font-semibold tabular-nums", off && "text-bad", d === today && "grid size-6 place-items-center rounded-full bg-primary text-primary-foreground")}>
                    {Number(d.slice(8))}
                  </span>
                  {its.slice(0, 2).map((x) => (
                    <span key={x.key} className={cn("line-clamp-2 rounded px-1 text-[10px] leading-[13px] font-medium [overflow-wrap:anywhere] max-sm:hidden", TONE[groupOf(x.kind)].chip, x.done && "line-through opacity-60")}>
                      {x.kind === "event" || x.kind === "bill" || x.kind === "doc" ? x.title : t(`short.${x.kind}`)}
                    </span>
                  ))}
                  {/* Phones: dots only */}
                  {its.length > 0 && (
                    <span className="flex gap-0.5 sm:hidden">
                      {its.slice(0, 4).map((x) => (
                        <span key={x.key} className={cn("size-1.5 rounded-full", TONE[groupOf(x.kind)].dot)} />
                      ))}
                    </span>
                  )}
                  {its.length > 2 && <span className="text-[10px] text-muted-foreground max-sm:hidden">+{its.length - 2}</span>}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground max-sm:hidden">{t("note")}</p>
        </section>

        {/* The list */}
        <section className="grid gap-3" aria-labelledby="cal-list">
          <div className="flex items-center justify-between gap-2">
            <h2 id="cal-list" className="text-[18px] font-semibold">
              {day ? dateText(day) : t("upcoming")}
              {!day && !all && hidden > 0 && <span className="ml-2 text-[13px] font-medium text-muted-foreground">{t("twoWeeks")}</span>}
            </h2>
            {day ? (
              <Button type="button" variant="ghost" className="h-9 rounded-full text-primary" onClick={() => setDay(null)}>
                {t("showUpcoming")}
              </Button>
            ) : (
              all && (
                <Button type="button" variant="ghost" className="h-9 rounded-full text-primary" onClick={() => setAll(false)}>
                  {t("less")}
                </Button>
              )
            )}
          </div>
          {!loaded ? null : upcoming.length === 0 ? (
            <p className="workspace-panel flex items-center gap-2 p-5 text-[15px] text-muted-foreground">
              <CircleCheck className="size-5 text-ok" aria-hidden />
              {t("nothing")}
            </p>
          ) : (
            <ul className="workspace-panel divide-y divide-border/60 overflow-hidden">
              {shown.map((i) => {
                const g = groupOf(i.kind);
                const Icon = i.kind === "doc" ? FileText : TONE[g].icon;
                const left = daysTo(today, i.date);
                const href = HREF[i.kind];
                const vat = i.kind === "vat" && !i.done && i.period ? vatEstimate(i.period) : null;
                const ev = i.kind === "event" ? events.find((e) => e.id === i.eventId) : undefined;
                return (
                  <li key={i.key} className={cn("flex min-h-14 items-center gap-2.5 px-3 py-2.5", i.done && "opacity-55")}>
                    {/* Tick off (not bills: they are done by paying them in the ledger) */}
                    {isAdmin && i.kind !== "bill" ? (
                      <button
                        type="button"
                        onClick={() => void toggle(i)}
                        aria-pressed={i.done}
                        aria-label={i.done ? t("undo") : t("markDone")}
                        title={i.done ? t("undo") : t("markDone")}
                        className="grid size-9 flex-none place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {i.done ? <CircleCheck className="size-6 text-ok" aria-hidden /> : <Circle className="size-6 text-muted-foreground/50" aria-hidden />}
                      </button>
                    ) : (
                      <span className={cn("grid size-9 flex-none place-items-center rounded-full", TONE[g].chip)}>
                        <Icon className="size-4" aria-hidden />
                      </span>
                    )}
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <p className={cn("flex min-w-0 items-baseline gap-1.5 text-[15px] leading-snug font-semibold", i.done && "line-through")} title={i.kind === "pnd50" || i.kind === "pnd51" ? tc("note") : (i.sub ?? undefined)}>
                        <span className={cn("size-2 flex-none -translate-y-px rounded-full", TONE[g].dot)} aria-hidden />
                        <span className="line-clamp-2 [overflow-wrap:anywhere]">{title(i)}</span>
                      </p>
                      <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
                        {!i.done && (
                          <span className={cn("flex-none rounded-full px-1.5 py-px text-[11px] font-bold tabular-nums", left < 0 ? "bg-bad-soft text-bad" : left <= 3 ? "bg-warn-soft text-warn" : "bg-muted")}>
                            {left === 0 ? t("today") : left < 0 ? t("late", { n: -left }) : t("dDay", { n: left })}
                          </span>
                        )}
                        <span className="flex-none">{dateText(i.date)}</span>
                        {i.amount !== undefined && <span className="truncate font-semibold text-foreground tabular-nums">· {bahtWhole(i.amount)}</span>}
                        {vat !== null && <span className="truncate font-semibold text-foreground tabular-nums">· {vat < 0 ? t("vatCredit", { amount: bahtWhole(-vat) }) : t("vatPay", { amount: bahtWhole(vat) })}</span>}
                      </p>
                    </div>
                    {isAdmin && ev ? (
                      <Button type="button" variant="ghost" size="icon" className="size-9 flex-none rounded-full text-muted-foreground" aria-label={t("edit")} onClick={() => setEditing({ ...ev, open: true })}>
                        <Pencil className="size-4" />
                      </Button>
                    ) : href ? (
                      <Button asChild variant="ghost" size="icon" className="size-9 flex-none rounded-full text-muted-foreground">
                        <Link href={href} aria-label={t("open")}>
                          <ChevronRight className="size-5" />
                        </Link>
                      </Button>
                    ) : null}
                  </li>
                );
              })}
              {hidden > 0 && (
                <li>
                  <button type="button" onClick={() => setAll(true)} className="flex min-h-12 w-full items-center justify-center gap-1 text-[14px] font-semibold text-primary hover:bg-muted/50">
                    {t("more", { n: hidden })}
                    <ChevronDown className="size-4" aria-hidden />
                  </button>
                </li>
              )}
            </ul>
          )}
        </section>
      </div>

      {editing && <EventDialog initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const REMIND = [0, 3, 7, 30];
/** How early a date read from a document is reminded of */
const REMIND_FOR: Record<FoundDate["kind"], number> = { expiry: 30, renewal: 30, notice: 7, payment: 3, other: 7 };

export function EventDialog({ initial, onClose }: { initial: Partial<CalEvent>; onClose: () => void }) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const [e, setE] = useState({ title: initial.title ?? "", date: initial.date ?? todayBangkok(), repeat: initial.repeat ?? "none", remindDays: initial.remindDays ?? 7, note: initial.note ?? "", amount: initial.amount ?? null, source: initial.source ?? "typed" });
  const [reading, setReading] = useState(false);
  const [found, setFound] = useState<{ document: string; dates: FoundDate[] } | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const readDoc = async (f: File) => {
    setReading(true);
    try {
      const form = new FormData();
      form.append("file", f.type.startsWith("image/") ? await preparePhoto(f) : f);
      form.append("lang", locale);
      const res = await fetch("/api/calendar/read", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { document?: string; dates?: FoundDate[]; error?: string };
      if (!res.ok || !body.dates) throw new Error(body.error ?? "failed");
      setFound({ document: body.document ?? "", dates: body.dates });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      toast.error(code === "none" ? t("docNone") : code === "noKey" ? t("docNoAi") : code === "limit" ? t("docLimit") : t("docFail"));
    } finally {
      setReading(false);
    }
  };
  const addFound = async (d: FoundDate, i: number) => {
    try {
      await saveEvent({ title: d.title, date: d.date, repeat: d.repeat, remindDays: REMIND_FOR[d.kind], note: [found?.document, d.note].filter(Boolean).join(" · ").slice(0, 500), amount: d.amount, source: "document" });
      setAdded((s) => new Set(s).add(i));
    } catch {
      toast.error(t("fail"));
    }
  };
  const [busy, setBusy] = useState(false);
  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!e.title.trim()) return;
    setBusy(true);
    try {
      await saveEvent({ ...e, id: initial.id });
      toast.success(t("saved"));
      onClose();
    } catch {
      toast.error(t("fail"));
      setBusy(false);
    }
  };
  const field = "h-11 w-full rounded-xl border border-input bg-background px-3 text-[15px]";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial.id ? t("editTitle") : t("addTitle")}</DialogTitle>
        </DialogHeader>
        {!initial.id && (
          <div className="grid gap-2 rounded-2xl bg-primary/5 p-3">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/30 px-3 py-3 text-[14px] font-semibold text-primary">
              {reading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
              {reading ? t("docReading") : t("docPick")}
              <input type="file" accept="image/*,application/pdf,.pdf" className="sr-only" disabled={reading} onChange={(x) => (x.target.files?.[0] && void readDoc(x.target.files[0]), (x.target.value = ""))} />
            </label>
            <p className="text-center text-[12px] text-muted-foreground">{t("docHint")}</p>
            {found && (
              <div className="grid gap-2">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <Sparkles className="size-4 text-primary" aria-hidden />
                  {t("docFound", { doc: found.document || "—", n: found.dates.length })}
                </p>
                <ul className="grid gap-1.5">
                  {found.dates.map((d, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-xl bg-background px-3 py-2">
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate text-[14px] font-semibold">{d.title}</span>
                        <span className="text-[12px] text-muted-foreground">
                          {d.date} · {t(`dk.${d.kind}`)}
                          {d.repeat !== "none" ? ` · ${t(`repeat.${d.repeat}`)}` : ""}
                          {d.amount ? ` · ${baht(fromSatang(d.amount))}` : ""}
                        </span>
                      </span>
                      {added.has(i) ? (
                        <span className="flex items-center gap-1 text-[13px] font-semibold text-ok">
                          <BadgeCheck className="size-4" aria-hidden />
                          {t("docAdded")}
                        </span>
                      ) : (
                        <Button type="button" className="h-8 rounded-full px-3 text-[13px]" onClick={() => void addFound(d, i)}>
                          {t("docAdd")}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                {added.size > 0 && (
                  <Button type="button" variant="ghost" className="h-9 rounded-full" onClick={onClose}>
                    {t("docDone")}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
        <form onSubmit={save} className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold">{t("fTitle")}</span>
            <Input value={e.title} maxLength={120} autoFocus placeholder={t("fTitlePh")} onChange={(x) => setE({ ...e, title: x.target.value })} className="h-11" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold">{t("fDate")}</span>
              <input type="date" required value={e.date} onChange={(x) => setE({ ...e, date: x.target.value })} className={field} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold">{t("fRepeat")}</span>
              <select value={e.repeat} onChange={(x) => setE({ ...e, repeat: x.target.value as CalEvent["repeat"] })} className={field}>
                {(["none", "monthly", "yearly"] as const).map((r) => (
                  <option key={r} value={r}>
                    {t(`repeat.${r}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold">{t("fRemind")}</span>
            <select value={e.remindDays} onChange={(x) => setE({ ...e, remindDays: Number(x.target.value) })} className={field}>
              {REMIND.map((n) => (
                <option key={n} value={n}>
                  {n ? t("remindN", { n }) : t("remind0")}
                </option>
              ))}
            </select>
            <span className="text-[12px] text-muted-foreground">{t("remindLine")}</span>
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold">{t("fAmount")}</span>
            <MoneyInput value={e.amount ? fromSatang(e.amount) : 0} onChange={(v) => setE({ ...e, amount: v > 0 ? toSatang(v) : null })} className="h-11" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold">{t("fNote")}</span>
            <Textarea value={e.note} maxLength={500} rows={3} onChange={(x) => setE({ ...e, note: x.target.value })} />
          </label>
          <DialogFooter className="gap-2">
            {initial.id && (
              <Button
                type="button"
                variant="ghost"
                className="rounded-full text-bad sm:mr-auto"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm(t("removeAsk"))) return;
                  try {
                    await removeEvent(initial.id!);
                    onClose();
                  } catch {
                    toast.error(t("fail"));
                  }
                }}
              >
                <Trash2 className="size-4" />
                {t("remove")}
              </Button>
            )}
            <Button type="button" variant="ghost" className="rounded-full" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" className="rounded-full px-6" disabled={busy || !e.title.trim()}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Repeating payments found in the books: one tap puts them in the calendar (monthly, reminded 3 days before) */
function RecurringCard({ items }: { items: Recurring[] }) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const [busy, setBusy] = useState<string | null>(null);
  const add = async (r: Recurring) => {
    setBusy(r.key);
    try {
      await saveEvent({ title: r.title, date: r.next, repeat: "monthly", remindDays: 3, note: "", amount: r.amount, source: "recurring" });
      toast.success(t("recAdded"));
    } catch {
      toast.error(t("fail"));
    } finally {
      setBusy(null);
    }
  };
  const day = (n: number) => new Intl.NumberFormat(locale).format(n);
  return (
    <section className="workspace-panel grid gap-3 p-4 sm:p-5" aria-labelledby="rec-title">
      <h2 id="rec-title" className="flex items-center gap-2 text-[15px] font-semibold">
        <Repeat className="size-4 text-primary" aria-hidden />
        {t("recTitle")}
      </h2>
      <p className="text-[13px] text-muted-foreground">{t("recSub")}</p>
      <ul className="grid gap-2">
        {items.map((r) => (
          <li key={r.key} className="flex flex-wrap items-center gap-3 rounded-2xl bg-muted/50 px-4 py-3">
            <span className="grid min-w-0 flex-1">
              <b className="truncate text-[14px]">{r.title}</b>
              <span className="text-[12px] text-muted-foreground">{t("recLine", { day: day(r.day), n: r.months, amount: baht(fromSatang(r.amount)) })}</span>
            </span>
            <Button type="button" className="h-9 rounded-full px-4" disabled={busy === r.key} onClick={() => void add(r)}>
              <CalendarPlus className="size-4" />
              {t("recAdd")}
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-9 rounded-full text-muted-foreground" aria-label={t("recNo")} onClick={() => void dismissRecurring(r.key)}>
              <X className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
