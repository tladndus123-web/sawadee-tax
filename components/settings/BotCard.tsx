"use client";

// Connect Grok Bot (or another AI agent) to the books (owner, 2026-11-08): make a key, add a custom connector in Grok Bot
// (server URL + Authorization header), ask it for a daily routine. The agent may read summaries and put dates in the tax calendar (lib/bot-server.ts).
// Owners only; the key is shown once.

import { Ban, Check, CircleCheck, Copy, Download, ExternalLink, KeyRound, Link2Off, Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useScreenDate } from "@/components/ScreenDate";
import { todayBangkok } from "@/lib/thai-tax";
import { downloadBlob } from "@/lib/attendance-share";
import { skillMarkdown } from "@/lib/bot-skill";
import { cn } from "@/lib/utils";
import { usePref } from "@/lib/user-prefs";
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
        <button type="button" onClick={() => void copy()} className="press inline-flex h-11 pointer-fine:h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-primary hover:bg-primary/10">
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
  const [marked, setMarked] = usePref<string[]>("grokSetup", (v) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []), []);
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
      const j = (await r.json()) as { error?: string; hook?: { id: string } };
      if (!r.ok) throw new Error(j.error);
      setHookUrl("");
      setHookKey("");
      await loadHooks();
      toast.success(t("hook.added"));
      if (j.hook?.id) await testHook(j.hook.id);
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
  useFoldStatus(keys === null ? null : keys.some((k) => !!k.last_used_at) ? tf("linked") : tf("notLinked"), !!keys?.some((k) => !!k.last_used_at));

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

  // Two steps (owner 2026-11-08: "인증이 너무 오래 걸리고 연결도 힘들다"): ① one tap makes a key and copies the whole
  // connector JSON → paste it into Grok Bot's "MCP server JSON" box (no sign-in window); ticks itself when Grok Bot first
  // uses the key. ② one sentence that makes Grok Bot save the skill, the memory, the event routine and the nightly routine.
  const linked = (keys ?? []).some((k) => !!k.last_used_at);
  const skillUrl = `${url.replace(/\/api\/mcp$/, "")}/api/bot-skill`;
  const allInOne = t("setup.allInOne", { url: skillUrl });
  const setupDone = marked.includes("all");
  const hooked = hooks.length > 0;
  const current = !linked ? 0 : !setupDone ? 1 : !hooked && !marked.includes("nohook") ? 2 : -1;
  const connect = async () => {
    await make();
  };
  // While waiting for Grok Bot to use the new key, look every 4 s (at most 5 minutes)
  useEffect(() => {
    if (!fresh || linked) return;
    const started = Date.now();
    const id = setInterval(() => {
      if (Date.now() - started > 300_000) return clearInterval(id);
      void load();
    }, 4000);
    return () => clearInterval(id);
  }, [fresh, linked, load]);
  useEffect(() => {
    if (fresh) void navigator.clipboard.writeText(config).then(() => toast.success(t("setup.jsonCopied"))).catch(() => undefined);
  }, [fresh]); // eslint-disable-line react-hooks/exhaustive-deps -- copy once, when the key is made

  return (
    <div className="grid gap-5">
      <p className="text-[14px] leading-relaxed text-muted-foreground">{t("intro")}</p>

      {/* Setup in two steps — the rest lives under "자세한 설정" */}
      <section className="grid gap-3 rounded-2xl bg-brand-soft/60 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[14px] font-semibold">{t("setup.short")}</span>
          <span className={cn("text-[13px] font-medium tabular-nums", current === -1 ? "text-ok" : "text-primary")}>{t("setup.progress", { done: current === -1 ? 3 : current, total: 3 })}</span>
        </div>
        <ol className="grid gap-1.5">
          {/* ① connect */}
          <li className={cn("grid gap-2 rounded-2xl px-3.5 py-2.5", current === 0 ? "bg-card shadow-[0_0_0_1px_var(--border)]" : "")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2.5">
                <span className={cn("grid size-7 flex-none place-items-center rounded-full text-[13px] font-bold", linked ? "bg-ok text-white" : "bg-primary text-primary-foreground")}>{linked ? <Check className="size-4" aria-hidden /> : 1}</span>
                <span className="text-[14px] font-medium">{t("setup.connectTitle")}</span>
              </span>
              {linked && <span className="text-[12px] text-ok">{t("setup.connected")}</span>}
            </div>
            {current === 0 && (
              <div className="grid gap-2.5 pl-[38px]">
                {!fresh ? (
                  <>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">{t("setup.connectSub")}</p>
                    <Button type="button" onClick={() => void connect()} disabled={busy} className="h-10 w-fit rounded-full">
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
                      {t("setup.connectButton")}
                    </Button>
                  </>
                ) : (
                  <>
                    <ol className="grid list-decimal gap-1 pl-5 text-[13.5px]">
                      <li>{t("setup.paste1")}</li>
                      <li>{t("setup.paste2")}</li>
                      <li>{t("setup.paste3")}</li>
                    </ol>
                    <div className="flex flex-wrap gap-2">
                      <a href="grokbot://app/v1/marketplace?tab=plugins" className="press inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-[14px] font-medium text-primary-foreground hover:bg-primary/90">
                        <ExternalLink className="size-4" aria-hidden />
                        {t("setup.openConnectors")}
                      </a>
                    </div>
                    <CopyBox text={config} label={t("setup.jsonLabel")} />
                    <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      {t("setup.waiting")}
                    </p>
                  </>
                )}
              </div>
            )}
          </li>
          {/* ② everything else, one sentence */}
          <li className={cn("grid gap-2 rounded-2xl px-3.5 py-2.5", current === 1 ? "bg-card shadow-[0_0_0_1px_var(--border)]" : "")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2.5">
                <span className={cn("grid size-7 flex-none place-items-center rounded-full text-[13px] font-bold", setupDone ? "bg-ok text-white" : current === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{setupDone ? <Check className="size-4" aria-hidden /> : 2}</span>
                <span className={cn("text-[14px] font-medium", current !== 1 && !setupDone && "text-muted-foreground")}>{t("setup.allTitle")}</span>
              </span>
              {setupDone && (
                <a href={`grokbot://app/v1/prompt?text=${encodeURIComponent(allInOne)}`} onClick={() => void navigator.clipboard.writeText(allInOne).catch(() => undefined)} className="-my-3 inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-[12px] font-medium text-muted-foreground hover:text-primary hover:underline pointer-fine:my-0 pointer-fine:min-h-0 pointer-fine:min-w-0 pointer-fine:px-0">
                  {t("setup.again")}
                </a>
              )}
            </div>
            {current === 1 && (
              <div className="grid gap-2.5 pl-[38px]">
                <p className="text-[13px] leading-relaxed text-muted-foreground">{t("setup.allSub")}</p>
                <CopyBox text={allInOne} label={t("setup.textLabel")} mono={false} />
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`grokbot://app/v1/prompt?text=${encodeURIComponent(allInOne)}`}
                    onClick={() => void navigator.clipboard.writeText(allInOne).then(() => toast.success(t("setup.copiedText"))).catch(() => undefined)}
                    className="press inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-[14px] font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <ExternalLink className="size-4" aria-hidden />
                    {t("setup.go")}
                  </a>
                  <button type="button" onClick={() => setMarked([...marked, "all"])} className="press inline-flex h-10 items-center gap-1.5 rounded-full bg-card px-4 text-[14px] font-medium shadow-[0_0_0_1px_var(--border)] hover:bg-muted">
                    <Check className="size-4 text-ok" aria-hidden />
                    {t("setup.markDone")}
                  </button>
                </div>
                <p className="text-[12px] text-muted-foreground">{t("setup.draftNote")}</p>
              </div>
            )}
          </li>
          {/* ③ events: paste the routine's webhook URL + key (Grok Bot cannot see them itself) */}
          <li className={cn("grid gap-2 rounded-2xl px-3.5 py-2.5", current === 2 ? "bg-card shadow-[0_0_0_1px_var(--border)]" : "")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2.5">
                <span className={cn("grid size-7 flex-none place-items-center rounded-full text-[13px] font-bold", hooked ? "bg-ok text-white" : current === 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{hooked ? <Check className="size-4" aria-hidden /> : 3}</span>
                <span className={cn("text-[14px] font-medium", current !== 2 && !hooked && "text-muted-foreground")}>{t("setup.hookTitle")}</span>
              </span>
              {hooked && (
                <span className="text-[12px] text-muted-foreground">
                  {hooks[0].last_status !== null && hooks[0].last_status >= 200 && hooks[0].last_status < 300 ? t("hook.okShort") : t("hook.never")}
                </span>
              )}
            </div>
            {current === 2 && (
              <div className="grid gap-2.5 pl-[38px]">
                <ol className="grid list-decimal gap-1 pl-5 text-[13.5px]">
                  <li>{t("setup.hook1")}</li>
                  <li>{t("setup.hook2")}</li>
                  <li>{t("setup.hook3")}</li>
                </ol>
                <input id="bot-hook-url-step" value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder={t("hook.url") + " (https://…)"} aria-label={t("hook.url")} className="h-10 rounded-xl bg-card px-3 text-[14px] shadow-[0_0_0_1px_var(--border)] outline-none focus:shadow-[0_0_0_2px_var(--primary)]" />
                <input id="bot-hook-key-step" value={hookKey} onChange={(e) => setHookKey(e.target.value)} placeholder={t("hook.key")} aria-label={t("hook.key")} type="password" autoComplete="off" className="h-10 rounded-xl bg-card px-3 text-[14px] shadow-[0_0_0_1px_var(--border)] outline-none focus:shadow-[0_0_0_2px_var(--primary)]" />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => void addHook()} disabled={hookBusy === "add" || !hookUrl || !hookKey} className="h-10 rounded-full">
                    {hookBusy === "add" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    {t("setup.hookSave")}
                  </Button>
                  <button type="button" onClick={() => setMarked([...marked, "nohook"])} className="press inline-flex h-10 items-center rounded-full bg-card px-4 text-[14px] font-medium shadow-[0_0_0_1px_var(--border)] hover:bg-muted">
                    {t("setup.hookSkip")}
                  </button>
                </div>
              </div>
            )}
          </li>
        </ol>
        {current === -1 && <p className="text-[13px] text-ok">{t("setup.allDone")}</p>}
      </section>


      <p className="text-[13px] text-muted-foreground">{t("askExamples")}</p>

      <details className="rounded-2xl px-4 py-3 shadow-[0_0_0_1px_var(--border)]">
        <summary className="-my-1 cursor-pointer py-3 pointer-fine:my-0 pointer-fine:py-0 text-[14px] font-medium text-primary">{t("setup.canTitle")}</summary>
        <div className="mt-3">
      <ul className="grid gap-1.5 text-[13.5px]">
        <li className="flex gap-2"><CircleCheck className="mt-0.5 size-4 flex-none text-ok" aria-hidden />{t("can.read")}</li>
        <li className="flex gap-2"><CircleCheck className="mt-0.5 size-4 flex-none text-ok" aria-hidden />{t("can.calendar")}</li>
        <li className="flex gap-2"><CircleCheck className="mt-0.5 size-4 flex-none text-ok" aria-hidden />{t("can.draft")}</li>
        <li className="flex gap-2"><CircleCheck className="mt-0.5 size-4 flex-none text-ok" aria-hidden />{t("can.line")}</li>
        <li className="flex gap-2"><Ban className="mt-0.5 size-4 flex-none text-bad" aria-hidden />{t("can.not")}</li>
      </ul>
        </div>
      </details>

      <details className="rounded-2xl px-4 py-3 shadow-[0_0_0_1px_var(--border)]">
        <summary className="-my-1 cursor-pointer py-3 pointer-fine:my-0 pointer-fine:py-0 text-[14px] font-medium text-primary">{t("setup.advanced")}</summary>
        <div className="mt-4 grid gap-5">
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
        <summary className="-my-1 cursor-pointer py-3 pointer-fine:my-0 pointer-fine:py-0 text-[14px] font-medium text-primary">{t("keyWay")}</summary>
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
              <summary className="-my-1 cursor-pointer py-3 pointer-fine:my-0 pointer-fine:py-0 font-medium text-primary">{t("jsonInstead")}</summary>
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
          <summary className="-my-1 cursor-pointer py-3 pointer-fine:my-0 pointer-fine:py-0 font-medium text-primary">{t("skill.show")}</summary>
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
                  className="press inline-flex h-11 pointer-fine:h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                  {t("rec.make")}
                </a>
              </div>
              <details className="text-[13px]">
                <summary className="-my-1 cursor-pointer py-3 pointer-fine:my-0 pointer-fine:py-0 text-muted-foreground">{t("rec.show")}</summary>
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
        </div>
      </details>

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
      <p className="text-[12px] leading-relaxed text-muted-foreground">{t("privacy")}</p>    </div>
  );
}
