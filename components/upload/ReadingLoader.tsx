"use client";

// "The AI is reading" indicator: a blue disc (the app's blue) with a turning sky-blue glow and the word lighting up letter by
// letter (owner's pick, 2026-09-29). Letters are split by grapheme, so Thai vowel and tone marks stay on their
// consonant. Small version (no word) for photo thumbnails. Styles: .reading-loader in app/globals.css; with
// reduced motion the glow and letters hold still.

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

const graphemes = (text: string, locale: string): string[] => {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return [...new Intl.Segmenter(locale, { granularity: "grapheme" }).segment(text)].map((s) => s.segment);
  }
  return Array.from(text);
};

export function ReadingLoader({ size = 180, word = true, className }: { size?: number; word?: boolean; className?: string }) {
  const t = useTranslations("batch");
  const locale = useLocale();
  const text = t("loaderWord");
  const letters = useMemo(() => (word ? graphemes(text, locale) : []), [word, text, locale]);
  return (
    <div className={cn("reading-loader", className)} style={{ width: size, height: size, fontSize: Math.max(11, size / 9) }} role="img" aria-label={text}>
      {letters.map((l, i) => (
        <span key={i} className="reading-loader-letter" style={{ animationDelay: `${(i * 0.1).toFixed(1)}s` }} aria-hidden>
          {l === " " ? " " : l}
        </span>
      ))}
      <div className="reading-loader-ring" aria-hidden />
    </div>
  );
}
