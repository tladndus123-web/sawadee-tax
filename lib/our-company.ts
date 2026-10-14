// Our own company on a purchase invoice (owner, 2026-10-14): the buyer is always us, yet the AI read our name afresh
// on every photo and misspelled it in a dozen ways ("ซันยู" → "ชันยู", "ธันยู", "ยันนู" …). When the buyer's tax ID is
// ours, the name becomes the spelling most saved documents agree on, and the address the one most documents of the
// same buyer branch (head office 00000, branch 00006 …) agree on — each branch is billed at its own address.

import { branchNo, digitsOnly } from "./thai-tax";
import type { LedgerDoc, Tri } from "./types";

export interface OurCompany {
  taxId: string;
  name: Partial<Tri>;
  /** Branch number (00000 = head office) → address */
  addressByBranch: Record<string, Partial<Tri>>;
}

const LANGS = ["th", "en", "ja"] as const;

/** The name without a branch printed after it: "บริษัท … จำกัด (สาขาที่ 00006)" → "บริษัท … จำกัด" */
const baseName = (s: string) =>
  s
    .replace(/\s*[(（][^)）]*(สาขา|สำนักงานใหญ่|branch|head office|支店|本店)[^)）]*[)）]?\s*$/i, "")
    .replace(/\s*(สาขาที่|สาขา)\s*\d+\s*$/, "")
    .trim();

/** The most common non-empty value (ties: the first seen) */
function majority(values: string[]): string {
  const count = new Map<string, number>();
  for (const v of values.map((x) => x.trim()).filter(Boolean)) count.set(v, (count.get(v) ?? 0) + 1);
  let best = "";
  let n = 0;
  for (const [v, c] of count) if (c > n) [best, n] = [v, c];
  return best;
}

const triOf = (list: Partial<Tri>[]): Partial<Tri> =>
  Object.fromEntries(LANGS.map((l) => [l, majority(list.map((t) => t[l] ?? ""))]).filter(([, v]) => v)) as Partial<Tri>;

/** Our name and branch addresses as most saved documents addressed to our tax ID print them */
export function ourCompanyFrom(docs: readonly LedgerDoc[], companyTaxId: string): OurCompany {
  const id = digitsOnly(companyTaxId);
  const mine = id ? docs.filter((d) => digitsOnly(d.customer.taxId) === id) : [];
  const name = triOf(mine.map((d) => ({ th: baseName(d.customer.name.th), en: baseName(d.customer.name.en), ja: baseName(d.customer.name.ja) })));
  const byBranch = new Map<string, Partial<Tri>[]>();
  for (const d of mine) {
    const b = branchNo(d.customer.branch);
    if (!b) continue;
    byBranch.set(b, [...(byBranch.get(b) ?? []), d.customer.address]);
  }
  // A branch's address only when at least two documents agree on it (one reading proves nothing)
  const addressByBranch: Record<string, Partial<Tri>> = {};
  for (const [b, list] of byBranch) {
    const th = majority(list.map((t) => t.th ?? ""));
    if (list.filter((t) => (t.th ?? "").trim() === th).length >= 2) addressByBranch[b] = triOf(list);
  }
  return { taxId: id, name, addressByBranch };
}

/** A fresh reading whose buyer is us: our known name (and the branch's address, when known) replace what was read */
export function applyOurCompany(doc: LedgerDoc, ours: OurCompany): LedgerDoc {
  if (!ours.taxId || digitsOnly(doc.customer.taxId) !== ours.taxId) return doc;
  const merge = (read: Tri, known: Partial<Tri> | undefined): Tri => ({ th: known?.th || read.th, en: known?.en || read.en, ja: known?.ja || read.ja });
  const address = ours.addressByBranch[branchNo(doc.customer.branch)];
  return { ...doc, customer: { ...doc.customer, name: merge(doc.customer.name, ours.name), address: merge(doc.customer.address, address) } };
}
