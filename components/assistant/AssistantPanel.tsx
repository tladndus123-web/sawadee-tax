"use client";

// The AI assistant inside the app (owner, 2026-10-27; mock-ups approved: phone = button at the bottom right and a sheet
// from below, PC = button in the top bar or Ctrl+K and a panel docked on the right). Admins only, like on LINE.
// Questions go to /api/assistant (Sonnet 5.5, the books + the calendar); answers are the same navy cards as on LINE.
// A date to put in the calendar comes as a proposal: saved only when the person taps Save (or changes it first).
// The conversation of this tab stays in sessionStorage; the server keeps the last day's for follow-up questions.

import { CalendarPlus, Check, Loader2, Pencil, RotateCcw, SendHorizontal, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { AiCard, AiEvent } from "@/lib/assistant";
import { saveEvent } from "@/lib/calendar-store";
import { Link } from "@/i18n/navigation";
import { bahtWhole, toSatang } from "@/lib/money";
import { useMe } from "@/lib/role-store";
import { cn } from "@/lib/utils";

// The calendar's own edit window, loaded only when "change" is tapped
const EventDialog = dynamic(() => import("@/components/calendar/CompanyCalendar").then((m) => m.EventDialog), { ssr: false });

type Msg = { role: "user"; text: string } | { role: "ai"; card: AiCard | null; text: string; saved?: boolean } | { role: "error"; text: string };

const STORE = "sawadee.assistant.chat";
const OPEN_EVENT = "assistant-open";

/** The assistant's mark (public/ai-mark.svg): the app logo's family, a talking face with a sparkle */
export function AiMark({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- tiny static SVG
  return <img src="/ai-mark.svg" alt="" aria-hidden="true" draggable={false} className={className} />;
}

/** Top bar button (PC); phones get the round button at the bottom right */
export function AssistantButton() {
  const t = useTranslations("aiPanel");
  const isAdmin = useMe().role === "admin";
  if (!isAdmin) return null;
  return (
    // Just the mark, like the app logo (owner 2026-10-27: the wider pill squeezed the top bar); the name is the tooltip
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className="press hidden size-9 flex-none place-items-center rounded-[10px] transition-transform hover:scale-105 active:scale-[0.95] md:grid"
      aria-label={t("open")}
      title={`${t("title")} (Ctrl+K)`}
    >
      <AiMark className="size-9 rounded-[10px] [filter:drop-shadow(0_2px_6px_rgb(4_60_190/0.28))]" />
    </button>
  );
}

export function AssistantPanel() {
  const t = useTranslations("aiPanel");
  const isAdmin = useMe().role === "admin";
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ index: number; event: AiEvent } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  // This tab's conversation
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE) ?? "[]") as Msg[];
      if (Array.isArray(saved)) setMsgs(saved.slice(-30));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-30)));
    } catch {}
  }, [msgs]);

  // Open: the button, Ctrl/⌘+K; close: Esc
  useEffect(() => {
    const show = () => setOpen(true);
    const keys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener(OPEN_EVENT, show);
    window.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener(OPEN_EVENT, show);
      window.removeEventListener("keydown", keys);
    };
  }, []);
  useEffect(() => {
    if (open) window.setTimeout(() => input.current?.focus(), 150);
    // PC: the page makes room for the panel (globals.css html[data-ai-open])
    if (open) document.documentElement.dataset.aiOpen = "";
    else delete document.documentElement.dataset.aiOpen;
    return () => void delete document.documentElement.dataset.aiOpen;
  }, [open]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy, open]);

  const ask = useCallback(
    async (q: string) => {
      const question = q.trim();
      if (!question || busy) return;
      setDraft("");
      setMsgs((m) => [...m, { role: "user", text: question }]);
      setBusy(true);
      try {
        const res = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
        const body = (await res.json().catch(() => ({}))) as { card?: AiCard | null; text?: string; error?: string };
        if (!res.ok) throw new Error(body.error ?? "failed");
        setMsgs((m) => [...m, { role: "ai", card: body.card ?? null, text: body.text ?? "" }]);
      } catch (e) {
        const code = e instanceof Error ? e.message : "";
        setMsgs((m) => [...m, { role: "error", text: code === "rate" ? t("rate") : code === "noKey" ? t("noKey") : t("fail") }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, t],
  );

  const save = async (index: number, ev: AiEvent) => {
    try {
      await saveEvent({ title: ev.title, date: ev.date, repeat: ev.repeat, remindDays: ev.remindDays, note: ev.note, amount: ev.amount ? toSatang(ev.amount) : null, source: "typed" });
      setMsgs((m) => m.map((x, i) => (i === index && x.role === "ai" ? { ...x, saved: true } : x)));
      toast.success(t("saved"));
    } catch {
      toast.error(t("fail"));
    }
  };

  if (!isAdmin) return null;
  const last = [...msgs].reverse().find((m) => m.role === "ai") as Extract<Msg, { role: "ai" }> | undefined;
  const chips = last?.card?.next?.length ? last.card.next : [t("s1"), t("s2"), t("s3"), t("s4")];

  return (
    <>
      {/* Phones: the round button above the tab bar */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("open")}
          className="press fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex h-12 items-center gap-1.5 rounded-full bg-[#0d121c] py-1 pr-3.5 pl-1 text-[14px] font-semibold text-white shadow-[0_10px_24px_rgb(13_18_28/0.35)] active:scale-[0.97] md:hidden"
        >
          <AiMark className="size-10 rounded-[11px]" />
          {t("title")}
        </button>
      )}

      {open && <div className="fixed inset-0 z-50 bg-black/35 md:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside
        role="dialog"
        aria-label={t("title")}
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "fixed z-50 flex flex-col bg-background shadow-2xl transition-[transform,visibility] duration-300 ease-out motion-reduce:transition-none",
          // phone: a sheet from below; PC: a panel on the right under the top bar
          "inset-x-0 top-[7vh] bottom-0 rounded-t-[26px] md:inset-x-auto md:top-16 md:right-0 md:w-[420px] md:rounded-none md:border-l md:border-border md:shadow-[-12px_0_30px_rgb(20_30_60/0.08)]",
          open ? "visible translate-y-0 md:translate-x-0" : "invisible translate-y-full md:translate-x-full md:translate-y-0",
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted-foreground/25 md:hidden" aria-hidden />
        <header className="flex items-center gap-3 border-b border-border/70 px-4 py-3">
          <AiMark className="size-9 rounded-[10px]" />
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold">{t("title")}</p>
            <p className="truncate text-[12px] text-muted-foreground">{t("sub")}</p>
          </div>
          {msgs.length > 0 && (
            <button type="button" onClick={() => setMsgs([])} className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground hover:text-foreground" aria-label={t("newChat")} title={t("newChat")}>
              <RotateCcw className="size-4" />
            </button>
          )}
          <button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground hover:text-foreground" aria-label={t("close")}>
            <X className="size-4" />
          </button>
        </header>

        <div ref={list} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" aria-live="polite">
          {msgs.length === 0 && (
            <div className="m-auto grid max-w-xs justify-items-center gap-3 text-center">
              <AiMark className="size-16 rounded-[18px]" />
              <p className="text-[15px] font-semibold">{t("hello")}</p>
              <p className="text-[13px] text-muted-foreground">{t("helloSub")}</p>
            </div>
          )}
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <p key={i} className="max-w-[85%] self-end rounded-[18px] rounded-br-md bg-primary px-3.5 py-2 text-[14.5px] whitespace-pre-wrap text-primary-foreground">
                {m.text}
              </p>
            ) : m.role === "error" ? (
              <p key={i} className="self-start rounded-2xl bg-bad-soft px-3.5 py-2 text-[13.5px] text-bad">
                {m.text}
              </p>
            ) : (
              <div key={i} className="grid w-[94%] gap-2 self-start">
                {m.card ? <CardView card={m.card} /> : <p className="rounded-2xl bg-muted px-3.5 py-2 text-[14px] whitespace-pre-wrap">{m.text}</p>}
                {m.card?.event && <EventProposal ev={m.card.event} saved={!!m.saved} onSave={() => void save(i, m.card!.event!)} onEdit={() => setEditing({ index: i, event: m.card!.event! })} />}
              </div>
            ),
          )}
          {busy && (
            <p className="flex items-center gap-2 self-start text-[13px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("thinking")}
            </p>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto px-4 pt-1 pb-2 [scrollbar-width:none]">
          {chips.map((c) => (
            <button key={c} type="button" disabled={busy} onClick={() => void ask(c)} className="flex-none rounded-full border border-border bg-card px-3 py-1.5 text-[13px] font-medium hover:bg-muted disabled:opacity-50">
              {c}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(draft);
          }}
          className="mx-3 mb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-end gap-2 rounded-[22px] border border-input bg-card py-1.5 pr-1.5 pl-4"
        >
          <textarea
            ref={input}
            value={draft}
            rows={1}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void ask(draft);
              }
            }}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-[15px] outline-none [field-sizing:content] placeholder:text-muted-foreground"
          />
          <button type="submit" disabled={busy || !draft.trim()} className="grid size-9 flex-none place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40" aria-label={t("send")}>
            <SendHorizontal className="size-4" />
          </button>
        </form>
        <p className="-mt-1.5 mb-2 text-center text-[11px] text-muted-foreground max-md:hidden">{t("keys")}</p>
      </aside>

      {editing && (
        <EventDialog
          initial={{ title: editing.event.title, date: editing.event.date, repeat: editing.event.repeat, remindDays: editing.event.remindDays, note: editing.event.note, amount: editing.event.amount ? toSatang(editing.event.amount) : null }}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

const TONE = { up: "text-[#7ee2a8]", down: "text-[#ffb84d]", warn: "text-[#ffb84d]", neutral: "text-white" } as const;

/** A link of the card → the same page inside the app (the card only carries the app's own addresses) */
function inApp(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\/(ja|th|en|ko)(?=\/|$)/, "") || "/";
  } catch {
    return "/";
  }
}

