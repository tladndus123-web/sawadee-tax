// Automatic checks (ported from the prototype's runChecks / flagsFor / claimable).
// Pure functions: the caller passes our company tax ID and the other ledger docs.

import { bahtText, cleanWords } from "./baht-text";
import { fmt, fmtQty, near, toSatang, fromSatang } from "./money";
import { triHas } from "./normalize";
import { addDays, digitsOnly, dmy, isIsoDate, taxIdOk, todayBangkok } from "./thai-tax";
import type { LedgerDoc } from "./types";

export const CHECK_KEYS = [
  "sellerTax",
  "buyerTax",
  "company",
  "required",
  "items",
  "chain",
  "vat",
  "net",
  "words",
  "due",
  "date",
  "claimWindow",
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
  | "ok"
  | "notApplicable";

/** Detail = language-neutral text pieces mixed with translatable words. */
export type DetailPart = string | { w: DetailWord };

export interface CheckResult {
  key: CheckKey;
  ok: boolean;
  /** not applicable: shown nowhere, never a flag */
  na: boolean;
  detail: DetailPart[];
  /** Field paths the check is about (e.g. missing required items) — shown as jump-to-photo buttons */
  paths?: string[];
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
  /** yyyy-mm-dd for the claim window; defaults to today in Bangkok */
  today?: string;
}

/**
 * Items a full tax invoice must show (Revenue Code §86/4, DG VAT Notification No. 199), as field paths.
 * Tax IDs, the date, items and VAT have their own checks. Names and addresses may be printed in any
 * language; the words "ใบกำกับภาษี" must be there in Thai.
 */
export function missingRequired(r: LedgerDoc): string[] {
  if (r.docType !== "full") return [];
  const miss: string[] = [];
  if (!r.docTitle.th.replace(/\s/g, "").includes("ใบกำกับภาษี")) miss.push("docTitle");
  if (!r.docNo.trim()) miss.push("docNo");
  if (!triHas(r.seller.name)) miss.push("seller.name");
  if (!triHas(r.seller.address)) miss.push("seller.address");
  if (!triHas(r.seller.branch)) miss.push("seller.branch");
  if (!triHas(r.customer.name)) miss.push("customer.name");
  if (!triHas(r.customer.address)) miss.push("customer.address");
  if (!triHas(r.customer.branch)) miss.push("customer.branch");
  // §86/4(5): what was sold — at least one item line with a description
  if (!r.items.some((i) => triHas(i.desc))) miss.push("items.0.desc");
  return miss;
}

/**
 * Last tax month the input VAT may be claimed in. §82/3 sets a 3-year ceiling, but the rule in force (DG VAT
 * Notification No. 4, amended by No. 76) allows a late claim only up to 6 months counted from the month after
 * the invoice month — and the claim month must be written on the invoice ("ถือเป็นภาษีซื้อในเดือนภาษี…").
 */
export function claimLastMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + 6, 1)).toISOString().slice(0, 7);
}

