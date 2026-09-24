"use client";

import { useId } from "react";
import { type Path, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { FORM_LANGS, type LedgerDoc } from "@/lib/types";
import { cn } from "@/lib/utils";

const PLACEHOLDER = { th: "ภาษาไทย", en: "English", ja: "日本語" } as const;

/** Three inputs (TH / EN / JA) bound to a {th, en, ja} field of the form. */
export function TriInput({ name, label, className }: { name: string; label: string; className?: string }) {
  const { register } = useFormContext<LedgerDoc>();
  const id = useId();
  return (
    <div className={cn("grid gap-1", className)} role="group" aria-label={label}>
      {FORM_LANGS.map((lg) => (
        <div key={lg} className="grid grid-cols-[26px_minmax(0,1fr)] items-center gap-1.5">
          <label htmlFor={`${id}-${lg}`} className="text-[11px] font-semibold tracking-wide text-muted-foreground">
            {lg.toUpperCase()}
          </label>
          <Input
            id={`${id}-${lg}`}
            lang={lg}
            placeholder={PLACEHOLDER[lg]}
            aria-label={`${label} ${PLACEHOLDER[lg]}`}
            className="h-8"
            {...register(`${name}.${lg}` as Path<LedgerDoc>)}
          />
        </div>
      ))}
    </div>
  );
}
