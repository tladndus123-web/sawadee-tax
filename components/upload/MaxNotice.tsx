"use client";

import { Images } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Photos one batch can hold (lib/extract-schema MAX_PHOTOS). Kept here so the dashboard does not load the upload screen. */
const MAX_PHOTOS = 5;

export function MaxNotice({ className }: { className?: string }) {
  const t = useTranslations("batch");
  return (
    <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-[13px] font-semibold text-brand", className)}>
      <Images className="size-4" aria-hidden />
      {t("maxNotice", { max: MAX_PHOTOS })}
    </span>
  );
}
