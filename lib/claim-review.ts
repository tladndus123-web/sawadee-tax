// AI 결재 도우미 (owner 2026-11-18: "경비 청구 … AI는"): the expenses screen sends the claims waiting for a decision (who,
// amount, shop, category, what was bought, the rule flags of lib/expense-checks, the person's usual amount) and the model
// gives each one a verdict — approve / check first / better reject — with a short reason, plus one line on the batch.
// The screen offers "approve the clean ones" only for verdict "ok" AND no rule flag, so the AI alone never approves a
// flagged claim. Numbers only from the sheet (lib/ai-sheet). Pure.

import { type AiLang, LANG_NAME, num, numbersOk, sheetNumbers, str } from "./ai-sheet";
import type { Claim } from "./expenses";
import type { Flag } from "./expense-checks";
import { fromSatang } from "./money";

export type Verdict = "ok" | "check" | "reject";

export interface ClaimSheet {
  today: string;
  /** n = the claim's number in this list (the answer refers to it) */
  claims: {
    n: number;
    name: string;
    /** Baht */
    amount: number;
    category: string;
    seller: string;
    day: string;
    bought: string[];
    note: string;
    hasPhoto: boolean;
    /** The rule flags, e.g. "personal: beer", "mismatch: receipt says 1200" */
    flags: string[];
    /** The person's usual claim (median of earlier approved / paid ones, baht), null with fewer than 3 */
    usual: number | null;
  }[];
}

export interface ClaimReview {
  summary: string;
  verdicts: { n: number; verdict: Verdict; reason: string }[];
}

export const CLAIM_REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "verdicts"],
  properties: {
    summary: { type: "string" },
    verdicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["n", "verdict", "reason"],
        properties: { n: { type: "number" }, verdict: { type: "string", enum: ["ok", "check", "reject"] }, reason: { type: "string" } },
      },
    },
  },
} as const;

export function claimReviewPrompt(lang: AiLang): string {
  return (
    `You help the owner of a small restaurant company in Thailand decide staff expense claims. You get the claims waiting ` +
    `for a decision (n, who, amount in baht, category, shop, day, what the receipt shows, note, whether there is a photo, ` +
    `rule flags found by the program, and the person's usual claim). Reply as JSON {summary, verdicts}: verdicts = one per ` +
    `claim: verdict "ok" (a normal business expense, nothing odd), "check" (ask or look first: a flag, no photo, far above ` +
    `the usual, the item does not fit the category or a restaurant business), "reject" (clearly personal, a duplicate, ` +
    `or not a business cost); reason = one short sentence saying why, naming the concrete fact. A claim with any rule ` +
    `flag is never "ok". summary = one sentence on the batch (how many look fine, what to look at). Write in ` +
    `${LANG_NAME[lang]}, plainly. Use only numbers from the sheet.`
  );
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** The sheet for the claims waiting (first 30), from the screen's data */
export function claimSheet(pending: Claim[], all: Claim[], flags: ReadonlyMap<string, Flag[]>, flagText: (f: Flag) => string, catName: (c: string) => string, today: string): ClaimSheet {
  return {
    today,
    claims: pending.slice(0, 30).map((c, i) => {
      const earlier = all.filter((o) => o.id !== c.id && o.userId === c.userId && (o.status === "approved" || o.status === "paid")).map((o) => o.amount);
      const bought = (c.doc?.items ?? []).map((it) => it.desc.en || it.desc.th || it.desc.ja).filter(Boolean).slice(0, 4);
      return {
        n: i + 1,
        name: c.name,
        amount: fromSatang(c.amount),
        category: catName(c.category),
        seller: c.seller,
        day: c.day,
        bought,
        note: c.note,
        hasPhoto: !!c.photoPath,
        flags: (flags.get(c.id) ?? []).map(flagText),
        usual: earlier.length >= 3 ? Math.round(fromSatang(median(earlier))) : null,
      };
    }),
  };
}

export function cleanClaimSheet(v: unknown): ClaimSheet | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const claims = (Array.isArray(o.claims) ? o.claims : []).slice(0, 30).map((c, i) => {
    const x = (c ?? {}) as Record<string, unknown>;
    const list = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v : []).slice(0, n).map((s) => str(s, len)).filter(Boolean);
    return {
      n: i + 1,
      name: str(x.name, 40),
      amount: num(x.amount) ?? 0,
      category: str(x.category, 40),
      seller: str(x.seller, 80),
      day: str(x.day, 10),
      bought: list(x.bought, 4, 60),
      note: str(x.note, 120),
      hasPhoto: x.hasPhoto === true,
      flags: list(x.flags, 6, 120),
      usual: num(x.usual),
    };
  });
  return claims.length ? { today: str(o.today, 10), claims } : null;
}

export function cleanClaimReview(raw: unknown, sheet: ClaimSheet): ClaimReview | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const summary = str(r.summary, 300);
  const seen = new Set<number>();
  const verdicts: ClaimReview["verdicts"] = [];
  for (const v of Array.isArray(r.verdicts) ? r.verdicts : []) {
    const x = (v ?? {}) as Record<string, unknown>;
    const n = x.n;
    const claim = typeof n === "number" ? sheet.claims.find((c) => c.n === n) : undefined;
    if (!claim || seen.has(claim.n)) continue;
    let verdict: Verdict = x.verdict === "ok" || x.verdict === "reject" ? x.verdict : "check";
    // The rule flags win: a flagged claim is never "ok", whatever the model said
    if (verdict === "ok" && claim.flags.length) verdict = "check";
    seen.add(claim.n);
    verdicts.push({ n: claim.n, verdict, reason: str(x.reason, 200) });
  }
  if (!summary || !verdicts.length) return null;
  return numbersOk([summary, ...verdicts.map((v) => v.reason)].join(" "), sheetNumbers(sheet)) ? { summary, verdicts } : null;
}
