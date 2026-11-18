// AI search (owner 2026-11-18, the top bar's search: "말로 찾기"): a sentence like "지난달 마크로에서 산 돼지고기" or
// "unpaid bills over 5,000 in October" becomes a filter on the ledger — dates, seller, item, category, amount range, paid
// or not, document number. The model only turns words into the filter (it sees no books); the documents are then read
// with the person's own session, so the database's rules decide what comes back. Pure: schema, prompt, cleaning.

import { type AiLang, LANG_NAME, str } from "./ai-sheet";

/**
 * What the sentence is after (feedback 2026-11-18: "이번 달 매출 합계" got purchases): "purchases" = documents of the
 * ledger, "sales" = the sales total of a period, "ask" = a question for the AI assistant (why, advice, comparisons)
 */
export type SearchKind = "purchases" | "sales" | "ask";

export interface SearchFilter {
  kind: SearchKind;
  from: string;
  to: string;
  seller: string;
  item: string;
  category: string;
  minAmount: number | null;
  maxAmount: number | null;
  paid: "any" | "paid" | "unpaid";
  docNo: string;
  /** One short line, in the reader's language, of what was searched */
  explain: string;
}

export const SEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "from", "to", "seller", "item", "category", "minAmount", "maxAmount", "paid", "docNo", "explain"],
  properties: {
    kind: { type: "string", enum: ["purchases", "sales", "ask"] },
    from: { type: "string" },
    to: { type: "string" },
    seller: { type: "string" },
    item: { type: "string" },
    category: { type: "string" },
    minAmount: { type: "number" },
    maxAmount: { type: "number" },
    paid: { type: "string", enum: ["any", "paid", "unpaid"] },
    docNo: { type: "string" },
    explain: { type: "string" },
  },
} as const;

export function searchPrompt(today: string, lang: AiLang, categories: readonly { key: string; name: string }[]): string {
  return (
    `You turn a search sentence into a filter for a Thai restaurant company's books. Today is ${today} (Bangkok). ` +
    `Reply as JSON: kind = "sales" when it asks for sales / revenue / takings (매출, 売上, ยอดขาย, sales) of a period — ` +
    `then only from / to and explain matter (no dates = this month); "ask" when it is a question that needs thinking ` +
    `(why, how is it going, profit, advice, comparisons) rather than finding documents; otherwise "purchases" = the ` +
    `purchase ledger (tax invoices and receipts from suppliers). from / to = the date range as YYYY-MM-DD ("" when none; "last month" = ` +
    `the whole previous month, "this year" = Jan 1 to today); seller = the seller's or supplier's name as it would be ` +
    `printed (Latin or Thai, e.g. Makro, แม็คโคร — "" when none); item = one item word in the language most receipts use ` +
    `(Thai or English, e.g. หมู or pork — "" when none); category = one of these keys or "": ${categories.map((c) => `${c.key} (${c.name})`).join(", ")}; ` +
    `minAmount / maxAmount = the document total range in baht (0 when none); paid = any / paid / unpaid; docNo = a ` +
    `document number when one is given, else ""; explain = one short line in ${LANG_NAME[lang]} saying what is searched.`
  );
}

const day = (v: unknown) => {
  const s = str(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) ? s : "";
};
const amount = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1e9 ? Math.round(v * 100) / 100 : null);
/** Characters PostgREST filters use are dropped from free text */
const plain = (v: unknown, n: number) => str(v, n).replace(/[,()*%:"'\\]/g, " ").replace(/\s+/g, " ").trim();

export function cleanFilter(raw: unknown, categoryKeys: readonly string[]): SearchFilter | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  let from = day(r.from);
  let to = day(r.to);
  if (from && to && from > to) [from, to] = [to, from];
  const kind: SearchKind = r.kind === "sales" || r.kind === "ask" ? r.kind : "purchases";
  const f: SearchFilter = {
    kind,
    from,
    to,
    seller: plain(r.seller, 60),
    item: plain(r.item, 40),
    category: typeof r.category === "string" && categoryKeys.includes(r.category) ? r.category : "",
    minAmount: amount(r.minAmount),
    maxAmount: amount(r.maxAmount),
    paid: r.paid === "paid" || r.paid === "unpaid" ? r.paid : "any",
    docNo: plain(r.docNo, 40),
    explain: str(r.explain, 160),
  };
  const anything = f.from || f.to || f.seller || f.item || f.category || f.minAmount !== null || f.maxAmount !== null || f.paid !== "any" || f.docNo;
  // Sales without dates = this month (the route fills it); a question needs no condition
  return anything || kind !== "purchases" ? f : null;
}

/** The or-filter for a name in any of the three languages of a jsonb column, e.g. seller->name */
export const triIlike = (col: string, term: string) => ["th", "en", "ja"].map((l) => `${col}->>${l}.ilike.*${term}*`).join(",");
