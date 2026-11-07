"use client";

// Connect Grok Bot (or another AI agent) to the books (owner, 2026-11-08): make a key, paste the connector settings into
// Grok Bot, add a daily routine. The agent may read summaries and put dates in the tax calendar (lib/bot-server.ts).
// Owners only; the key is shown once.

import { Ban, Check, CircleCheck, Copy, KeyRound, Link2Off, Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useScreenDate } from "@/components/ScreenDate";
import { todayBangkok } from "@/lib/thai-tax";
import { useFoldStatus } from "./SettingsFold";

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
  useFoldStatus(keys === null ? null : keys.length ? tf("linked") : tf("notLinked"), !!keys?.length);

  const load = useCallback(async () => {
    const r = await fetch("/api/bot-keys");
    if (r.ok) setKeys(((await r.json()) as { keys: KeyRow[] }).keys);
  }, []);
  useEffect(() => void load(), [load]);

  const url = typeof window === "undefined" ? "/api/mcp" : `${window.location.origin}/api/mcp`;
  const key = fresh ?? "sk_sawa_…";
  const config = JSON.stringify(
    { mcpServers: { "sawadee-tax": { command: "npx", args: ["-y", "mcp-remote", url, "--header", "Authorization:${SAWADEE_KEY}"], env: { SAWADEE_KEY: `Bearer ${key}` } } } },
    null,
    2,
  );

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
        <li className="flex gap-2"><Ban className="mt-0.5 size-4 flex-none text-bad" aria-hidden />{t("can.not")}</li>
      </ul>

      <ol className="grid gap-5">
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
          <CopyBox text={config} label={t("config")} />
          <details className="text-[13px]">
            <summary className="cursor-pointer font-medium text-primary">{t("urlOnly")}</summary>
            <div className="mt-2 grid gap-2">
              <CopyBox text={url} label="URL" />
              <CopyBox text={`Authorization: Bearer ${key}`} label={t("header")} />
            </div>
          </details>
        </li>
        <li className="grid gap-2">
          <span className="text-[14px] font-semibold">3. {t("step3")}</span>
          <CopyBox text={t("routine")} label={t("routineLabel")} mono={false} />
          <p className="text-[13px] text-muted-foreground">{t("askExamples")}</p>
        </li>
      </ol>

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
      <p className="text-[12px] leading-relaxed text-muted-foreground">{t("privacy")}</p>
    </div>
  );
}