/** Last day of that month (shown in the check) */
export function claimDeadline(iso: string): string {
  const last = claimLastMonth(iso);
  const [y, m] = last.split("-").map(Number);
  return `${last}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

const W = (w: DetailWord): DetailPart => ({ w });

/** Turn detail parts into a string with a translator for the words. */
export const detailText = (parts: DetailPart[], word: (w: DetailWord) => string): string =>
  parts.map((p) => (typeof p === "string" ? p : word(p.w))).join("");

export function runChecks(r: LedgerDoc, ctx: CheckContext = {}): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (key: CheckKey, ok: boolean, detail: DetailPart[], na = false, paths?: string[]) =>
    out.push({ key, ok: !!ok, na: !!na, detail, ...(paths?.length ? { paths } : {}) });
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

  // Required particulars of a full tax invoice (§86/4 + Notification 199)
  if (r.docType === "full") {
    const miss = missingRequired(r);
    add("required", !miss.length, miss.length ? [`${miss.length} · `, W("missing")] : [W("ok")], false, miss);
  }

  // Item lines: qty × price = amount (±0.5), Σ amount = total (±1).
  // A written 0 is a number (10 × 0 ≠ 60,000); only a line with neither qty nor price is amount-only.
  // qty × satang price is rounded once, at the end, so fractional quantities stay exact.
  if (r.items.length) {
    const amountOnly = (i: LedgerDoc["items"][number]) => i.qty === 0 && i.price === 0;
    const lineBad = r.items.filter(
      (i) => !amountOnly(i) && Math.abs(Math.round(i.qty * toSatang(i.price)) - toSatang(i.amount)) > 50,
    );
    const sum = fromSatang(r.items.reduce((a, i) => a + toSatang(i.amount), 0));
    const ok = !lineBad.length && near(sum, tt.total, 1);
    const lines = r.items
      .map((i) => (amountOnly(i) ? fmt(i.amount) : `${fmtQty(i.qty)} × ${fmt(i.price)} = ${fmt(i.amount)}`))
      .slice(0, 3)
      .join(", ");
    add("items", ok, [`${lines} · Σ ${fmt(sum)} / ${fmt(tt.total)}`]);
  }

  // Discount → deposit → exempt/taxable flow. normalize() fills every totals line, so always check.
  {
    const ok =
      near(tt.total - tt.discount, tt.afterDisc, 1) &&
      near(tt.afterDisc - tt.deposit, tt.afterDep, 1) &&
      near(tt.exempt + tt.taxable, tt.afterDep, 1);
    add("chain", ok, [
      `${fmt(tt.total)} − ${fmt(tt.discount)} − ${fmt(tt.deposit)} = ${fmt(tt.afterDep)} (${fmt(tt.exempt)} + ${fmt(tt.taxable)})`,
    ]);
  }

  // VAT 7%: difference ≤ max(1 baht, 0.2% of taxable), compared exactly in integers
  // (diff × 500 ≤ taxable is diff ≤ 0.2% without rounding the limit up).
  // A document that prints no VAT and is not a tax invoice (plain receipt, billing note) has nothing
  // to verify — na, not a flag.
  if (toSatang(tt.vat) === 0 && r.docType !== "full" && r.docType !== "abbr") {
    add("vat", true, [W("notApplicable")], true);
  } else {
    const calcSatang = Math.round(toSatang(tt.taxable) * 0.07);
    const diff = Math.abs(calcSatang - toSatang(tt.vat));
    const calc = fromSatang(calcSatang);
    add("vat", diff <= 100 || diff * 500 <= toSatang(tt.taxable), [
      `${fmt(tt.taxable)} × 7% = ${fmt(calc)} · `,
      W("written"),
      ` ${fmt(tt.vat)}`,
    ]);
  }

  // Net = taxable + exempt + VAT
  {
    const calc = fromSatang(toSatang(tt.taxable) + toSatang(tt.exempt) + toSatang(tt.vat));
    add("net", near(calc, tt.net, 1), [
      `${fmt(tt.taxable)} + ${fmt(tt.exempt)} + ${fmt(tt.vat)} = ${fmt(calc)} · `,
      W("written"),
      ` ${fmt(tt.net)}`,
    ]);
  }

  // Printed Thai words = bahtText(net). Some forms print the words in English instead (e.g. "four
  // thousand ... and 60/100"); those spellings vary too much to compare, so they are left to the eye.
  if (r.wordsPrinted) {
    if (/[฀-๿]/.test(r.wordsPrinted)) {
      const w = bahtText(tt.net);
      add("words", w === cleanWords(r.wordsPrinted), [W("calc"), `: ${w}`]);
    } else add("words", true, [W("notApplicable")], true);
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
    isIsoDate(r.date) ? [`${dmy(r.date)} · `, W(r.dateWasBuddhist ? "be" : "gregorian")] : r.date ? [`${r.date} · `, W("invalid")] : [W("missing")],
  );

  // Late claims: within 6 months after the invoice month (§82/3 + DG Notification No. 4). With a claim month
  // set, that month must be inside the window; without one, today must still be.
  if (r.docType === "full" && isIsoDate(r.date)) {
    const deadline = claimDeadline(r.date);
    const ok = r.taxMonth ? r.taxMonth >= r.date.slice(0, 7) && r.taxMonth <= claimLastMonth(r.date) : (ctx.today ?? todayBangkok()) <= deadline;
    add("claimWindow", ok, [`${dmy(r.date)} → ${dmy(deadline)}`]);
  }

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

/**
 * Input VAT the law forbids claiming even on a valid invoice (§82/5): set per document, or by default for
 * entertainment (ค่ารับรอง). Passenger cars (≤10 seats) and their fuel/repairs are set by hand — a pickup's
 * fuel is claimable, a sedan's is not, and the category alone can't tell.
 */
let blockedCategories: ReadonlySet<string> = new Set(["entertainment"]);
/** Categories whose input VAT is not claimable (settings → categories); loaded by the category store / server */
export function setBlockedCategories(keys: Iterable<string>) {
  blockedCategories = new Set(["entertainment", ...keys]);
}
export const vatBlocked = (r: Pick<LedgerDoc, "noClaim" | "category">): boolean => r.noClaim ?? blockedCategories.has(r.category);

/** Claimed in the invoice month or up to 6 months later (an invoice with no claim month set counts in its own month) */
function inClaimWindow(r: LedgerDoc): boolean {
  const own = r.date.slice(0, 7);
  const claimIn = r.taxMonth || own;
  return claimIn >= own && claimIn <= claimLastMonth(r.date);
}

/**
 * Input VAT counts only for original full tax invoices (a copy is forbidden, Notification No. 42) addressed to
 * our company, showing every required item, claimed in the invoice month or up to 6 months later, and not
 * forbidden by §82/5. Without a valid company tax ID we cannot tell, so nothing is claimable. The answer
 * depends on the claim month, not on today, so a month's report never changes after it was filed.
 */
export function claimable(r: LedgerDoc, companyTaxId?: string): boolean {
  const buyer = digitsOnly(r.customer.taxId);
  const co = digitsOnly(companyTaxId);
  return (
    r.docType === "full" &&
    taxIdOk(buyer) &&
    taxIdOk(co) &&
    co === buyer &&
    missingRequired(r).length === 0 &&
    isIsoDate(r.date) &&
    r.copyKind !== "copy" &&
    inClaimWindow(r) &&
    !vatBlocked(r)
  );
}
