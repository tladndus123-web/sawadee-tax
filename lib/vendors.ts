// Vendor dictionary rules (step 7). The dictionary is keyed by the seller's tax ID (public.vendors,
// filled by a database trigger when documents are saved). A new AI reading of a known vendor is tidied:
//   - the name always follows the dictionary (same company, same spelling every time)
//   - address, head office/branch, tel and fax are filled only when the reading left them empty
//     (branches share one tax ID but print different addresses, so a read address is never replaced)

import { normalize, triHas } from "./normalize";
import { digitsOnly, taxIdOk } from "./thai-tax";
import { CATEGORIES, PAYMENTS } from "./types";
import type { LedgerDoc, Tri } from "./types";

export interface Vendor {
  id: string;
  taxId: string;
  name: Tri;
  address: Tri;
  branch: Tri;
  tel: string;
  fax: string;
}

export interface VendorRow {
  id: string;
  tax_id: string;
  name: unknown;
  address: unknown;
  branch: unknown;
  tel: string;
  fax: string;
}

/** Rows through normalize() so any stored shape becomes clean {th, en, ja} */
export function toVendor(r: VendorRow): Vendor {
  const s = normalize({ seller: { name: r.name, address: r.address, branch: r.branch } }).seller;
  return { id: r.id, taxId: r.tax_id, name: s.name, address: s.address, branch: s.branch, tel: r.tel ?? "", fax: r.fax ?? "" };
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
  if ((CATEGORIES as readonly string[]).includes(h.category) && h.category !== doc.category) {
    out.category = h.category as LedgerDoc["category"];
    fixed.push("category");
  }
  if ((PAYMENTS as readonly string[]).includes(h.payment) && h.payment !== doc.payment) {
    out.payment = h.payment as LedgerDoc["payment"];
    fixed.push("payment");
  }
  return fixed.length ? { doc: out, fixed } : { doc, fixed };
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
