"use client";

import { useTranslations } from "next-intl";
import { LABEL_KEYS, type LabelKey } from "@/lib/form-labels";

const RENAME: Record<string, string> = { dueDate: "due", formSerial: "serial" };

/** Field path → a readable name in the screen language:
 *  "items.0.desc" → "품명 1", "seller.taxId" → "판매자 · 세금번호", "totals.vat" → "부가세 7%" */
export function usePathLabel() {
  const t = useTranslations();
  const isLabel = (k: string): k is LabelKey => (LABEL_KEYS as string[]).includes(k);
  const label = (k: string) => (isLabel(k) ? t(`labels.${k}`) : k);
  return (p: string) => {
    if (p === "category") return t("app.category");
    if (p === "payment") return t("app.payment");
    const [a, b, c] = p.split(".");
    if (a === "items" && c) return `${label(c)} ${Number(b) + 1}`;
    if (a === "totals" && b) return label(b);
    if (b && isLabel(a)) return b === "name" ? label(a) : `${label(a)} · ${label(b)}`;
    return label(RENAME[a] ?? a);
  };
}
