// Vendor dictionary rules (step 7). The dictionary is keyed by the seller's tax ID (public.vendors,
// filled by a database trigger when documents are saved). A new AI reading of a known vendor is tidied:
//   - the name always follows the dictionary (same company, same spelling every time)
//   - address, head office/branch, tel and fax are filled only when the reading left them empty
//     (branches share one tax ID but print different addresses, so a read address is never replaced)

import { triHas } from "./normalize";
import { digitsOnly, taxIdOk } from "./thai-tax";
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

/** Which seller fields the dictionary changed, as field paths */
export type VendorFix = "seller.name" | "seller.address" | "seller.branch" | "seller.tel" | "seller.fax";

const sameTri = (a: Tri, b: Tri) => a.th === b.th && a.en === b.en && a.ja === b.ja;

export const vendorKey = (doc: Pick<LedgerDoc, "seller">): string | null => {
  const id = digitsOnly(doc.seller.taxId);
  return taxIdOk(id) ? id : null;
};

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
