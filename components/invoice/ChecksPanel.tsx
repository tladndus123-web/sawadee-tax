"use client";

import { ChevronDown, CircleCheck, Sparkles, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { type CheckResult, type DetailWord, detailText } from "@/lib/checks";
import { cn } from "@/lib/utils";
import { usePathLabel } from "./path-label";

/** Keep warnings visible and make passed calculations available in a native disclosure. */
export function ChecksPanel({
  results,
  unclear = [],
  onJump,
  className,
}: {
  results: CheckResult[];
  /** Unclear field paths; each becomes a button that zooms the photo to it (review #7) */
  unclear?: string[];
  onJump?: (path: string) => void;
  className?: string;
}) {
  const t = useTranslations();
  const pathLabel = usePathLabel();
  const titleId = useId();
  const shown = results.filter((c) => !c.na);
  const passed = shown.filter((c) => c.ok);
  const warnings = shown.filter((c) => !c.ok);
  const word = (w: DetailWord) => t(`detail.${w}`);
  const row = (c: CheckResult) => (
    <li key={c.key} className="flex min-w-0 items-start gap-3 py-3 text-sm">
      {c.ok ? (
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-label={t("app.pass")} />
      ) : (
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-label={t("app.unsure")} />
      )}
      <span className="min-w-0">
        <span className={cn(!c.ok && "font-semibold")}>{t(`checks.${c.key}`)}</span>
        <small className="mt-1 block text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
          {detailText(c.detail, word)}
        </small>
        {!c.ok && (c.key === "unclear" ? unclear : (c.paths ?? [])).length > 0 && (
          <span className="mt-2 flex flex-wrap gap-1.5">
            {(c.key === "unclear" ? unclear : (c.paths ?? [])).map((p) => (
              <button
                key={p}
                type="button"
                disabled={!onJump}
                onClick={() => onJump?.(p)}
                className="inline-flex min-h-8 items-center rounded-full bg-warn-soft px-2.5 text-xs font-semibold text-warn transition-colors hover:bg-warn/15 disabled:cursor-default"
              >
                {pathLabel(p)}
              </button>
            ))}
          </span>
        )}
      </span>
    </li>
  );

  return (
    <section aria-labelledby={titleId} className={cn("workspace-panel ai-ring overflow-hidden", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="intelligence-mark size-9 flex-none"><Sparkles className="size-4" aria-hidden /></span>
          <div className="min-w-0">
          <h3 id={titleId} className="text-sm font-semibold">{t("app.checksTitle")}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("ui.checksHint")}</p>
          </div>
        </div>
        <span role="status" className={cn("rounded-full px-3 py-1 text-xs font-semibold", warnings.length ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok")}>
          <span className="mono">{passed.length}/{shown.length}</span> {t("app.pass")}
        </span>
      </div>
      {warnings.length > 0 && (
        <div className="border-b bg-warn-soft/25 px-4 sm:px-5">
          <ul className="divide-y divide-border">{warnings.map(row)}</ul>
        </div>
      )}
      {passed.length > 0 && (
        <details className="group px-4 sm:px-5">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <CircleCheck className="size-4 text-ok" aria-hidden />
              {t("app.pass")} <span className="mono text-muted-foreground">{passed.length}</span>
            </span>
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="grid gap-x-6 border-t pb-2 md:grid-cols-2">{passed.map(row)}</ul>
        </details>
      )}
    </section>
  );
}
