// The bot speaks each person's own language (owner, 2026-10-26): the language their phone's LINE is set to
// (LINE profile "language") — Thai staff get Thai, Japanese admins Japanese, and so on; English for any other.
// A bot text carries all four languages joined by LANG_SPLIT, in the order th · ja · ko · en; the sender keeps only
// the reader's part (inLang). Texts made before this carried two parts (th · ja).

export const LINE_LANGS = ["ko", "ja", "th", "en"] as const;
export type LineLang = (typeof LINE_LANGS)[number];

/** Between the language parts of one text (invisible) */
export const LANG_SPLIT = "⁣⁣";

/** LINE profile language ("ja", "th", "ko", "en", "zh-TW" …) → the bot's language */
export function lineLang(profile: string | undefined | null): LineLang {
  const base = (profile ?? "").toLowerCase().split("-")[0];
  return (LINE_LANGS as readonly string[]).includes(base) ? (base as LineLang) : "en";
}

/** One text in the four languages */
export const four = (th: string, ja: string, ko: string, en: string) => [th, ja, ko, en].join(LANG_SPLIT);

/** The same words in each language, picked by the reader's language */
export type Words = Record<LineLang, string>;
export const fromWords = (w: Words) => four(w.th, w.ja, w.ko, w.en);

const ORDER: LineLang[] = ["th", "ja", "ko", "en"];

/** The reader's part of a text (a text without parts is the same for everyone) */
export function inLang(text: string, lang: LineLang): string {
  const parts = text.split(LANG_SPLIT);
  if (parts.length === 1) return text;
  if (parts.length === 2) return (lang === "th" ? parts[0] : parts[1]).trim();
  return (parts[ORDER.indexOf(lang)] ?? parts[3] ?? parts[0]).trim();
}
