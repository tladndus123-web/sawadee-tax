"use client";

// The P&L's one-line AI conclusion (owner 2026-11-18): one tap sends the table's facts (lib/pl-insight plSheet) and shows
// the headline and its reasons on top of the table. Kept on this device until the table changes (sessionStorage).

import { Loader2, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { PlConclusion } from "@/lib/pl-ai";
import type { PlSheet } from "@/lib/pl-insight";

export function PlAi({ sheet, stamp }: { sheet: PlSheet; stamp: string }) {
  const t = useTranslations("pl.ai");
  const locale = useLocale();
  const key = `pl-ai:${locale}:${stamp}`;
  const [c, setC] = useState<PlConclusion | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    try {
      const kept = sessionStorage.getItem(key);
      setC(kept ? (JSON.parse(kept) as PlConclusion) : null);
    } catch {
      setC(null);
    }
  }, [key]);
  const ask = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/pl/insight", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sheet, lang: locale }) });
      const body = (await res.json().catch(() => ({}))) as { conclusion?: PlConclusion };
      if (!body.conclusion) return setFailed(true);
      setC(body.conclusion);
      try {
        sessionStorage.setItem(key, JSON.stringify(body.conclusion));
      } catch {}
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  if (sheet.months.length === 0) return null;
  return (
    <section className="workspace-panel flex flex-wrap items-start gap-3 p-4 sm:p-5" aria-label={t("title")}>
      <Sparkles className="mt-0.5 size-5 flex-none text-brand" aria-hidden />
      <div className="grid min-w-0 flex-1 gap-1">
        {c ? (
          <>
            <p className="text-[15px] font-semibold">{c.headline}</p>
            {c.reasons.map((r, i) => (
              <p key={i} className="text-[13.5px] text-muted-foreground">
                • {r}
              </p>
            ))}
          </>
        ) : (
          <p className="text-[14px] text-muted-foreground">{failed ? t("failed") : t("hint")}</p>
        )}
      </div>
      <button type="button" disabled={busy} onClick={() => void ask()} className="press inline-flex h-11 flex-none items-center gap-1.5 rounded-full bg-brand-soft px-4 text-[14px] font-semibold text-brand pointer-fine:h-9">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
        {c ? t("again") : t("run")}
      </button>
    </section>
  );
}
