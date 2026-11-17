// AI 신고 전 점검 (owner 2026-11-18): before a month's returns are filed, the tax hub sends what the program worked out —
// the VAT figures against the last three months, the withholding lists and what is wrong in them, payroll's part,
// documents still to check, drafts, possible duplicates, deadlines and what is already filed — and the model writes a
// short check list: what to fix first and why, each pointing to the screen that fixes it. It never adds a figure of
// its own (lib/ai-sheet). Pure: the sheet, the prompt, the answer's shape and its cleaning.

import { type AiLang, LANG_NAME, num, numbersOk, sheetNumbers, str } from "./ai-sheet";

export interface TaxSheet {
  month: string;
  today: string;
  vat: { output: number; input: number; toPay: number; credit: number; carriedIn: number };
  /** The three months before, VAT to pay (negative = a credit) */
  vatBefore: { month: string; toPay: number }[];
  wht: { pnd53Count: number; pnd53Tax: number; pnd3Count: number; pnd3Tax: number; badTaxIds: number; notMarkedPaid: number };
  payroll: { lines: number; tax: number; socialSecurity: number };
  documentsToCheck: number;
  drafts: number;
  possibleDuplicates: number;
  deadlines: { vat: string; vatDaysLeft: number; withholding: string; withholdingDaysLeft: number };
  filed: { vat: boolean; monthly: boolean };
}

export const CHECK_LINKS = ["filing", "ledger", "dups", "payroll", "calendar", "none"] as const;
export type CheckLink = (typeof CHECK_LINKS)[number];
export type CheckLevel = "red" | "amber" | "ok";

export interface TaxCheck {
  summary: string;
  checks: { level: CheckLevel; text: string; link: CheckLink }[];
}

export const TAX_CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "checks"],
  properties: {
    summary: { type: "string" },
    checks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["level", "text", "link"],
        properties: { level: { type: "string", enum: ["red", "amber", "ok"] }, text: { type: "string" }, link: { type: "string", enum: [...CHECK_LINKS] } },
      },
    },
  },
} as const;

export function taxCheckPrompt(lang: AiLang): string {
  return (
    `You check a small Thai restaurant company's monthly tax returns before they are filed: VAT ภ.พ.30, withholding ` +
    `ภ.ง.ด.53 (companies) / ภ.ง.ด.3 (people), and payroll ภ.ง.ด.1 + social security. You get a sheet of facts the program ` +
    `worked out (amounts in baht). Reply as JSON {summary, checks}: summary = one or two sentences on whether the month ` +
    `looks ready; checks = up to six items, most important first, each with level (red = must fix before filing, amber = ` +
    `worth a look, ok = fine), one short sentence, and link = where to fix it (filing = the filing helper with the boxes, ` +
    `ledger = documents to check or drafts, dups = possible duplicates, payroll = pay lines, calendar = mark as filed, none). ` +
    `Things to look at: a VAT figure far from the last three months (say how far, with the sheet's numbers), bad payee ` +
    `tax IDs, withholdings not marked paid, documents still to check, drafts not saved, possible duplicates, a deadline ` +
    `within a few days or passed, nothing filed yet. A month with nothing wrong gets one ok item. Write in ` +
    `${LANG_NAME[lang]}, plainly, for the owner. Use only numbers from the sheet, written the same way. Thai tax rules ` +
    `may be named, but the final word is the accountant's.`
  );
}

const n0 = (v: unknown) => num(v) ?? 0;

/** A sheet sent by the browser, checked (never trusted as is) */
export function cleanTaxSheet(v: unknown): TaxSheet | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const g = (k: string) => ((o[k] ?? {}) as Record<string, unknown>);
  const month = str(o.month, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  return {
    month,
    today: str(o.today, 10),
    vat: { output: n0(g("vat").output), input: n0(g("vat").input), toPay: n0(g("vat").toPay), credit: n0(g("vat").credit), carriedIn: n0(g("vat").carriedIn) },
    vatBefore: (Array.isArray(o.vatBefore) ? o.vatBefore : []).slice(0, 3).map((x) => ({ month: str((x as Record<string, unknown>)?.month, 7), toPay: n0((x as Record<string, unknown>)?.toPay) })),
    wht: {
      pnd53Count: n0(g("wht").pnd53Count),
      pnd53Tax: n0(g("wht").pnd53Tax),
      pnd3Count: n0(g("wht").pnd3Count),
      pnd3Tax: n0(g("wht").pnd3Tax),
      badTaxIds: n0(g("wht").badTaxIds),
      notMarkedPaid: n0(g("wht").notMarkedPaid),
    },
    payroll: { lines: n0(g("payroll").lines), tax: n0(g("payroll").tax), socialSecurity: n0(g("payroll").socialSecurity) },
    documentsToCheck: n0(o.documentsToCheck),
    drafts: n0(o.drafts),
    possibleDuplicates: n0(o.possibleDuplicates),
    deadlines: { vat: str(g("deadlines").vat, 10), vatDaysLeft: n0(g("deadlines").vatDaysLeft), withholding: str(g("deadlines").withholding, 10), withholdingDaysLeft: n0(g("deadlines").withholdingDaysLeft) },
    filed: { vat: g("filed").vat === true, monthly: g("filed").monthly === true },
  };
}

/** The model's answer, kept only when it is the right shape and every number is the sheet's */
export function cleanTaxCheck(raw: unknown, sheet: TaxSheet): TaxCheck | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const summary = str(r.summary, 400);
  const checks = (Array.isArray(r.checks) ? r.checks : [])
    .map((c) => {
      const x = (c ?? {}) as Record<string, unknown>;
      const level = x.level === "red" || x.level === "amber" || x.level === "ok" ? x.level : "amber";
      const link = (CHECK_LINKS as readonly unknown[]).includes(x.link) ? (x.link as CheckLink) : "none";
      return { level: level as CheckLevel, text: str(x.text, 220), link };
    })
    .filter((c) => c.text)
    .slice(0, 6);
  if (!summary) return null;
  const allowed = sheetNumbers(sheet);
  // The forms' own numbers (ภ.พ.30, ภ.ง.ด.1 / 3 / 53 / 50 / 51, สปส.1-10) are names, not figures
  for (const n of ["30", "53", "50", "51", "94", "90", "10"]) allowed.add(n);
  return numbersOk([summary, ...checks.map((c) => c.text)].join(" "), allowed) ? { summary, checks } : null;
}
