// AI on a kept contract (owner 2026-11-18: "계약서함 — AI 최대한"): Claude reads the contract's own file (PDF or photo)
// and writes (1) a summary kept with the contract — the key terms in plain words, the dates that matter, what to watch
// out for (renewal, notice, penalties, price rises, deposit) — and (2) answers to questions about it. It reads only the
// file and the fields the person saved; the final word on law is a lawyer's. Pure: prompts, schema, cleaning.

import { type AiLang, LANG_NAME, str } from "./ai-sheet";

export interface ContractAi {
  summary: string;
  terms: { label: string; value: string }[];
  dates: { label: string; date: string }[];
  watch: string[];
  /** When it was made, and from which file (a new file makes it out of date) */
  madeAt: string;
  file: string;
}

export const CONTRACT_AI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "terms", "dates", "watch"],
  properties: {
    summary: { type: "string" },
    terms: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "value"], properties: { label: { type: "string" }, value: { type: "string" } } } },
    dates: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "date"], properties: { label: { type: "string" }, date: { type: "string" } } } },
    watch: { type: "array", items: { type: "string" } },
  },
} as const;

export const CONTRACT_ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "quote"],
  properties: { answer: { type: "string" }, quote: { type: "string" } },
} as const;

const BASE =
  `You read a contract kept by a small restaurant company in Thailand (lease, supply, service, employment, loan, ` +
  `insurance …). The file may be in Thai, English or another language. Use only what the file says; when it does not say, ` +
  `say so. Amounts in baht as written. Dates as YYYY-MM-DD (Gregorian; a Buddhist year minus 543). You are not a lawyer: ` +
  `for a legal decision, say to check with one.`;

export function contractSummaryPrompt(lang: AiLang): string {
  return (
    `${BASE} Reply as JSON {summary, terms, dates, watch}, written in ${LANG_NAME[lang]}: summary = two or three plain ` +
    `sentences (what it is, between whom, for how long, how much); terms = up to eight key terms as label + value (rent or ` +
    `price and when it is paid, deposit, term and renewal, notice to end, penalties, price increases, who pays what, ` +
    `anything unusual); dates = up to six dates that matter (start, end, notice by, rent review …) as label + date; watch ` +
    `= up to four short points the owner should watch out for.`
  );
}

export function contractQuestionPrompt(lang: AiLang): string {
  return `${BASE} Answer the owner's question about this contract in ${LANG_NAME[lang]}, in two to four plain sentences. Reply as JSON {answer, quote}: quote = the exact clause the answer rests on, in the file's own language (short), or "" when none.`;
}

const iso = (v: unknown) => {
  const s = str(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};

export function cleanContractAi(raw: unknown, file: string, now = new Date().toISOString()): ContractAi | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const summary = str(r.summary, 600);
  if (!summary) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    summary,
    terms: list(r.terms)
      .map((x) => ({ label: str((x as Record<string, unknown>)?.label, 60), value: str((x as Record<string, unknown>)?.value, 240) }))
      .filter((x) => x.label && x.value)
      .slice(0, 8),
    dates: list(r.dates)
      .map((x) => ({ label: str((x as Record<string, unknown>)?.label, 60), date: iso((x as Record<string, unknown>)?.date) }))
      .filter((x) => x.label && x.date)
      .slice(0, 6),
    watch: list(r.watch).map((x) => str(x, 200)).filter(Boolean).slice(0, 4),
    madeAt: now,
    file,
  };
}

export function readContractAi(v: unknown): ContractAi | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const c = cleanContractAi(o, str(o.file, 300), str(o.madeAt, 40));
  return c;
}

export function cleanAnswer(raw: unknown): { answer: string; quote: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const answer = str(r.answer, 800);
  return answer ? { answer, quote: str(r.quote, 400) } : null;
}
