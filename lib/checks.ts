// Automatic checks (ported from the prototype's runChecks / flagsFor / claimable).
// Pure functions: the caller passes our company tax ID and the other ledger docs.

import { bahtText, cleanWords } from "./baht-text";
import { fmt, near, toSatang, fromSatang } from "./money";
import { addDays, digitsOnly, dmy, isIsoDate, taxIdOk } from "./thai-tax";
import type { LedgerDoc } from "./types";

export const CHECK_KEYS = [
  "sellerTax",
  "buyerTax",
  "company",
  "items",
  "chain",
  "vat",
  "net",
  "words",
  "due",
  "date",
  "unclear",
  "dup",
  "conf",
] as const;
export type CheckKey = (typeof CHECK_KEYS)[number];

/** Keys of the translated detail words (messages.detail.*) */
export type DetailWord =
  | "missing"
  | "invalid"
  | "valid"
  | "noCompany"
  | "differ"
  | "same"
  | "written"
  | "calc"
  | "be"
  | "gregorian"
  | "noneUnclear"
  | "checkPhoto"
  | "dupFound"
  | "noDup"
  | "low"
  | "ok";

/** Detail = language-neutral text pieces mixed with translatable words. */
export type DetailPart = string | { w: DetailWord };

export interface CheckResult {
  key: CheckKey;
  ok: boolean;
  /** not applicable: shown nowhere, never a flag */
  na: boolean;
  detail: DetailPart[];
}

/** Another ledger document, for the duplicate check */
export interface LedgerRef {
  id?: string;
  docNo: string;
  sellerTaxId: string;
}

export interface CheckContext {
  companyTaxId?: string;
  others?: LedgerRef[];
}

const W = (w: DetailWord): DetailPart => ({ w });

/** Turn detail parts into a string with a translator for the words. */
export const detailText = (parts: DetailPart[], word: (w: DetailWord) => string): string =>
  parts.map((p) => (typeof p === "string" ? p : word(p.w))).join("");

