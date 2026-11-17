// AI that only words what the program worked out (owner 2026-11-18: "AI 기능을 최대한 — 검색, 세금 신고, 줄 돈, 계약서"):
// the screen sends a small sheet of facts, the model answers in JSON, and an answer holding a number that is not in the
// sheet is dropped (the screen then shows nothing rather than a made-up figure). Shared by the tax check and the payables
// advice. Pure.

export type AiLang = "ja" | "ko" | "th" | "en";
export const isAiLang = (v: unknown): v is AiLang => v === "ja" || v === "ko" || v === "th" || v === "en";
export const LANG_NAME: Record<AiLang, string> = { ja: "Japanese", ko: "Korean", th: "Thai", en: "English" };

/** Every number anywhere in the sheet, as it may be written (plain, absolute, with thousands separators, rounded) */
export function sheetNumbers(sheet: unknown): Set<string> {
  const out = new Set<string>();
  const add = (n: number) => {
    for (const v of [n, Math.abs(n), Math.round(n), Math.round(Math.abs(n))]) {
      out.add(String(v));
      out.add(v.toLocaleString("en-US", { maximumFractionDigits: 2 }));
      out.add(v.toFixed(2));
    }
  };
  const walk = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) add(v);
    else if (typeof v === "string")
      for (const m of v.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) {
        out.add(m);
        out.add(m.replace(/,/g, ""));
      }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(sheet);
  // Small counts and ordinal words ("3 things", "step 1") are always fine
  for (let n = 0; n <= 12; n++) out.add(String(n));
  return out;
}

/** Every number in the text is one of the sheet's */
export function numbersOk(text: string, allowed: ReadonlySet<string>): boolean {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).every((x) => allowed.has(x) || allowed.has(x.replace(/,/g, "")) || allowed.has(x.replace(/\.0+$/, "")));
}

export const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
