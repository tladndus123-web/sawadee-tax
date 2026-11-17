// The P&L's one-line AI conclusion (owner 2026-11-18, "AI 한 줄 결론"): the table sends its facts (lib/pl-insight plSheet —
// sales, costs, profit and the biggest cost rows' shares month by month, with the months whose costs are not all in) and
// the model writes one headline and up to three reasons. Numbers only from the sheet (lib/ai-sheet). Pure.

import { type AiLang, LANG_NAME, num, numbersOk, sheetNumbers, str } from "./ai-sheet";
import type { PlSheet } from "./pl-insight";

export interface PlConclusion {
  headline: string;
  reasons: string[];
}

export const PL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "reasons"],
  properties: { headline: { type: "string" }, reasons: { type: "array", items: { type: "string" } } },
} as const;

export function plPrompt(lang: AiLang): string {
  return (
    `You read a Thai restaurant company's profit and loss by month (baht; shares are % of sales without VAT; target = the ` +
    `owner's target share). Reply as JSON {headline, reasons}: headline = one sentence that tells the owner how the latest ` +
    `complete month went and the main reason (e.g. which cost share rose or fell, with the sheet's numbers); reasons = up ` +
    `to three short sentences: what changed most, a cost above its target, and — if a month is marked incomplete ` +
    `(running = the month is not over, labor = no labour entered, purchases = far fewer purchases than usual) — that its ` +
    `profit will look better than it ends. Write in ${LANG_NAME[lang]}, plainly. Use only numbers from the sheet.`
  );
}

export function cleanPlSheet(v: unknown): PlSheet | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const months = (Array.isArray(o.months) ? o.months : []).slice(0, 12).map((m) => {
    const x = (m ?? {}) as Record<string, unknown>;
    return {
      month: str(x.month, 7),
      sales: num(x.sales) ?? 0,
      costs: num(x.costs) ?? 0,
      profit: num(x.profit) ?? 0,
      profitPct: num(x.profitPct),
      incomplete: (Array.isArray(x.incomplete) ? x.incomplete : []).filter((w): w is string => w === "running" || w === "labor" || w === "purchases"),
    };
  });
  const rows = (Array.isArray(o.rows) ? o.rows : []).slice(0, 8).map((r) => {
    const x = (r ?? {}) as Record<string, unknown>;
    return { name: str(x.name, 40), target: num(x.target), shares: (Array.isArray(x.shares) ? x.shares : []).slice(0, 12).map(num) };
  });
  return months.length ? { months, rows } : null;
}

export function cleanConclusion(raw: unknown, sheet: PlSheet): PlConclusion | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const headline = str(r.headline, 300);
  const reasons = (Array.isArray(r.reasons) ? r.reasons : []).map((x) => str(x, 220)).filter(Boolean).slice(0, 3);
  if (!headline) return null;
  const allowed = sheetNumbers(sheet);
  // Changes in points are differences of two shares the sheet holds: allow those too
  for (const row of sheet.rows) {
    const s = row.shares.filter((x): x is number => x !== null);
    for (let i = 1; i < s.length; i++) {
      const d = Math.round(Math.abs(s[i] - s[i - 1]) * 10) / 10;
      allowed.add(String(d));
      allowed.add(d.toFixed(1));
    }
  }
  return numbersOk([headline, ...reasons].join(" "), allowed) ? { headline, reasons } : null;
}
