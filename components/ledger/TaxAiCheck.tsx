"use client";

// AI 신고 전 점검 on the tax hub (owner 2026-11-18): one tap sends the month's facts (lib/tax-check TaxSheet, worked out by
// the hub) and shows the model's check list — red / amber / ok, each with the screen that fixes it. Kept on this device
// for the month until the facts change (sessionStorage), so going back and forth does not ask again.

import { CircleAlert, CircleCheck, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { CheckLink, TaxCheck, TaxSheet } from "@/lib/tax-check";
import { cn } from "@/lib/utils";

const ICON = { red: CircleAlert, amber: TriangleAlert, ok: CircleCheck } as const;
const TONE = { red: "text-bad", amber: "text-warn", ok: "text-ok" } as const;

export function TaxAiCheck({ sheet }: { sheet: TaxSheet }) {
  const t = useTranslations("taxes.ai");
  const locale = useLocale();
  const key = `tax-ai:${sheet.month}:${locale}:${JSON.stringify(sheet).length}:${sheet.vat.toPay}:${sheet.documentsToCheck}`;
  const [check, setCheck] = useState<TaxCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    try {
      const kept = sessionStorage.getItem(key);
      setCheck(kept ? (JSON.parse(kept) as TaxCheck) : null);
    } catch {
      setCheck(null);
    }
  }, [key]);

  const href = (l: CheckLink) =>
    l === "filing" ? `/ledger/filing/${sheet.month}` : l === "ledger" ? "/ledger" : l === "dups" ? "/ledger?status=dup" : l === "payroll" ? "/payroll" : l === "calendar" ? "/calendar" : null;

  const ask = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/taxes/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sheet, lang: locale }) });
      const body = (await res.json().catch(() => ({}))) as { check?: TaxCheck };
      if (!body.check) return setFailed(true);
      setCheck(body.check);
      try {
        sessionStorage.setItem(key, JSON.stringify(body.check));
      } catch {}
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="workspace-panel hover-lift [--lift:1.006] grid gap-3 p-5 sm:p-6" aria-labelledby="tax-ai-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 id="tax-ai-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Sparkles className="size-5 text-brand" aria-hidden />
            {t("title")}
          </h2>
          <p className="text-[13px] text-muted-foreground">{t("sub")}</p>
        </div>
        <button type="button" disabled={busy} onClick={() => void ask()} className="press inline-flex h-11 items-center gap-1.5 rounded-full bg-brand-soft px-4 text-[14px] font-semibold text-brand pointer-fine:h-9">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          {check ? t("again") : failed ? t("retry") : t("run")}
        </button>
      </div>
      {failed && !busy && <p className="text-[13px] text-bad">{t("failed")}</p>}
      {check && (
        <div className="grid gap-2">
          <p className="text-[14.5px] font-medium">{check.summary}</p>
          <ul className="grid gap-1.5">
            {check.checks.map((c, i) => {
              const Icon = ICON[c.level];
              const to = href(c.link);
              return (
                <li key={i} className="flex items-start gap-2.5 rounded-xl bg-muted/50 px-3 py-2.5 text-[13.5px]">
                  <Icon className={cn("mt-0.5 size-4 flex-none", TONE[c.level])} aria-hidden />
                  <span className="min-w-0 flex-1">{c.text}</span>
                  {to && (
                    <Link href={to} className="flex-none text-[13px] font-medium whitespace-nowrap text-primary hover:underline">
                      {t(`link.${c.link}` as never)} →
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-[11.5px] text-muted-foreground">{t("note")}</p>
        </div>
      )}
    </section>
  );
}
