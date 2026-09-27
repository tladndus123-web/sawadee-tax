"use client";

import { useLocale } from "next-intl";
import { screenDate } from "@/lib/screen-date";

/** screenDate() in the current screen language */
export function useScreenDate(): (iso: string | null | undefined) => string {
  const locale = useLocale();
  return (iso) => screenDate(locale, iso);
}
