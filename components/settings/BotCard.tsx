"use client";

// Connect Grok Bot (or another AI agent) to the books (owner, 2026-11-08): make a key, add a custom connector in Grok Bot
// (server URL + Authorization header), ask it for a daily routine. The agent may read summaries and put dates in the tax calendar (lib/bot-server.ts).
// Owners only; the key is shown once.

import { Ban, CalendarClock, Check, CircleCheck, Copy, Download, ExternalLink, KeyRound, Link2Off, Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useScreenDate } from "@/components/ScreenDate";
import { todayBangkok } from "@/lib/thai-tax";
import { downloadBlob } from "@/lib/attendance-share";
import { skillMarkdown } from "@/lib/bot-skill";
import { cn } from "@/lib/utils";
import { useFoldStatus } from "./SettingsFold";

const ROUTINES = ["daily", "morning", "watch", "weekly", "filing", "email"] as const;
type Hook = { id: string; name: string; host: string; created_at: string; last_sent_at: string | null; last_status: number | null };

type KeyRow = { id: string; name: string; hint: string; created_at: string; last_used_at: string | null };

function CopyBox({ text, label, mono = true }: { text: string; label: string; mono?: boolean }) {
  const t = useTranslations("bot");
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      toast.error(t("copyFail"));
    }
  };
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium">{label}</span>
        <button type="button" onClick={() => void copy()} className="press inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-primary hover:bg-primary/10">
          {done ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {done ? t("copied") : t("copy")}
        </button>
      </div>
      <pre className={`overflow-x-auto rounded-xl bg-muted/70 px-3 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap break-all ${mono ? "font-mono" : ""}`}>{text}</pre>
    </div>
  );
}