export function runChecks(r: LedgerDoc, ctx: CheckContext = {}): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (key: CheckKey, ok: boolean, detail: DetailPart[], na = false) =>
    out.push({ key, ok: !!ok, na: !!na, detail });
  const tt = r.totals;
  const taxDetail = (id: string): DetailPart[] => [`${id} · `, W(taxIdOk(id) ? "valid" : "invalid")];

  // Seller tax ID: required on tax invoices
  const needTax = r.docType === "full" || r.docType === "abbr";
  const sTax = digitsOnly(r.seller.taxId);
  if (!sTax) add("sellerTax", !needTax, [W("missing")], !needTax);
  else add("sellerTax", taxIdOk(sTax), taxDetail(sTax));

  // Buyer tax ID: required on a full tax invoice
  const bTax = digitsOnly(r.customer.taxId);
  if (r.docType === "full") {
    if (!bTax) add("buyerTax", false, [W("missing")]);
    else add("buyerTax", taxIdOk(bTax), taxDetail(bTax));
  } else if (bTax) add("buyerTax", taxIdOk(bTax), taxDetail(bTax));

  // Buyer is our company
  const co = digitsOnly(ctx.companyTaxId);
  if (bTax) {
    if (!co) add("company", true, [W("noCompany")], true);
    else add("company", co === bTax, [W(co === bTax ? "same" : "differ")]);
  }

  // Item lines: qty × price = amount (±0.5), Σ amount = total (±1)
  if (r.items.length) {
    const lineBad = r.items.filter((i) => i.price && !near(i.qty * i.price, i.amount, 0.5));
    const sum = fromSatang(r.items.reduce((a, i) => a + toSatang(i.amount), 0));
    const ok = !lineBad.length && (!tt.total || near(sum, tt.total, 1));
    const lines = r.items
      .map((i) => (i.price ? `${fmt(i.qty)} × ${fmt(i.price)} = ${fmt(i.amount)}` : fmt(i.amount)))
      .slice(0, 3)
      .join(", ");
    add("items", ok, [`${lines} · Σ ${fmt(sum)} / ${fmt(tt.total)}`]);
  }

  // Discount → deposit → exempt/taxable flow
  if (tt.total) {
    const ok =
      near(tt.total - tt.discount, tt.afterDisc, 1) &&
      near(tt.afterDisc - tt.deposit, tt.afterDep, 1) &&
      near(tt.exempt + tt.taxable, tt.afterDep, 1);
    add("chain", ok, [
      `${fmt(tt.total)} − ${fmt(tt.discount)} − ${fmt(tt.deposit)} = ${fmt(tt.afterDep)} (${fmt(tt.exempt)} + ${fmt(tt.taxable)})`,
    ]);
  }

  // VAT 7%: difference ≤ max(1 baht, 0.2% of taxable)
  if (tt.vat || tt.taxable) {
    const calcSatang = Math.round(toSatang(tt.taxable) * 0.07);
    const tolSatang = Math.max(100, Math.round(toSatang(tt.taxable) * 0.002));
    const calc = fromSatang(calcSatang);
    add("vat", Math.abs(calcSatang - toSatang(tt.vat)) <= tolSatang, [
      `${fmt(tt.taxable)} × 7% = ${fmt(calc)} · `,
      W("written"),
      ` ${fmt(tt.vat)}`,
    ]);
  }

  // Net = taxable + exempt + VAT
  if (tt.net) {
    const calc = fromSatang(toSatang(tt.taxable) + toSatang(tt.exempt) + toSatang(tt.vat));
    add("net", near(calc, tt.net, 1), [
      `${fmt(tt.taxable)} + ${fmt(tt.exempt)} + ${fmt(tt.vat)} = ${fmt(calc)} · `,
      W("written"),
      ` ${fmt(tt.net)}`,
    ]);
  }

  // Printed Thai words = bahtText(net)
  if (r.wordsPrinted) {
    const w = bahtText(tt.net);
    add("words", w === cleanWords(r.wordsPrinted), [W("calc"), `: ${w}`]);
  }

  // Due date = date + credit days
  if (r.creditDays && isIsoDate(r.date) && isIsoDate(r.dueDate)) {
    const c = addDays(r.date, r.creditDays);
    add("due", c === r.dueDate, [
      `${dmy(r.date)} + ${r.creditDays} = ${dmy(c)} · `,
      W("written"),
      ` ${dmy(r.dueDate)}`,
    ]);
  }

  // Date present (Buddhist era already converted by normalize)
  add(
    "date",
    isIsoDate(r.date),
    isIsoDate(r.date) ? [`${dmy(r.date)} · `, W(r.dateWasBuddhist ? "be" : "gregorian")] : [W("missing")],
  );

  // Unclear fields
  const un = r.unclear;
  add("unclear", !un.length, un.length ? [`${un.length} · `, W("checkPhoto")] : [W("noneUnclear")]);

  // Duplicate: same seller tax ID + same doc number
  if (r.docNo && sTax) {
    const dup = (ctx.others ?? []).some(
      (x) => x.id !== r.id && x.docNo === r.docNo && digitsOnly(x.sellerTaxId) === sTax,
    );
    add("dup", !dup, [W(dup ? "dupFound" : "noDup")]);
  }

  // AI confidence
  add("conf", r.confidence !== "low", [W(r.confidence === "low" ? "low" : "ok")]);

  return out;
}

/** Keys of failed, applicable checks (stored as documents.flags) */
export const flagsFor = (r: LedgerDoc, ctx: CheckContext = {}): CheckKey[] =>
  runChecks(r, ctx)
    .filter((c) => !c.ok && !c.na)
    .map((c) => c.key);

/** Input VAT counts only for full tax invoices addressed to our company. */
export function claimable(r: LedgerDoc, companyTaxId?: string): boolean {
  const buyer = digitsOnly(r.customer.taxId);
  const co = digitsOnly(companyTaxId);
  return r.docType === "full" && taxIdOk(buyer) && (!co || co === buyer);
}
