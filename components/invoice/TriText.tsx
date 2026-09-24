"use client";

import { useTranslations } from "next-intl";
import { type FormMode, pickTri } from "@/lib/form-labels";
import type { Tri } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Shows a {th, en, ja} value in the chosen form mode.
 * "all": Thai on the first line, English and Japanese below in small grey text.
 * `unsure` adds a dotted underline and a "Check" badge; clicking it calls onUnsure (photo zoom).
 */
export function TriText({
  value,
  mode,
  unsure,
  onUnsure,
  className,
  primaryClassName,
}: {
  value: Tri | null | undefined;
  mode: FormMode;
  unsure?: boolean;
  onUnsure?: () => void;
  className?: string;
  primaryClassName?: string;
}) {
  const parts = pickTri(value, mode);
  // Empty but unclear: still show the badge so the field is not silently skipped (review #7)
  if (!parts.length)
    return (
      <Flag on={!!unsure} onJump={onUnsure} className={className}>
        <span className="text-muted-foreground">—</span>
      </Flag>
    );
  return (
    <span className={cn("block min-w-0 [overflow-wrap:anywhere]", className)}>
      {parts.map(([lg, text], i) => (
        <span
          key={lg}
          lang={lg}
          className={cn(
            "block",
            i === 0 ? [mode === "all" && "font-medium", unsure && "unsure", primaryClassName] : "text-[13px] text-muted-foreground",
          )}
        >
          {text}
        </span>
      ))}
      {unsure && <UnsureBadge onClick={onUnsure} />}
    </span>
  );
}

/**
 * Any value (number, date, code, text) the AI read unclearly: dotted underline + "Check" badge.
 * One wrapper for every field type so no field path is missed (review #7).
 */
export function Flag({
  on,
  onJump,
  align = "start",
  className,
  children,
}: {
  on: boolean;
  onJump?: () => void;
  align?: "start" | "end";
  className?: string;
  children: React.ReactNode;
}) {
  if (!on) return <>{children}</>;
  return (
    <span className={cn("inline-grid", align === "end" ? "justify-items-end" : "justify-items-start", className)}>
      <span className="unsure">{children}</span>
      <UnsureBadge onClick={onJump} />
    </span>
  );
}

/** Orange "Check" badge; a button when it can jump to the photo */
export function UnsureBadge({ onClick }: { onClick?: () => void }) {
  const t = useTranslations("app");
  const cls = "mt-1 inline-flex w-fit items-center rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn print:hidden";
  if (!onClick) return <span className={cls}>{t("unsure")}</span>;
  return (
    <button type="button" onClick={onClick} className={cn(cls, "hover:underline")}>
      {t("unsure")}
    </button>
  );
}
