"use client";

import { Controller, type Path, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import type { LedgerDoc } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MoneyInput, type NumKind } from "./fields";
import { DateInput } from "@/components/ui/date-input";

type Name = Path<LedgerDoc>;

/** Plain text input bound to the form. `digits` keeps only 0-9 (tax IDs). */
export function TextIn({
  name,
  label,
  mono,
  digits,
  maxLength,
  lang,
  className,
}: {
  name: string;
  label: string;
  mono?: boolean;
  digits?: boolean;
  maxLength?: number;
  lang?: string;
  className?: string;
}) {
  const { register } = useFormContext<LedgerDoc>();
  return (
    <Input
      aria-label={label}
      className={cn("h-8", mono && "mono", className)}
      inputMode={digits ? "numeric" : undefined}
      maxLength={maxLength}
      lang={lang}
      {...register(name as Name, digits ? { setValueAs: (v: string) => String(v ?? "").replace(/\D/g, "") } : {})}
    />
  );
}

export function DateIn({ name, label, className }: { name: string; label: string; className?: string }) {
  const { register, watch } = useFormContext<LedgerDoc>();
  return <DateInput aria-label={label} wrapClassName={cn("w-full sm:w-44", className)} className="h-8" shown={String(watch(name as Name) ?? "")} {...register(name as Name)} />;
}

/** Money / quantity / whole-number input bound to the form (value updates as you type) */
export function NumIn({
  name,
  label,
  kind = "money",
  className,
}: {
  name: string;
  label: string;
  kind?: NumKind;
  className?: string;
}) {
  const { control } = useFormContext<LedgerDoc>();
  return (
    <Controller
      control={control}
      name={name as Name}
      render={({ field }) => (
        <MoneyInput
          aria-label={label}
          className={className}
          kind={kind}
          name={field.name}
          ref={field.ref}
          value={Number(field.value) || 0}
          onChange={field.onChange}
          onBlur={field.onBlur}
        />
      )}
    />
  );
}
