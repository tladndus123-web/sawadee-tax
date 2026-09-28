"use client";

// Which branch a document or a day of sales belongs to — chips like the category ones. Shown only when the
// company has more than one branch (with one, everything is the head office and nobody needs to choose).

import { useTranslations } from "next-intl";
import { useBranchName } from "@/components/layout/branch-switcher";
import { branchLabel } from "@/lib/branches";
import { useBranches } from "@/lib/branch-store";
import { cn } from "@/lib/utils";

export function BranchPicker({ value, onChange, className }: { value: string; onChange: (id: string) => void; className?: string }) {
  const t = useTranslations("branch");
  const names = useBranchName();
  const { branches } = useBranches();
  if (branches.length < 2) return null;
  return (
    <div className={cn("grid gap-2", className)} role="group" aria-label={t("label")}>
      <span className="text-xs text-muted-foreground">{t("label")}</span>
      <div className="flex flex-wrap gap-2">
        {branches.map((b) => {
          const on = value === b.id;
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(b.id)}
              className={cn(
                "press h-9 rounded-full px-3.5 text-[13px] font-medium ring-1 ring-foreground/10",
                on ? "bg-primary text-primary-foreground ring-primary" : "bg-background hover:bg-muted",
              )}
            >
              {branchLabel(b, names)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
