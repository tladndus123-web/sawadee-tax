"use client";

// Change the category of several documents at once (tidying older ones after new categories were added).
// Documents of a closed month cannot be ticked (the database would refuse: their figures are filed).

import { Loader2, Tags } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { type LedgerEntry, setCategoryMany } from "@/lib/ledger-store";
import { CATEGORIES, type Category } from "@/lib/types";

export function BulkCategoryBar({ chosen, onDone }: { chosen: LedgerEntry[]; onDone: () => void }) {
  const t = useTranslations();
  const [category, setCategory] = useState<Category | "">("");
  const [busy, setBusy] = useState(false);
  if (!chosen.length) return null;

  const apply = async () => {
    if (!category) return;
    setBusy(true);
    try {
      await setCategoryMany(
        chosen.map((e) => e.id),
        category,
      );
      toast.success(t("bulkCat.done", { count: chosen.length, category: t(`category.${category}`) }));
      onDone();
    } catch {
      toast.error(t("bulkCat.fail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 grid gap-2 rounded-3xl border bg-[var(--glass)] p-2 pl-4 shadow-[var(--shadow-lift)] backdrop-blur-xl sm:flex sm:items-center sm:rounded-full md:bottom-4">
      <p className="text-sm font-semibold sm:mr-auto">{t("bulk.selected", { count: chosen.length })}</p>
      <div className="flex items-center gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Category | "")}
          aria-label={t("app.category")}
          className="h-10 min-w-0 flex-1 rounded-full border bg-background px-3 text-sm sm:w-44 sm:flex-none"
        >
          <option value="">{t("bulkCat.pick")}</option>
          {CATEGORIES.map((k) => (
            <option key={k} value={k}>
              {t(`category.${k}`)}
            </option>
          ))}
        </select>
        <Button type="button" className="h-10 flex-none rounded-full px-4" disabled={!category || busy} onClick={() => void apply()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Tags className="size-4" />}
          {t("bulkCat.apply")}
        </Button>
      </div>
    </div>
  );
}