/** The navy dashboard card, like the LINE one (lib/line-dash aiCard) */
function CardView({ card: c }: { card: AiCard }) {
  return (
    <div className="grid gap-2.5 rounded-[18px] bg-[#0d121c] p-3.5 text-white">
      <div>
        {c.eyebrow && <p className="text-[10.5px] font-extrabold tracking-[0.12em] text-[#c6f432]">{c.eyebrow}</p>}
        <p className="text-[15.5px] font-bold">{c.title}</p>
        {c.summary && <p className="mt-1 text-[13.5px] leading-relaxed text-white/80">{c.summary}</p>}
      </div>
      {c.hero && (
        <div>
          {c.hero.label && <p className="text-[12px] text-white/60">{c.hero.label}</p>}
          <p className="text-[26px] leading-tight font-extrabold tracking-tight tabular-nums">{c.hero.value}</p>
          {c.hero.note && <p className="text-[12px] text-white/60">{c.hero.note}</p>}
          {c.hero.bar !== null && (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#c6f432]" style={{ width: `${Math.round(c.hero.bar * 100)}%` }} />
            </div>
          )}
        </div>
      )}
      {c.tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {c.tiles.map((x, i) => (
            <div key={i} className="rounded-xl bg-[#161d2b] px-2.5 py-2">
              <p className="truncate text-[11.5px] text-white/60">{x.label}</p>
              <p className={cn("text-[15px] font-bold tabular-nums", TONE[x.tone])}>{x.value}</p>
              {x.note && <p className="truncate text-[11px] text-white/50">{x.note}</p>}
            </div>
          ))}
        </div>
      )}
      {c.rows.length > 0 && (
        <div className="divide-y divide-white/10 rounded-xl bg-[#161d2b] px-2.5">
          {c.rows.map((r, i) => (
            <div key={i} className="flex justify-between gap-3 py-1.5 text-[13px]">
              <span className="min-w-0 text-white/70">{r.label}</span>
              <b className={cn("flex-none tabular-nums", TONE[r.tone])}>{r.value}</b>
            </div>
          ))}
        </div>
      )}
      {c.sections.map((s, i) => (
        <div key={i}>
          {s.title && <p className="text-[12.5px] font-bold text-white/90">{s.title}</p>}
          <ul className="mt-0.5 grid gap-0.5 text-[13px] text-white/75">
            {s.items.map((x, j) => (
              <li key={j}>• {x}</li>
            ))}
          </ul>
        </div>
      ))}
      {c.tip && (
        <div className="rounded-xl border border-[#c6f432]/30 bg-[#c6f432]/10 px-2.5 py-2 text-[12.5px] leading-relaxed text-[#e7f9b0]">
          💡 <b>{c.tip.title}</b> · {c.tip.main}
          {c.tip.note && <span className="block text-[#e7f9b0]/75">{c.tip.note}</span>}
        </div>
      )}
      {c.links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {c.links.map((l) => (
            <Link key={l.url} href={inApp(l.url)} className="rounded-full bg-white/10 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-white/20">
              {l.label} →
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Put this in the calendar?" — saved only with the person's tap */
function EventProposal({ ev, saved, onSave, onEdit }: { ev: AiEvent; saved: boolean; onSave: () => void; onEdit: () => void }) {
  const t = useTranslations("aiPanel");
  const tc = useTranslations("calendar");
  const locale = useLocale();
  const day = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : locale, { year: "numeric", month: "short", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${ev.date}T00:00:00Z`));
  return (
    <div className="grid gap-2 rounded-[18px] border border-border bg-card p-3.5">
      <p className="flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-[#6a4ae6]">
        <CalendarPlus className="size-4" aria-hidden />
        {t("eventAsk")}
      </p>
      <p className="text-[16px] font-bold">{ev.title}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
        <dt className="text-muted-foreground">{t("date")}</dt>
        <dd className="font-semibold">
          {day}
          {ev.repeat !== "none" && ` · ${tc(`repeat.${ev.repeat}`)}`}
        </dd>
        {ev.amount !== null && (
          <>
            <dt className="text-muted-foreground">{t("amount")}</dt>
            <dd className="font-semibold tabular-nums">{bahtWhole(ev.amount)}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{t("remind")}</dt>
        <dd className="font-semibold">{ev.remindDays ? tc("remindN", { n: ev.remindDays }) : tc("remind0")}</dd>
      </dl>
      {saved ? (
        <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ok">
          <Check className="size-4" aria-hidden />
          {t("saved")}
        </p>
      ) : (
        <div className="flex gap-2 pt-0.5">
          <button type="button" onClick={onEdit} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-muted text-[14px] font-semibold">
            <Pencil className="size-4" aria-hidden />
            {t("edit")}
          </button>
          <button type="button" onClick={onSave} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary text-[14px] font-semibold text-primary-foreground">
            <Check className="size-4" aria-hidden />
            {t("save")}
          </button>
        </div>
      )}
    </div>
  );
}
