"use client";

// The two ways to add a document, always side by side: upload a photo / PDF, or type it in without a photo.

import { ImagePlus, Keyboard } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useMe } from "@/lib/role-store";
import { canOpen } from "@/lib/screens";
import { cn } from "@/lib/utils";

export function AddDocButtons({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  const t = useTranslations();
  const h = size === "sm" ? "min-h-11 pointer-fine:min-h-9 px-3.5 text-sm" : "min-h-11 px-5 text-[15px]";
  // Only the ways in an owner let this admin open (lib/screens): typing one in is part of the ledger
  const me = useMe();
  const photo = canOpen(me, "upload");
  const typed = canOpen(me, "ledger");
  if (!photo && !typed) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {photo && (
      <Link href="/upload" className={cn("press flex items-center gap-2 rounded-full bg-primary font-medium text-primary-foreground shadow-[0_1px_2px_rgb(0_0_0/12%)] hover:bg-primary/90 active:scale-[0.97]", h)}>
        <ImagePlus className="size-4" aria-hidden />
        {t("batch.cta")}
      </Link>
      )}
      {typed && (
      <Link
        href="/documents/new"
        className={cn("press flex items-center gap-2 rounded-full bg-secondary font-medium hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] active:scale-[0.97]", h)}
      >
        <Keyboard className="size-4" aria-hidden />
        {t("manual.short")}
      </Link>
      )}
    </div>
  );
}
