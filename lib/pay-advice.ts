// AI 지급 순서 추천 (owner 2026-11-18): the "to pay" screen sends the unpaid bills it shows (supplier, amount after
// withholding, days to the due date) and their totals; the model says what to pay first and why, and which bills to pick
// now (by their number in the list). Late bills, those due within a week and suppliers with several bills come first;
// it never adds a figure of its own (lib/ai-sheet). Pure.

import { type AiLang, LANG_NAME, num, numbersOk, sheetNumbers, str } from "./ai-sheet";

export interface PaySheet {
  today: string;
  totals: { late: number; week: number; month: number; later: number; none: number };
  /** n = the bill's number in this list (the answer picks by it); days null = no due date */
  bills: { n: number; supplier: string; amount: number; days: number | null; date: string }[];
}

export interface PayAdvice {
  summary: string;
  actions: string[];
  /** The bills' numbers to pick now */
  payFirst: number[];
}

export const PAY_ADVICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "actions", "payFirst"],
  properties: { summary: { type: "string" }, actions: { type: "array", items: { type: "string" } }, payFirst: { type: "array", items: { type: "number" } } },
} as const;

export function payAdvicePrompt(lang: AiLang): string {
  return (
    `You help the owner of a small restaurant company in Thailand decide which supplier bills to pay first. You get the ` +
    `unpaid bills (n = its number in the list, supplier, amount in baht after withholding, days to the due date — negative ` +
    `= late, null = no due date) and the totals by due date. Reply as JSON {summary, actions, payFirst}: summary = one or ` +
    `two sentences on the situation; actions = up to four short steps (late bills first, what falls due this week, ` +
    `suppliers with several bills that could be paid together, bills without a due date to ask about); payFirst = the n ` +
    `of the bills to pay now (late and due within 7 days, at most 15). Write in ${LANG_NAME[lang]}, plainly. Use only ` +
    `numbers from the sheet, written the same way.`
  );
}

export function cleanPaySheet(v: unknown): PaySheet | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const t = (o.totals ?? {}) as Record<string, unknown>;
  const bills = (Array.isArray(o.bills) ? o.bills : []).slice(0, 40).map((b, i) => {
    const x = (b ?? {}) as Record<string, unknown>;
    return { n: i + 1, supplier: str(x.supplier, 60), amount: num(x.amount) ?? 0, days: num(x.days), date: str(x.date, 10) };
  });
  if (!bills.length) return null;
  return { today: str(o.today, 10), totals: { late: num(t.late) ?? 0, week: num(t.week) ?? 0, month: num(t.month) ?? 0, later: num(t.later) ?? 0, none: num(t.none) ?? 0 }, bills };
}

export function cleanPayAdvice(raw: unknown, sheet: PaySheet): PayAdvice | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const summary = str(r.summary, 400);
  const actions = (Array.isArray(r.actions) ? r.actions : []).map((a) => str(a, 200)).filter(Boolean).slice(0, 4);
  const max = sheet.bills.length;
  const payFirst = [...new Set((Array.isArray(r.payFirst) ? r.payFirst : []).filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= max))].slice(0, 15);
  if (!summary) return null;
  return numbersOk([summary, ...actions].join(" "), sheetNumbers(sheet)) ? { summary, actions, payFirst } : null;
}
