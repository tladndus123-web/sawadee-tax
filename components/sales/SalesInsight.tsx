"use client";

// The sales screen's AI card (owner, 2026-11-06: "매출에도 AI 넣어줘 소넷"): Sonnet reads the month's sales and costs
// (lib/insights-server salesReport) → one line on how the month is going, three findings and up to three things to do.
// Admins nobody limited only (it sees every branch); kept on the server until the sales change.

import { ArrowRight, Lightbulb, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

interface Report {
  headline: string;
  points: string[];
  actions: { title: string; why: string; link: string }[];
}

export function SalesInsight({ month }: { month: string }) {
  const t = useTranslations("sales.ai");
  const locale = useLocale();
  const [report, setReport] = useState<Report | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "none" | "fail">("loading");
  const [round, setRound] = useState(0);
  useEffect(() => {
    let live = true;
    setState("loading");
    void fetch("/api/sales/insights", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ month, lang: locale }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { body?: Report | null }) => live && (j.body ? (setReport(j.body), setState("ok")) : setState("none")))
      .catch(() => live && setState("fail"));
    return () => void (live = false);
  }, [month, locale, round]);

  return (
    <section className="workspace-panel ai-ring grid content-start gap-3.5 p-5 sm:p-6" aria-label={t("title")} aria-busy={state === "loading"}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-primary">
          <Sparkles className="size-4" aria-hidden />
          {t("title")}
        </span>
        {state === "fail" && (
          <button type="button" onClick={() => setRound((n) => n + 1)} className="press grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted" aria-label={t("retry")}>
            <RefreshCw className="size-4" />
          </button>
        )}
      </div>
      {state === "loading" ? (
        <div className="grid gap-2.5">
          <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("making")}
          </span>
          <span className="h-5 w-4/5 animate-pulse rounded-full bg-muted" />
          {[1, 2, 3].map((n) => (
            <span key={n} className="h-10 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : state === "ok" && report ? (
        <>
          <p className="text-[15.5px] leading-relaxed font-semibold text-pretty">{report.headline}</p>
          {report.points.length > 0 && (
            <ul className="grid gap-1.5">
              {report.points.map((p, i) => (
                <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-foreground/80">
                  <span className="mt-[9px] size-1.5 flex-none rounded-full bg-primary" aria-hidden />
                  <span className="text-pretty">{p}</span>
                </li>
              ))}
            </ul>
          )}
          {report.actions.length > 0 && (
            <div className="grid gap-2">
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
                <Lightbulb className="size-3.5" aria-hidden />
                {t("todo")}
              </span>
              <ol className="grid gap-2">
                {report.actions.map((a, n) => {
                  // This screen itself needs no link
                  const href = a.link && a.link !== "/sales" ? a.link : "";
                  const body = (
                    <>
                      <span className={cn("grid size-7 flex-none place-items-center rounded-full text-[13px] font-bold", n === 0 ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")}>{n + 1}</span>
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <b className="text-[14px] leading-snug">{a.title}</b>
                        {a.why && <span className="text-[12.5px] leading-snug text-muted-foreground">{a.why}</span>}
                      </span>
                      {href && <ArrowRight className="mt-1 size-4 flex-none text-muted-foreground" aria-hidden />}
                    </>
                  );
                  return (
                    <li key={n}>
                      {href ? (
                        <Link href={href} className="press flex items-start gap-3 rounded-2xl bg-muted/50 px-3.5 py-3 hover:bg-muted">
                          {body}
                        </Link>
                      ) : (
                        <div className="flex items-start gap-3 rounded-2xl bg-muted/50 px-3.5 py-3">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          <p className="text-[11.5px] text-muted-foreground">{t("note")}</p>
        </>
      ) : (
        <p className="text-[14px] text-muted-foreground">{state === "fail" ? t("fail") : t("none")}</p>
      )}
    </section>
  );
}
