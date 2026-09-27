"use client";

// What's new on the upload screen, in two short cards: two documents per shot, and more photos at once.

import { Columns2, Layers } from "lucide-react";
import { useTranslations } from "next-intl";
import { MAX_PHOTOS, MAX_QUEUE } from "@/lib/extract-schema";

export function UploadTips() {
  const t = useTranslations("tips");
  const cards = [
    { icon: Columns2, title: t("twoTitle"), body: t("twoBody") },
    { icon: Layers, title: t("moreTitle", { max: MAX_QUEUE }), body: t("moreBody", { max: MAX_QUEUE, at: MAX_PHOTOS }) },
  ];
  return (
    <section className="grid gap-3 sm:grid-cols-2" aria-label={t("label")}>
      {cards.map(({ icon: Icon, title, body }) => (
        <div key={title} className="workspace-panel flex items-start gap-3 p-4">
          <span className="intelligence-mark is-soft size-10 flex-none">
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="grid gap-1">
            <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
              {title}
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">{t("new")}</span>
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
