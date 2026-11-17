"use client";

// AI on one contract (owner 2026-11-18, lib/contract-ai): the summary kept with it (key terms, dates, what to watch out
// for) — made on the first tap, again when the file changed — and a box to ask the contract a question, answered with
// the clause it rests on. Owners and unlimited admins (the contract box's rule).

import { CalendarClock, Loader2, MessageCircleQuestion, Sparkles, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ContractAi as Summary } from "@/lib/contract-ai";
import type { Contract } from "@/lib/contracts";

export function ContractAi({ c, onClose, onSummary }: { c: Contract; onClose: () => void; onSummary: (s: Summary) => void }) {
  const t = useTranslations("contracts.ai");
  const locale = useLocale();
  const fresh = c.aiSummary && c.aiSummary.file === c.filePath ? c.aiSummary : null;
  const [summary, setSummary] = useState<Summary | null>(fresh);
  const [busy, setBusy] = useState<"summary" | "ask" | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<{ q: string; answer: string; quote: string } | null>(null);

  const post = async (question?: string) => {
    const res = await fetch("/api/contracts/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: c.id, lang: locale, question }) });
    return (await res.json().catch(() => ({}))) as { summary?: Summary; answer?: { answer: string; quote: string } };
  };
  const make = async () => {
    setBusy("summary");
    setFailed(false);
    try {
      const body = await post();
      if (body.summary) {
        setSummary(body.summary);
        onSummary(body.summary);
      } else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };
  const ask = async () => {
    const question = q.trim();
    if (!question) return;
    setBusy("ask");
    setFailed(false);
    try {
      const body = await post(question);
      if (body.answer) {
        setAnswer({ q: question, ...body.answer });
        setQ("");
      } else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] gap-4 overflow-y-auto rounded-3xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-brand" aria-hidden />
            {c.title}
          </DialogTitle>
          <DialogDescription>{t("sub")}</DialogDescription>
        </DialogHeader>

        {!summary ? (
          <Button type="button" className="h-11 rounded-full" disabled={!!busy} onClick={() => void make()}>
            {busy === "summary" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            {busy === "summary" ? t("reading") : t("make")}
          </Button>
        ) : (
          <div className="grid gap-3">
            <p className="text-[14.5px] leading-relaxed">{summary.summary}</p>
            {summary.terms.length > 0 && (
              <dl className="grid gap-1.5 rounded-2xl bg-muted/50 p-3.5 text-[13.5px]">
                {summary.terms.map((x, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,7.5rem)_1fr] gap-3 max-sm:grid-cols-1 max-sm:gap-0.5">
                    <dt className="text-muted-foreground">{x.label}</dt>
                    <dd className="font-medium">{x.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {summary.dates.length > 0 && (
              <ul className="grid gap-1 text-[13.5px]">
                {summary.dates.map((d, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CalendarClock className="size-4 flex-none text-brand" aria-hidden />
                    <span className="text-muted-foreground">{d.label}</span>
                    <span className="ml-auto font-medium tabular-nums">{d.date}</span>
                  </li>
                ))}
              </ul>
            )}
            {summary.watch.length > 0 && (
              <ul className="grid gap-1.5 rounded-2xl bg-warn-soft/70 p-3.5 text-[13.5px]">
                {summary.watch.map((w, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <TriangleAlert className="mt-0.5 size-4 flex-none text-warn" aria-hidden />
                    {w}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" disabled={!!busy} onClick={() => void make()} className="w-fit text-[12.5px] text-muted-foreground underline-offset-2 hover:underline">
              {busy === "summary" ? t("reading") : t("remake")}
            </button>
          </div>
        )}

        <div className="grid gap-2 border-t pt-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <MessageCircleQuestion className="size-4 text-brand" aria-hidden />
            {t("askTitle")}
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("askHint")} maxLength={500} className="h-11" />
            <Button type="submit" className="h-11 flex-none rounded-full px-4" disabled={!!busy || !q.trim()}>
              {busy === "ask" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : t("ask")}
            </Button>
          </form>
          {answer && (
            <div className="grid gap-1.5 rounded-2xl bg-brand-soft/60 p-3.5 text-[13.5px]">
              <p className="text-muted-foreground">Q. {answer.q}</p>
              <p className="font-medium">{answer.answer}</p>
              {answer.quote && <blockquote className="border-l-2 border-brand/40 pl-2.5 text-[12.5px] text-muted-foreground">{answer.quote}</blockquote>}
            </div>
          )}
        </div>
        {failed && <p className="text-[13px] text-bad">{t("failed")}</p>}
        <p className="text-[11.5px] text-muted-foreground">{t("note")}</p>
      </DialogContent>
    </Dialog>
  );
}
