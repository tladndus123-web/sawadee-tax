"use client";

import { Check, Minus, PenLine, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormContext, useWatch } from "react-hook-form";
import { type FormMode, joinTri, signedTri } from "@/lib/form-labels";
import { emptyTri } from "@/lib/normalize";
import type { LedgerDoc, Signs } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Box, FieldLabel } from "./fields";
import { signFontVariables } from "./sign-fonts";
import { TriInput } from "./TriInput";

type Who = "receiver" | "issuer" | "deliverer";
const WHO: Who[] = ["receiver", "issuer", "deliverer"];
const signedOf = (s: Signs, w: Who) => (w === "deliverer" ? !!s.deliverer : s[w]);

/** What ends up on paper: the typed signature, or a plain "signed" mark, on a solid signature line. */
function Printed({ signs, who, mode }: { signs: Signs; who: Who; mode: FormMode }) {
  const text = signs[`${who}Sign`];
  return (
    <div className="grid min-h-12 content-end">
      {text ? (
        <span className={cn(signFontVariables, "font-sign text-[26px] leading-tight [overflow-wrap:anywhere]")}>{text}</span>
      ) : signedOf(signs, who) ? (
        <span className="flex items-center gap-1.5 text-sm">
          <Check className="size-4" aria-hidden />
          {joinTri(signedTri(true), mode, " / ")}
        </span>
      ) : null}
      <span className="mt-1 border-b border-rule" aria-hidden />
    </div>
  );
}

/**
 * One signature box bound to the document form. Staff can type a signature on the dotted line
 * (shown in a handwriting face) or just mark it as signed. Only the result is printed.
 */
function SignSlot({ who, mode, edit }: { who: Who; mode: FormMode; edit?: boolean }) {
  const t = useTranslations();
  const { control, setValue } = useFormContext<LedgerDoc>();
  const signs = useWatch({ control, name: "signs" });
  const text = signs[`${who}Sign`];
  const signed = signedOf(signs, who);
  const opts = { shouldDirty: true } as const;

  const setSigned = (on: boolean) => {
    if (who === "deliverer") setValue("signs.deliverer", on ? (signs.deliverer ?? emptyTri()) : null, opts);
    else setValue(`signs.${who}`, on, opts);
    if (!on) setValue(`signs.${who}Sign`, "", opts);
  };
  const type = (v: string) => {
    setValue(`signs.${who}Sign`, v.slice(0, 60), opts);
    if (v.trim() && !signed) setSigned(true);
  };
  const deliveredBy = who === "deliverer" && signs.deliverer ? joinTri(signs.deliverer, mode, " / ") : "";

  return (
    <Box className="min-h-40 content-between gap-3">
      <div className="grid gap-1.5">
        <FieldLabel k={who} mode={mode} edit={edit} />
        {who === "deliverer" && edit && signs.deliverer && <TriInput name="signs.deliverer" label={t("labels.deliverer")} />}
        {who === "deliverer" && !edit && deliveredBy && <span className="text-[13px] text-muted-foreground">{deliveredBy}</span>}
      </div>

      <div className="grid gap-2.5 print:hidden">
        <label className="sign-line group relative flex items-end gap-2 border-b border-dashed border-input pb-1 transition-colors focus-within:border-solid focus-within:border-primary">
          <PenLine className="mb-1.5 size-4 flex-none text-muted-foreground transition-colors group-focus-within:text-primary" aria-hidden />
          {!text && <span className="sign-caret" aria-hidden />}
          <input
            value={text}
            onChange={(e) => type(e.target.value)}
            maxLength={60}
            autoComplete="off"
            spellCheck={false}
            placeholder={t("app.typeSign")}
            aria-label={`${t(`labels.${who}`)} · ${t("app.typeSign")}`}
            className={cn(signFontVariables, "font-sign h-10 min-w-0 flex-1 bg-transparent text-[26px] leading-none outline-none placeholder:font-sans placeholder:text-[13px] placeholder:text-muted-foreground/80")}
          />
        </label>
        <button
          type="button"
          aria-pressed={signed}
          onClick={() => setSigned(!signed)}
          className={cn(
            "inline-flex min-h-9 w-fit items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors",
            signed ? "bg-ok-soft text-ok" : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          {signed ? <Check className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
          {t("app.signed")}
        </button>
      </div>

      <div className="hidden print:block">
        <Printed signs={signs} who={who} mode={mode} />
      </div>
    </Box>
  );
}

/** Read-only boxes (settings preview): no form to write into. */
function StaticSlot({ signs, who, mode }: { signs: Signs; who: Who; mode: FormMode }) {
  const text = signs[`${who}Sign`];
  const signed = signedOf(signs, who);
  const deliveredBy = who === "deliverer" && signs.deliverer ? joinTri(signs.deliverer, mode, " / ") : "";
  return (
    <Box className="min-h-32 content-between">
      <div className="grid gap-1.5">
        <FieldLabel k={who} mode={mode} />
        {deliveredBy && <span className="text-[13px] text-muted-foreground">{deliveredBy}</span>}
      </div>
      {text ? (
        <Printed signs={signs} who={who} mode={mode} />
      ) : (
        <span className="flex items-center gap-1.5 text-sm">
          {signed ? <Check className="size-4 text-ok" aria-hidden /> : <Minus className="size-4 text-muted-foreground" aria-hidden />}
          <span className={signed ? "" : "text-muted-foreground"}>{joinTri(signedTri(signed), mode, " / ")}</span>
        </span>
      )}
    </Box>
  );
}

/** View mode. `signable` (inside the document form) lets staff sign without switching to edit. */
export function SignBoxesView({ signs, mode, signable }: { signs: Signs; mode: FormMode; signable?: boolean }) {
  return (
    <div className="grid gap-2.5 @xl:grid-cols-3 print:grid-cols-3">
      {WHO.map((w) => (signable ? <SignSlot key={w} who={w} mode={mode} /> : <StaticSlot key={w} signs={signs} who={w} mode={mode} />))}
    </div>
  );
}

export function SignBoxesEdit({ mode }: { mode: FormMode }) {
  return (
    <div className="grid gap-2.5 @xl:grid-cols-3 print:grid-cols-3">
      {WHO.map((w) => (
        <SignSlot key={w} who={w} mode={mode} edit />
      ))}
    </div>
  );
}
