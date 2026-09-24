"use client";

import { Check, Tag } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { monthDate, NO_DATE } from "@/lib/archive";
import { saveStickerNames, STICKER_HEX, useStickerNames } from "@/lib/sticker-store";
import { STICKERS, type Sticker } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Company name for a sticker, or the colour name in the screen language */
export function useStickerLabel() {
  const t = useTranslations("archive");
  const names = useStickerNames();
  return (c: Sticker) => names[c] || t(c);
}

/** "2026-09" → "2026년 9월분" / "September 2026" / "งวด กันยายน 2569" / "2026年9月分" */
export function useMonthLabel() {
  const t = useTranslations("archive");
  const locale = useLocale();
  const fmt = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "UTC" });
  return (key: string) => (key === NO_DATE ? t("noDate") : t("monthOf", { month: fmt.format(monthDate(key)) }));
}

export function StickerDot({ color, className }: { color: Sticker; className?: string }) {
  return <span className={cn("inline-block size-2.5 flex-none rounded-full ring-1 ring-black/10", className)} style={{ background: STICKER_HEX[color] }} />;
}

/** Overlapping dots like Finder tags */
export function StickerDots({ stickers, className }: { stickers: Sticker[]; className?: string }) {
  const label = useStickerLabel();
  if (!stickers.length) return null;
  return (
    <span className={cn("flex items-center -space-x-1", className)} role="img" aria-label={stickers.map(label).join(", ")}>
      {stickers.map((c) => (
        <StickerDot key={c} color={c} className="ring-2 ring-card" />
      ))}
    </span>
  );
}

/** Toggle list of the seven stickers */
export function StickerPicker({ value, onChange, className }: { value: Sticker[]; onChange: (v: Sticker[]) => void; className?: string }) {
  const label = useStickerLabel();
  const toggle = (c: Sticker) => onChange(STICKERS.filter((s) => (s === c ? !value.includes(s) : value.includes(s))));
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {STICKERS.map((c) => {
        const on = value.includes(c);
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(c)}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
              on ? "border-transparent bg-foreground/[0.07] text-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="grid size-4 place-items-center rounded-full" style={{ background: STICKER_HEX[c] }}>
              {on && <Check className="size-3 text-white" strokeWidth={3} aria-hidden />}
            </span>
            {label(c)}
          </button>
        );
      })}
    </div>
  );
}

/** Small tag button that opens the picker, for list rows */
export function StickerPopover({ value, onChange, label }: { value: Sticker[]; onChange: (v: Sticker[]) => void; label: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="grid size-10 flex-none place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {value.length ? <StickerDots stickers={value} /> : <Tag className="size-4" aria-hidden />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 rounded-2xl p-3">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">{label}</p>
        <StickerPicker value={value} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}

/** Settings: rename stickers for the company */
export function StickerNameSettings() {
  const t = useTranslations("archive");
  const names = useStickerNames();
  return (
    <section aria-labelledby="sticker-title" className="workspace-panel grid gap-4 p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 id="sticker-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Tag className="size-5 text-primary" aria-hidden />
          {t("stickerNames")}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("stickerHint")}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {STICKERS.map((c) => (
          <label key={c} className="flex items-center gap-2 rounded-xl border px-3 py-1.5">
            <StickerDot color={c} className="size-3.5" />
            <Input
              value={names[c] ?? ""}
              maxLength={20}
              placeholder={t(c)}
              aria-label={`${t("stickerNames")} · ${t(c)}`}
              onChange={(e) => saveStickerNames({ ...names, [c]: e.target.value })}
              className="h-9 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
            />
          </label>
        ))}
      </div>
    </section>
  );
}
