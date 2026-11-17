// The AI prep brief (owner 2026-11-18, restaurant extra): the program works out the coming days and tomorrow's amounts
// (lib/prep-forecast) into a small sheet of facts; the AI only words them — one short summary and up to three one-line
// actions. A reply holding a number that is not in the sheet is dropped for the plain template. Pure.

import type { PrepForecast, PrepIngredient } from "./prep-forecast";

export type BriefLang = "ja" | "ko" | "th" | "en";
export const isBriefLang = (v: unknown): v is BriefLang => v === "ja" || v === "ko" || v === "th" || v === "en";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface PrepSheet {
  usual: number;
  weekPct: number;
  days: { day: string; weekday: string; expected: number; pct: number; advice: string }[];
  ingredients: { name: string; unit: string; tomorrow: number }[];
}

export interface Brief {
  summary: string;
  actions: string[];
}

export function prepSheet(f: PrepForecast, ingredients: readonly PrepIngredient[]): PrepSheet {
  return {
    usual: f.usual,
    weekPct: f.weekPct,
    days: f.days.map((d) => ({ day: d.day, weekday: WEEKDAY[new Date(`${d.day}T00:00:00Z`).getUTCDay()], expected: d.expected, pct: d.pct, advice: d.advice })),
    ingredients: ingredients.slice(0, 8).map((i) => ({ name: i.name, unit: i.unit, tomorrow: i.tomorrow })),
  };
}

/** A sheet sent by the browser, checked and trimmed (never trusted as is) */
export function cleanSheet(v: unknown): PrepSheet | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
  const str = (x: unknown, n: number) => (typeof x === "string" ? x.slice(0, n) : "");
  const days = Array.isArray(o.days) ? o.days.slice(0, 7) : [];
  const ings = Array.isArray(o.ingredients) ? o.ingredients.slice(0, 8) : [];
  const usual = num(o.usual);
  const weekPct = num(o.weekPct);
  if (usual === null || weekPct === null || !days.length) return null;
  return {
    usual,
    weekPct,
    days: days.map((d) => {
      const x = (d ?? {}) as Record<string, unknown>;
      return { day: str(x.day, 10), weekday: str(x.weekday, 10), expected: num(x.expected) ?? 0, pct: num(x.pct) ?? 0, advice: str(x.advice, 8) };
    }),
    ingredients: ings.map((i) => {
      const x = (i ?? {}) as Record<string, unknown>;
      return { name: str(x.name, 60), unit: str(x.unit, 12), tomorrow: num(x.tomorrow) ?? 0 };
    }),
  };
}

const LANG_NAME: Record<BriefLang, string> = { ja: "Japanese", th: "Thai", en: "English", ko: "Korean" };

export function prepSystemPrompt(lang: BriefLang): string {
  return (
    `You help the owner of a restaurant in Thailand plan tomorrow's prep. You get a sheet of facts the program worked out ` +
    `(expected sales without VAT against a usual day, the coming days, and tomorrow's amounts of the main ingredients, read ` +
    `from what was bought in the last four weeks). Reply as JSON {"summary": one or two short sentences, "actions": up to ` +
    `three one-line things to do}. Write in ${LANG_NAME[lang]}, plainly, for a busy owner. Use only numbers that are in the ` +
    `sheet, written the same way (no new figures, no sums of your own). A closed day is closed, not missing. No greetings.`
  );
}

export const BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "actions"],
  properties: { summary: { type: "string" }, actions: { type: "array", items: { type: "string" } } },
} as const;

/** Every number in the text appears in the sheet (as written, or with thousands separators taken out) */
export function numbersOk(text: string, sheet: PrepSheet): boolean {
  const allowed = new Set<string>();
  const add = (n: number) => {
    allowed.add(String(n));
    allowed.add(String(Math.abs(n)));
    allowed.add(Math.abs(n).toLocaleString("en-US"));
  };
  add(sheet.usual);
  add(sheet.weekPct);
  for (const d of sheet.days) {
    add(d.expected);
    add(d.pct);
    for (const p of d.day.split("-")) allowed.add(String(Number(p)));
  }
  for (const i of sheet.ingredients) add(i.tomorrow);
  for (let n = 0; n <= 7; n++) allowed.add(String(n));
  const found = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return found.every((x) => allowed.has(x) || allowed.has(x.replace(/,/g, "")));
}

/** The model's reply, kept only when it is the right shape and every number checks out */
export function cleanBrief(raw: unknown, sheet: PrepSheet): Brief | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const summary = typeof r.summary === "string" ? r.summary.trim().slice(0, 300) : "";
  const actions = (Array.isArray(r.actions) ? r.actions : []).filter((a): a is string => typeof a === "string").map((a) => a.trim().slice(0, 160)).filter(Boolean).slice(0, 3);
  if (!summary) return null;
  return numbersOk([summary, ...actions].join(" "), sheet) ? { summary, actions } : null;
}
