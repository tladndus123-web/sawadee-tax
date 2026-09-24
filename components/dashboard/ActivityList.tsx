"use client";

import { ArchiveRestore, FilePlus2, History, Pencil, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { type Activity, loadActivity } from "@/lib/activity";
import { cn } from "@/lib/utils";

const ICON = { create: FilePlus2, update: Pencil, delete: Trash2, restore: ArchiveRestore } as const;

/** Recent audit trail: the whole company (dashboard) or one document (its review screen) */
export function ActivityList({ documentId, limit = 12, title }: { documentId?: string; limit?: number; title?: string }) {
  const t = useTranslations("dash");
  const locale = useLocale();
  const [items, setItems] = useState<Activity[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadActivity({ documentId, limit })
      .then((a) => alive && setItems(a))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [documentId, limit]);
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <section aria-labelledby={`activity-${documentId ?? "all"}`} className="workspace-panel grid gap-3 p-5 sm:p-6">
      <h2 id={`activity-${documentId ?? "all"}`} className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <History className="size-5 text-muted-foreground" aria-hidden />
        {title ?? t("activity")}
      </h2>
      {items && items.length === 0 && <p className="text-sm text-muted-foreground">{t("activityEmpty")}</p>}
      <ol className="grid">
        {(items ?? []).map((a) => {
          const Icon = ICON[a.action];
          const label = [a.seller, a.docNo].filter(Boolean).join(" · ");
          return (
            <li key={a.id} className="flex items-start gap-3 border-b border-border/60 py-2.5 last:border-0">
              <span className={cn("mt-0.5 grid size-7 flex-none place-items-center rounded-full bg-muted", a.action === "delete" && "bg-bad-soft text-bad", a.action === "restore" && "bg-ok-soft text-ok")}>
                <Icon className="size-3.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{a.who ?? t("someone")}</span> <span className="text-muted-foreground">{t(a.action)}</span>
                {!documentId && label && (
                  <>
                    {" · "}
                    <Link href={`/documents/${a.documentId}`} className="text-primary hover:underline">
                      {label}
                    </Link>
                  </>
                )}
                {a.reason && <span className="block text-xs text-muted-foreground">“{a.reason}”</span>}
              </span>
              <time dateTime={a.at} className="flex-none text-xs text-muted-foreground tabular-nums">
                {when.format(new Date(a.at))}
              </time>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
