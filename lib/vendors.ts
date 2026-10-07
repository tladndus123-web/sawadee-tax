// Vendor dictionary rules (step 7). The dictionary is keyed by the seller's tax ID (public.vendors,
// filled by a database trigger when documents are saved). A new AI reading of a known vendor is tidied:
//   - the name always follows the dictionary (same company, same spelling every time)
//   - address, head office/branch, tel and fax are filled only when the reading left them empty
//     (branches share one tax ID but print different addresses, so a read address is never replaced)

import { normalize, triHas } from "./normalize";
import { digitsOnly, taxIdOk } from "./thai-tax";
import { isCategoryKey, PAYMENTS } from "./types";
import type { Category, LedgerDoc, Tri } from "./types";

export interface Vendor {
  id: string;
  taxId: string;
  name: Tri;
  address: Tri;
  branch: Tri;
  tel: string;
  fax: string;
  /** Automatic registration rule (freee-style): always this category / payment for the vendor */
  ruleCategory: string | null;
  rulePayment: string | null;
  /** Save a new document that passes every check without asking (admins switch it) */
  autoRegister: boolean;
  /** How to pay them (admins set it): PromptPay ID, bank code (lib/promptpay THAI_BANKS), account number and name */
  pay: VendorPay;
}

export interface VendorPay {
  promptpay: string;
  bank: string;
  account: string;
  name: string;
}

export interface VendorRow {
  id: string;
  tax_id: string;
  name: unknown;
  address: unknown;
  branch: unknown;
  tel: string;
  fax: string;
  rule_category?: string | null;
  rule_payment?: string | null;
  auto_register?: boolean | null;
  pay_promptpay?: string | null;
  pay_bank?: string | null;
  pay_account?: string | null;
  pay_name?: string | null;
}

/** Columns the app reads from public.vendors */
export const VENDOR_COLUMNS = "id, tax_id, name, address, branch, tel, fax, rule_category, rule_payment, auto_register, pay_promptpay, pay_bank, pay_account, pay_name";

/** Rows through normalize() so any stored shape becomes clean {th, en, ja} */
export function toVendor(r: VendorRow): Vendor {
  const s = normalize({ seller: { name: r.name, address: r.address, branch: r.branch } }).seller;
  return {
    id: r.id,
    taxId: r.tax_id,
    name: s.name,
    address: s.address,
    branch: s.branch,
    tel: r.tel ?? "",
    fax: r.fax ?? "",
    ruleCategory: r.rule_category ?? null,
    rulePayment: r.rule_payment ?? null,
    autoRegister: !!r.auto_register,
    pay: { promptpay: r.pay_promptpay ?? "", bank: r.pay_bank ?? "", account: r.pay_account ?? "", name: r.pay_name ?? "" },
  };
}

/** Which seller fields the dictionary changed, as field paths */
export type VendorFix = "seller.name" | "seller.address" | "seller.branch" | "seller.tel" | "seller.fax" | "category" | "payment";

const sameTri = (a: Tri, b: Tri) => a.th === b.th && a.en === b.en && a.ja === b.ja;

export const vendorKey = (doc: Pick<LedgerDoc, "seller">): string | null => {
  const id = digitsOnly(doc.seller.taxId);
  return taxIdOk(id) ? id : null;
};

/** category/payment of the vendor's newest saved document */
export type VendorHistory = { category: string; payment: string };

/**
 * A vendor's line of business rarely changes, so the person's last saved choice for the same vendor
 * beats the AI's guess for a fresh reading. The selects stay editable; the change is shown as a fix.
 */
export function applyHistory(doc: LedgerDoc, h: VendorHistory | null | undefined): { doc: LedgerDoc; fixed: VendorFix[] } {
  if (!h) return { doc, fixed: [] };
  const fixed: VendorFix[] = [];
  const out = { ...doc };
  if (isCategoryKey(h.category) && h.category !== doc.category) {
    out.category = h.category as LedgerDoc["category"];
    fixed.push("category");
  }
  if ((PAYMENTS as readonly string[]).includes(h.payment) && h.payment !== doc.payment) {
    out.payment = h.payment as LedgerDoc["payment"];
    fixed.push("payment");
  }
  return fixed.length ? { doc: out, fixed } : { doc, fixed };
}

const NO_TRI: Tri = { th: "", en: "", ja: "" };

