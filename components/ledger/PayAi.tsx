"use client";

// AI 지급 순서 추천 on "to pay" (owner 2026-11-18): one tap sends the bills shown (lib/pay-advice PaySheet) and shows what
// to pay first and why; "추천대로 고르기" ticks those bills so "오늘 지급함" is one more tap.

import { CheckCheck, Loader2, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { PayAdvice, PaySheet } from "@/lib/pay-advice";

export function PayAi({ sheet, onPick }: { sheet: PaySheet; onPick: (numbers: number[]) => void }) {
  const t = useTranslations("payables.ai");
  const locale = useLocale();
  const [advice, setAdvice] = useState<PayAdvice | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const ask = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/payables/advice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sheet, lang: locale }) });
      const body = (await res.json().catch(() => ({}))) as { advice?: PayAdvice };
      if (body.advice) setAdvice(body.advice);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="workspace-panel hover-lift [--lift:1.006] grid gap-3 p-5 sm:p-6" aria-labelledby="pay-ai-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 id="pay-ai-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Sparkles className="size-5 text-brand" aria-hidden />
            {t("title")}
          </h2>
          <p className="text-[13px] text-muted-foreground">{t("sub")}</p>
        </div>
        <button type="button" disabled={busy} onClick={() => void ask()} className="press inline-flex h-11 items-center gap-1.5 rounded-full bg-brand-soft px-4 text-[14px] font-semibold text-brand pointer-fine:h-9">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          {advice ? t("again") : failed ? t("retry") : t("run")}
        </button>
      </div>
      {failed && !busy && <p className="text-[13px] text-bad">{t("failed")}</p>}
      {advice && (
        <div className="grid gap-2">
          <p className="text-[14.5px] font-medium">{advice.summary}</p>
          {advice.actions.length > 0 && (
            <ol className="grid list-decimal gap-1 pl-5 text-[13.5px] text-muted-foreground">
              {advice.actions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ol>
          )}
          {advice.payFirst.length > 0 && (
            <button type="button" onClick={() => onPick(advice.payFirst)} className="press inline-flex h-11 w-fit items-center gap-1.5 rounded-full bg-primary px-4 text-[14px] font-semibold text-primary-foreground pointer-fine:h-9">
              <CheckCheck className="size-4" aria-hidden />
              {t("pick", { count: advice.payFirst.length })}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
