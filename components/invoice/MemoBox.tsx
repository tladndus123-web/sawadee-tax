"use client";

// The person's own remark on a document (비고), separate from the AI's note. On a saved document it is kept as soon
// as the box is left (`onCommit`); on a new one it goes with the save. Not part of the figures, so a closed month's
// document can take one too.

import { Check, Loader2, NotebookPen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { toast } from "sonner";
import type { LedgerDoc } from "@/lib/types";
import { cn } from "@/lib/utils";

export const MEMO_MAX = 1000;

export function MemoBox({ onCommit, className }: { onCommit?: (text: string) => Promise<void>; className?: string }) {
  const t = useTranslations("memo");
  const { control } = useFormContext<LedgerDoc>();
  const last = useRef<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  const commit = async (text: string) => {
    if (!onCommit) return;
    const value = text.trim();
    if (last.current === null || value === last.current) return;
    setState("saving");
    try {
      await onCommit(value);
      last.current = value;
      setState("saved");
      setTimeout(() => setState("idle"), 1800);
    } catch {
      setState("idle");
      toast.error(t("fail"));
    }
  };

  return (
    <Controller
      control={control}
      name="memo"
      render={({ field }) => {
        if (last.current === null) last.current = (field.value ?? "").trim();
        return (
          <label className={cn("grid gap-1.5 rounded-xl border border-rule bg-card px-3 py-2.5 print:border-0 print:px-0", className)}>
            <span className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <NotebookPen className="size-3.5" aria-hidden />
                {t("label")}
              </span>
              {state === "saving" && <Loader2 className="size-3.5 animate-spin" aria-label={t("saving")} />}
              {state === "saved" && (
                <span className="flex items-center gap-1 text-ok">
                  <Check className="size-3.5" aria-hidden />
                  {t("saved")}
                </span>
              )}
            </span>
            <textarea
              value={field.value ?? ""}
              onChange={(e) => field.onChange(e.target.value.slice(0, MEMO_MAX))}
              onBlur={() => {
                field.onBlur();
                void commit(field.value ?? "");
              }}
              rows={2}
              placeholder={t("placeholder")}
              className="min-h-[3.25rem] w-full resize-y rounded-lg bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70 focus-visible:bg-muted/40 print:resize-none"
            />
          </label>
        );
      }}
    />
  );
}