/**
 * The person picked a vendor from the directory: the seller becomes that vendor (name, tax ID, address,
 * branch, phone), and the vendor's last saved category/payment carry over. For the same vendor, what was
 * read from this paper is kept where the directory has nothing better (a branch prints its own address).
 */
/** The vendor's rule wins over the AI and over history (the person set it on purpose) */
export function applyRule(doc: LedgerDoc, v: Vendor | null | undefined): { doc: LedgerDoc; fixed: VendorFix[] } {
  if (!v) return { doc, fixed: [] };
  return applyHistory(doc, { category: v.ruleCategory ?? doc.category, payment: v.rulePayment ?? doc.payment });
}

/**
 * Save without asking: only when an admin switched it on for this vendor, the reading is not of low confidence,
 * and not a single automatic check failed (unclear fields, duplicates, sums, tax IDs… all count).
 */
export const canAutoRegister = (doc: LedgerDoc, v: Vendor | null | undefined, failingChecks: string[]): boolean =>
  !!v?.autoRegister && vendorKey(doc) === v.taxId && doc.confidence !== "low" && failingChecks.length === 0;

/** How many saves in a row with the same choice before a rule is offered */
export const SUGGEST_AFTER = 3;

/**
 * "Always do it this way?" — offered when the vendor's last SUGGEST_AFTER saved documents all have the same
 * category and payment, and the vendor has no rule saying so yet.
 */
export function suggestRule(recent: VendorHistory[], v: Vendor | null | undefined): VendorHistory | null {
  if (!v || recent.length < SUGGEST_AFTER) return null;
  const [first, ...rest] = recent.slice(0, SUGGEST_AFTER);
  if (!rest.every((h) => h.category === first.category && h.payment === first.payment)) return null;
  if (v.ruleCategory === first.category && v.rulePayment === first.payment) return null;
  return first;
}

export function pickVendor(doc: LedgerDoc, v: Vendor, h: VendorHistory | null | undefined): LedgerDoc {
  const same = digitsOnly(doc.seller.taxId) === v.taxId;
  const keep = (read: Tri, dir: Tri) => (same && triHas(read) ? read : triHas(dir) ? { ...dir } : same ? read : { ...NO_TRI });
  const seller = {
    ...doc.seller,
    taxId: v.taxId,
    name: triHas(v.name) ? { ...v.name } : doc.seller.name,
    address: keep(doc.seller.address, v.address),
    branch: keep(doc.seller.branch, v.branch),
    branchCode: same ? doc.seller.branchCode : "",
    tel: same && doc.seller.tel ? doc.seller.tel : v.tel,
    fax: same && doc.seller.fax ? doc.seller.fax : v.fax,
  };
  return applyRule(applyHistory({ ...doc, seller }, h).doc, v).doc;
}

export function applyVendor(doc: LedgerDoc, v: Vendor | null | undefined): { doc: LedgerDoc; fixed: VendorFix[] } {
  if (!v || vendorKey(doc) !== v.taxId) return { doc, fixed: [] };
  const seller = { ...doc.seller };
  const fixed: VendorFix[] = [];
  if (triHas(v.name) && !sameTri(seller.name, v.name)) {
    seller.name = { ...v.name };
    fixed.push("seller.name");
  }
  if (!triHas(seller.address) && triHas(v.address)) {
    seller.address = { ...v.address };
    fixed.push("seller.address");
  }
  if (!triHas(seller.branch) && triHas(v.branch)) {
    seller.branch = { ...v.branch };
    fixed.push("seller.branch");
  }
  if (!seller.tel && v.tel) {
    seller.tel = v.tel;
    fixed.push("seller.tel");
  }
  if (!seller.fax && v.fax) {
    seller.fax = v.fax;
    fixed.push("seller.fax");
  }
  return { doc: fixed.length ? { ...doc, seller } : doc, fixed };
}

/**
 * The one category that stands for a vendor (for its icon): the vendor's rule if set, otherwise the category its
 * saved documents use most (ties → the most recent of them, as `categories` is newest first), otherwise "other".
 */
export function vendorCategory(ruleCategory: string | null, categories: string[]): Category {
  const valid = (c: string | null | undefined): c is Category => isCategoryKey(c);
  if (valid(ruleCategory)) return ruleCategory;
  const count = new Map<Category, number>();
  for (const c of categories) if (valid(c)) count.set(c, (count.get(c) ?? 0) + 1);
  let best: Category = "other";
  let n = 0;
  for (const [c, k] of count) {
    if (k > n) {
      best = c;
      n = k;
    }
  }
  return best;
}
