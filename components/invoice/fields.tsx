"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import type { FormMode, LabelKey } from "@/lib/form-labels";
import { fmt, fmtQty, parseBaht, parseQty } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useFormLabels } from "./form-config-context";

/**
 * Field label. View mode: the form languages. Edit mode: Thai (as printed) plus the UI language.
 */
export function FieldLabel({
  k,
  mode,
  edit,
  className,
  htmlFor,
}: {
  k: LabelKey;
  mode: FormMode;
  edit?: boolean;
  className?: string;
  htmlFor?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("labels");
  const { pick } = useFormLabels();
  const lines: [string, string][] = edit
    ? [["th", pick(k, "th")[0][1]], ...(locale !== "th" ? [[locale, t(k)] as [string, string]] : [])]
    : pick(k, mode);
  const Tag = htmlFor ? "label" : "span";
  return (
    <Tag htmlFor={htmlFor} className={cn("grid text-xs leading-snug text-muted-foreground", className)}>
      {lines.map(([lg, x]) => (
        <span key={lg} lang={lg}>
          {x}
        </span>
      ))}
    </Tag>
  );
}

/** Label / value row; rows inside a Box are separated by a dashed rule */
export function Kv({
  k,
  mode,
  edit,
  children,
  className,
}: {
  k: LabelKey;
  mode: FormMode;
  edit?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid items-baseline gap-x-3 gap-y-1 @[15rem]:grid-cols-[minmax(0,96px)_minmax(0,1fr)] @md:grid-cols-[minmax(0,130px)_minmax(0,1fr)]",
        "[&+&]:border-t [&+&]:border-dashed [&+&]:border-rule-soft [&+&]:pt-2",
        className,
      )}
    >
      <FieldLabel k={k} mode={mode} edit={edit} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Thin-bordered box, like the boxes printed on the paper form */
export function Box({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("@container grid min-w-0 content-start gap-2 border border-rule px-3 py-2.5", className)}>{children}</div>;
}

/** Plain mono value or a dash */
export function Mono({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <span className={cn("mono [overflow-wrap:anywhere]", className)}>{children || "—"}</span>;
}

/** Chip used for doc type, branch, etc. */
export function Chip({ children, tone, className }: { children: React.ReactNode; tone?: "brand" | "ok" | "warn" | "bad"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit min-w-0 max-w-full items-center rounded-full bg-band px-2 py-0.5 text-xs whitespace-normal text-muted-foreground [overflow-wrap:anywhere]",
        tone === "brand" && "bg-brand-soft font-semibold text-brand",
        tone === "ok" && "bg-ok-soft text-ok",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "bad" && "bg-bad-soft text-bad",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** money: baht, 2 decimals · qty: up to 4 decimals · int: whole days */
export type NumKind = "money" | "qty" | "int";
const PARSE: Record<NumKind, (s: string) => number> = {
  money: parseBaht,
  qty: parseQty,
  int: (s) => Math.max(0, Math.round(parseBaht(s))),
};
const SHOW: Record<NumKind, (n: number) => string> = { money: fmt, qty: fmtQty, int: String };

/**
 * Number input: shows "60,000.00", edits as plain text.
 * The parsed value reaches the form on every keystroke, so pressing Enter saves exactly what is on screen
 * (review #1); blur only tidies the display.
 */
export function MoneyInput({
  value,
  onChange,
  onBlur,
  className,
  kind = "money",
  ...rest
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: number;
  onChange: (v: number) => void;
  kind?: NumKind;
}) {
  const [text, setText] = useState(SHOW[kind](value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(SHOW[kind](value));
  }, [value, focused, kind]);
  return (
    <Input
      {...rest}
      inputMode="decimal"
      className={cn("num h-8", className)}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        setText(e.target.value);
        onChange(PARSE[kind](e.target.value));
      }}
      onBlur={(e) => {
        setFocused(false);
        setText(SHOW[kind](PARSE[kind](text)));
        onBlur?.(e);
      }}
    />
  );
}
