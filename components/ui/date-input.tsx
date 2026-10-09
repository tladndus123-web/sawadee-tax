"use client";

// A date field that reads in the app's language. The browser's own date box writes its placeholder and the date in
// the browser's language (a Korean browser shows "연도-월-일" on the Thai screen), so its text is hidden and the
// date is drawn on top the way the app shows dates everywhere else (lib/screen-date). Tapping still opens the
// browser's calendar; the value stays YYYY-MM-DD.

import { useTranslations } from "next-intl";
import type * as React from "react";
import { useScreenDate } from "@/components/ScreenDate";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function DateInput({
  className,
  wrapClassName,
  shown,
  onClick,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & {
  /** Classes for the outer box (width, layout) */
  wrapClassName?: string;
  /** The date to draw when the field is bound without `value` (react-hook-form register): pass watch(name) */
  shown?: string;
}) {
  const t = useTranslations("common");
  const sd = useScreenDate();
  const v = shown ?? (typeof props.value === "string" ? props.value : "");
  return (
    <span className={cn("relative block w-full", wrapClassName)}>
      <Input
        type="date"
        {...props}
        onClick={(e) => {
          // Open the calendar wherever the field is tapped, not only on the browser's small icon
          try {
            e.currentTarget.showPicker?.();
          } catch {}
          onClick?.(e);
        }}
        className={cn("cursor-pointer text-transparent [&::-webkit-datetime-edit]:opacity-0", className)}
      />
      <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 right-8 left-2.5 flex items-center overflow-hidden text-base whitespace-nowrap tabular-nums md:text-sm", !v && "text-muted-foreground")}>
        {v ? sd(v) : t("pickDate")}
      </span>
    </span>
  );
}