export function BotCard() {
  const t = useTranslations("bot");
  const tf = useTranslations("fold");
  const sd = useScreenDate();
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState<string | null>(null);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [hookUrl, setHookUrl] = useState("");
  const [hookKey, setHookKey] = useState("");
  const [hookBusy, setHookBusy] = useState<string | null>(null);
  const loadHooks = useCallback(async () => {
    const r = await fetch("/api/bot-webhooks");
    if (r.ok) setHooks(((await r.json()) as { hooks: Hook[] }).hooks);
  }, []);
  useEffect(() => void loadHooks(), [loadHooks]);
  const addHook = async () => {
    setHookBusy("add");
    try {
      const r = await fetch("/api/bot-webhooks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: hookUrl, key: hookKey, name: "Grok Bot" }) });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error);
      setHookUrl("");
      setHookKey("");
      await loadHooks();
      toast.success(t("hook.added"));
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      toast.error(m === "url" ? t("hook.badUrl") : m === "key" ? t("hook.badKey") : m === "tooMany" ? t("hook.tooMany") : t("fail"));
    } finally {
      setHookBusy(null);
    }
  };
  const testHook = async (id: string) => {
    setHookBusy(id);
    const r = await fetch("/api/bot-webhooks", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; status?: number };
    setHookBusy(null);
    await loadHooks();
    if (j.ok) toast.success(t("hook.testOk"));
    else toast.error(t("hook.testFail", { status: String(j.status ?? "?") }));
  };
  const removeHook = async (id: string) => {
    const r = await fetch("/api/bot-webhooks", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    if (!r.ok) return void toast.error(t("fail"));
    await loadHooks();
    toast.success(t("hook.removed"));
  };
  useFoldStatus(keys === null ? null : keys.length ? tf("linked") : tf("notLinked"), !!keys?.length);

  const load = useCallback(async () => {
    const r = await fetch("/api/bot-keys");
    if (r.ok) setKeys(((await r.json()) as { keys: KeyRow[] }).keys);
  }, []);
  useEffect(() => void load(), [load]);

  const url = typeof window === "undefined" ? "/api/mcp" : `${window.location.origin}/api/mcp`;
  const key = fresh ?? "sk_sawa_…";
  // Grok Bot's "Add a custom connector": Server URL + HTTP headers, or "MCP server JSON" = one object keyed by the
  // server name (checked against Grok Bot 0.79.2, 2026-11-08). Its Bot runs on its own computer, so a URL, not a command.
  const config = JSON.stringify({ "sawadee-tax": { type: "http", url, headers: { Authorization: `Bearer ${key}` } } }, null, 2);

  const make = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/bot-keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Grok Bot" }) });
      const j = (await r.json()) as { key?: string; error?: string };
      if (!r.ok || !j.key) throw new Error(j.error);
      setFresh(j.key);
      await load();
      toast.success(t("made"));
    } catch (e) {
      toast.error(e instanceof Error && e.message === "tooMany" ? t("tooMany") : t("fail"));
    } finally {
      setBusy(false);
    }
  };
  const end = async (id: string) => {
    const r = await fetch("/api/bot-keys", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    setEnding(null);
    if (!r.ok) return void toast.error(t("fail"));
    toast.success(t("ended"));
    await load();
  };

  return (
    <div className="grid gap-5">
      <p className="text-[14px] leading-relaxed text-muted-foreground">{t("intro")}</p>
      <ul className="grid gap-1.5 text-[13.5px]">
        <li className="flex gap-2"><CircleCheck className="mt-0.5 size-4 flex-none text-ok" aria-hidden />{t("can.read")}</li>
        <li className="flex gap-2"><CircleCheck className="mt-0.5 size-4 flex-none text-ok" aria-hidden />{t("can.calendar")}</li>
        <li className="flex gap-2"><CircleCheck className="mt-0.5 size-4 flex-none text-ok" aria-hidden />{t("can.draft")}</li>
        <li className="flex gap-2"><CircleCheck className="mt-0.5 size-4 flex-none text-ok" aria-hidden />{t("can.line")}</li>
        <li className="flex gap-2"><Ban className="mt-0.5 size-4 flex-none text-bad" aria-hidden />{t("can.not")}</li>
      </ul>

      {/* Finish the setup from here (owner 2026-11-08: "웹사이트에서 모든 설정을 끝낼 수 있게"): each button opens Grok Bot with
          the sentence typed, or its connectors screen with our address on the clipboard; the agent does the rest itself */}
      <section className="grid gap-3 rounded-2xl bg-brand-soft/60 p-4">
        <span className="text-[14px] font-semibold">{t("setup.title")}</span>
        <ol className="grid gap-2">
          {(
            [
              { k: "connector", done: (keys?.length ?? 0) > 0, href: "grokbot://app/v1/settings?id=integrations", copy: url },
              { k: "skill", done: null, href: `grokbot://app/v1/prompt?text=${encodeURIComponent(t("setup.skillPrompt", { url: `${url.replace(/\/api\/mcp$/, "")}/api/bot-skill` }))}` },
              { k: "memory", done: null, href: `grokbot://app/v1/prompt?text=${encodeURIComponent(t("skill.memory"))}` },
              { k: "hook", done: hooks.length > 0, href: `grokbot://app/v1/prompt?text=${encodeURIComponent(t("setup.hookPrompt", { text: t("hook.routineText") }))}` },
              { k: "routine", done: null, href: `grokbot://app/v1/prompt?text=${encodeURIComponent(t("rec.items.daily.text"))}` },
            ] as const
          ).map((s, i) => (
            <li key={s.k} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-card px-3.5 py-2.5 shadow-[0_0_0_1px_var(--border)]">
              <span className="flex min-w-0 items-center gap-2.5">
                <span className={cn("grid size-7 flex-none place-items-center rounded-full text-[13px] font-bold", s.done ? "bg-ok text-white" : "bg-primary/10 text-primary")}>{s.done ? <Check className="size-4" aria-hidden /> : i + 1}</span>
                <span className="grid min-w-0">
                  <span className="text-[14px] font-medium">{t(`setup.${s.k}`)}</span>
                  <span className="text-[12px] text-muted-foreground">{s.done === true ? t("setup.done") : t(`setup.${s.k}Sub`)}</span>
                </span>
              </span>
              <a
                href={s.href}
                onClick={() => {
                  if ("copy" in s && s.copy) void navigator.clipboard.writeText(s.copy).then(() => toast.success(t("setup.copiedUrl"))).catch(() => undefined);
                }}
                className={cn("press inline-flex h-9 flex-none items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium", s.done ? "bg-secondary hover:bg-muted" : "bg-primary text-primary-foreground hover:bg-primary/90")}
              >
                <ExternalLink className="size-3.5" aria-hidden />
                {t(s.done ? "setup.again" : "setup.go")}
              </a>
            </li>
          ))}
        </ol>
        <p className="text-[12px] text-muted-foreground">{t("setup.note")}</p>
      </section>

      {/* Grok Bot's own links (grokbot://app/v1/open, /v1/prompt?text=…, checked in Grok Bot 0.79.2) */}
      <div className="flex flex-wrap gap-2">
        <a href="grokbot://app/v1/open" className="press inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <ExternalLink className="size-4" aria-hidden />
          {t("openBot")}
        </a>
        <a
          href={`grokbot://app/v1/prompt?text=${encodeURIComponent(t("routine"))}`}
          className="press inline-flex h-10 items-center gap-1.5 rounded-full bg-secondary px-4 text-sm font-medium hover:bg-muted"
        >
          <CalendarClock className="size-4 text-primary" aria-hidden />
          {t("routineButton")}
        </a>
      </div>

      <section className="grid gap-3 rounded-2xl bg-brand-soft/60 p-4">
        <span className="text-[14px] font-semibold">{t("signIn.title")}</span>
        <ol className="grid list-decimal gap-1.5 pl-5 text-[13.5px]">
          <li>{t("signIn.1")}</li>
          <li>{t("signIn.2")}</li>
          <li>{t("signIn.3")}</li>
        </ol>
        <CopyBox text={url} label={t("serverUrl")} />
      </section>

      <details className="rounded-2xl px-4 py-3 shadow-[0_0_0_1px_var(--border)]">
        <summary className="cursor-pointer text-[14px] font-medium text-primary">{t("keyWay")}</summary>
        <ol className="mt-3 grid gap-5">
          <li className="grid gap-2">
            <span className="text-[14px] font-semibold">1. {t("step1")}</span>
            {fresh ? (
              <div className="grid gap-2 rounded-2xl bg-warn-soft p-3">
                <CopyBox text={fresh} label={t("yourKey")} />
                <p className="text-[12.5px] text-warn">{t("onlyOnce")}</p>
              </div>
            ) : (
              <Button type="button" onClick={() => void make()} disabled={busy} className="w-fit rounded-full">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                {t("make")}
              </Button>
            )}
          </li>
          <li className="grid gap-2">
            <span className="text-[14px] font-semibold">2. {t("step2")}</span>
            <p className="text-[13px] text-muted-foreground">{t("step2Sub")}</p>
            <CopyBox text={url} label={t("serverUrl")} />
            <div className="grid gap-2 sm:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)]">
              <CopyBox text="Authorization" label={t("headerName")} />
              <CopyBox text={`Bearer ${key}`} label={t("headerValue")} />
            </div>
            <details className="text-[13px]">
              <summary className="cursor-pointer font-medium text-primary">{t("jsonInstead")}</summary>
              <div className="mt-2">
                <CopyBox text={config} label={t("config")} />
              </div>
            </details>
          </li>
        </ol>
      </details>

      {/* Events the moment they happen (owner 2026-11-08): a Grok Bot routine started "when a webhook is triggered" */}
      <section className="grid gap-3 rounded-2xl p-4 shadow-[0_0_0_1px_var(--border)]">
        <span className="text-[14px] font-semibold">{t("hook.title")}</span>
        <p className="text-[13px] text-muted-foreground">{t("hook.intro")}</p>
        <ol className="grid list-decimal gap-1.5 pl-5 text-[13.5px]">
          <li>{t("hook.s1")}</li>
          <li>{t("hook.s2")}</li>
          <li>{t("hook.s3")}</li>
        </ol>
        <CopyBox text={t("hook.routineText")} label={t("hook.routineLabel")} mono={false} />
        {hooks.length < 3 && (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
            <input id="bot-hook-url" value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder="https://…" aria-label={t("hook.url")} className="h-10 rounded-xl bg-card px-3 text-[14px] shadow-[0_0_0_1px_var(--border)] outline-none focus:shadow-[0_0_0_2px_var(--primary)]" />
            <input id="bot-hook-key" value={hookKey} onChange={(e) => setHookKey(e.target.value)} placeholder={t("hook.key")} aria-label={t("hook.key")} type="password" autoComplete="off" className="h-10 rounded-xl bg-card px-3 text-[14px] shadow-[0_0_0_1px_var(--border)] outline-none focus:shadow-[0_0_0_2px_var(--primary)]" />
            <Button type="button" onClick={() => void addHook()} disabled={hookBusy === "add" || !hookUrl || !hookKey} className="h-10 rounded-full">
              {hookBusy === "add" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {t("hook.add")}
            </Button>
          </div>
        )}
        {hooks.length > 0 && (
          <ul className="grid gap-2">
            {hooks.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted/50 px-3.5 py-2.5">
                <span className="grid gap-0.5">
                  <span className="text-[14px] font-medium">{h.name} <span className="font-mono text-[12px] text-muted-foreground">{h.host}</span></span>
                  <span className="text-[12px] text-muted-foreground">
                    {h.last_sent_at ? t("hook.last", { date: sd(todayBangkok(new Date(h.last_sent_at))), status: h.last_status === null ? "?" : h.last_status >= 200 && h.last_status < 300 ? t("hook.okShort") : String(h.last_status) }) : t("hook.never")}
                  </span>
                </span>
                <span className="flex gap-1.5">
                  <Button type="button" size="sm" variant="outline" className="rounded-full" disabled={hookBusy === h.id} onClick={() => void testHook(h.id)}>
                    {hookBusy === h.id ? <Loader2 className="size-4 animate-spin" /> : null}
                    {t("hook.test")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="rounded-full text-bad" onClick={() => void removeHook(h.id)}>
                    {t("hook.remove")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[12px] text-muted-foreground">{t("hook.what")}</p>
      </section>

      {/* A skill and a memory sentence for Grok Bot (what the tools are for, the rules) */}
      <section className="grid gap-3 rounded-2xl p-4 shadow-[0_0_0_1px_var(--border)]">
        <span className="text-[14px] font-semibold">{t("skill.title")}</span>
        <p className="text-[13px] text-muted-foreground">{t("skill.intro")}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => { downloadBlob(new Blob([skillMarkdown(window.location.origin)], { type: "text/markdown;charset=utf-8" }), "SKILL.md"); toast.success(t("skill.saved")); }}>
            <Download className="size-4" />
            {t("skill.download")}
          </Button>
        </div>
        <details className="text-[13px]">
          <summary className="cursor-pointer font-medium text-primary">{t("skill.show")}</summary>
          <div className="mt-2">
            <CopyBox text={skillMarkdown(url.replace(/\/api\/mcp$/, ""))} label="SKILL.md" />
          </div>
        </details>
        <CopyBox text={t("skill.memory")} label={t("skill.memoryLabel")} mono={false} />
      </section>

      {/* Ready-made routines (owner 2026-11-08: "일이나 보고 여러 일정을 줄이는"): each opens Grok Bot with the sentence typed */}
      <section className="grid gap-3">
        <span className="text-[14px] font-semibold">{t("rec.title")}</span>
        <ul className="grid gap-2">
          {ROUTINES.map((k) => (
            <li key={k} className="grid gap-2 rounded-2xl px-3.5 py-3 shadow-[0_0_0_1px_var(--border)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[14px] font-medium">{t(`rec.items.${k}.when`)}</span>
                <a
                  href={`grokbot://app/v1/prompt?text=${encodeURIComponent(t(`rec.items.${k}.text`))}`}
                  className="press inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                  {t("rec.make")}
                </a>
              </div>
              <details className="text-[13px]">
                <summary className="cursor-pointer text-muted-foreground">{t("rec.show")}</summary>
                <div className="mt-2">
                  <CopyBox text={t(`rec.items.${k}.text`)} label={t("routineLabel")} mono={false} />
                </div>
              </details>
              {k === "email" && <p className="text-[12.5px] text-muted-foreground">{t("rec.emailNote")}</p>}
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-muted-foreground">{t("askExamples")}</p>
      </section>

      {keys && keys.length > 0 && (
        <div className="grid gap-2">
          <span className="text-[13px] font-semibold text-muted-foreground">{t("keys")}</span>
          <ul className="grid gap-2">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3.5 py-2.5 shadow-[0_0_0_1px_var(--border)]">
                <span className="grid gap-0.5">
                  <span className="flex items-center gap-1.5 text-[14px] font-medium">
                    <KeyRound className="size-4 text-primary" aria-hidden />
                    {k.name} <span className="font-mono text-[12px] text-muted-foreground">{k.hint}</span>
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    {t("madeOn", { date: sd(todayBangkok(new Date(k.created_at))) })} · {k.last_used_at ? t("usedOn", { date: sd(todayBangkok(new Date(k.last_used_at))) }) : t("neverUsed")}
                  </span>
                </span>
                {ending === k.id ? (
                  <span className="flex items-center gap-2">
                    <span className="text-[13px]">{t("endSure")}</span>
                    <Button type="button" size="sm" variant="destructive" className="rounded-full" onClick={() => void end(k.id)}>
                      {t("end")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={() => setEnding(null)}>
                      {t("cancel")}
                    </Button>
                  </span>
                ) : (
                  <Button type="button" size="sm" variant="ghost" className="rounded-full text-bad" onClick={() => setEnding(k.id)}>
                    <Link2Off className="size-4" />
                    {t("end")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[12px] leading-relaxed text-muted-foreground">{t("netNote")}</p>
      <p className="text-[12px] leading-relaxed text-muted-foreground">{t("privacy")}</p>
    </div>
  );
}
