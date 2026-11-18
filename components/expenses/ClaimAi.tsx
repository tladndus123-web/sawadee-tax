"use client";

// AI 결재 도우미 (owner 2026-11-18): one tap sends the waiting claims (lib/claim-review claimSheet) and shows the batch
// summary; each claim row then carries its verdict (ok / check / reject) with the reason. "Approve the clean ones" takes
// only claims the AI called ok AND with no rule flag — the admin still taps it, and is asked once more.

import { CheckCheck, Loader2, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ClaimReview, ClaimSheet, Verdict } from "@/lib/claim-review";
import { cn } from "@/lib/utils";

export interface ClaimVerdict {
  verdict: Verdict;
  reason: string;
}

export const VERDICT_TONE: Record<Verdict, string> = { ok: "bg-ok-soft text-ok", check: "bg-warn-soft text-warn", reject: "bg-bad-soft text-bad" };

export function ClaimAi({
  sheet,
  ids,
  clean,
  busy,
  onReview,
  onApproveClean,
}: {
  sheet: ClaimSheet;
  /** The claim id for each n of the sheet (n - 1) */
  ids: string[];
  /** Claims the AI called ok that have no rule flag */
  clean: string[];
  busy: boolean;
  onReview: (byId: Map<string, ClaimVerdict>) => void;
  onApproveClean: () => void;
}) {
  const t = useTranslations("expenses.ai");
  const locale = useLocale();
  const [asking, setAsking] = useState(false);
  const [summary, setSummary] = useState("");
  const [failed, setFailed] = useState(false);
  const [sure, setSure] = useState(false);
  const ask = async () => {
    setAsking(true);
    setFailed(false);
    try {
      const res = await fetch("/api/expenses/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sheet, lang: locale }) });
      const body = (await res.json().catch(() => ({}))) as { review?: ClaimReview };
      if (!body.review) return setFailed(true);
      setSummary(body.review.summary);
      onReview(new Map(body.review.verdicts.flatMap((v) => (ids[v.n - 1] ? [[ids[v.n - 1], { verdict: v.verdict, reason: v.reason }] as const] : []))));
    } catch {
      setFailed(true);
    } finally {
      setAsking(false);
    }
  };
  return (
    <section className="workspace-panel hover-lift [--lift:1.006] grid gap-3 p-4 sm:p-5" aria-label={t("title")}>
      <div className="flex flex-wrap items-start gap-3">
        <Sparkles className="mt-0.5 size-5 flex-none text-brand" aria-hidden />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p className="text-[15px] font-semibold">{t("title")}</p>
          <p className="text-[13.5px] text-muted-foreground">{failed ? t("failed") : summary || t("hint", { n: sheet.claims.length })}</p>
        </div>
        <button type="button" disabled={asking} onClick={() => void ask()} className="press inline-flex h-11 flex-none items-center gap-1.5 rounded-full bg-brand-soft px-4 text-[14px] font-semibold text-brand pointer-fine:h-9">
          {asking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          {summary ? t("again") : t("run")}
        </button>
      </div>
      {summary && clean.length > 0 && (
        <div className={cn("flex flex-wrap items-center gap-2 rounded-2xl bg-ok-soft/60 px-3 py-2.5")}>
          <p className="min-w-0 flex-1 text-[13px]">{sure ? t("sure", { n: clean.length }) : t("cleanHint", { n: clean.length })}</p>
          {sure && (
            <Button type="button" variant="ghost" className="h-11 rounded-full px-3 pointer-fine:h-9" onClick={() => setSure(false)}>
              {t("cancel")}
            </Button>
          )}
          <Button
            type="button"
            className="h-11 rounded-full px-4 pointer-fine:h-9"
            disabled={busy}
            onClick={() => {
              if (!sure) return setSure(true);
              setSure(false);
              onApproveClean();
            }}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}
            {t("approveClean", { n: clean.length })}
          </Button>
        </div>
      )}
    </section>
  );
}
