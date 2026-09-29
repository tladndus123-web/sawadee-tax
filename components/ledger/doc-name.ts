"use client";

// A document's name in lists (ledger, dashboard, payment run): lib/doc-label in the screen language, with
// "… and N more" when it is named after its first item line, and a dash when there is nothing to show.

import { useLocale, useTranslations } from "next-intl";
import { useCallback } from "react";
import { docLabel } from "@/lib/doc-label";
import { exportLang } from "@/lib/export";
import type { LedgerDoc } from "@/lib/types";

export function useDocName(): (doc: Pick<LedgerDoc, "seller" | "docNo" | "items">) => string {
  const t = useTranslations("archive");
  const lang = exportLang(useLocale());
  return useCallback(
    (doc) => {
      const { name, more } = docLabel(doc, lang);
      if (!name) return "—";
      return more > 0 ? t("andMore", { name, count: more }) : name;
    },
    [lang, t],
  );
}
