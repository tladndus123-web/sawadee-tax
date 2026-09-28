// Branches (สาขา) of the one company: one tax ID, several shops. Every document and day of sales belongs to one.
// Pure part, shared by the app and the LINE bot; the client store is lib/branch-store.ts.

import { branchNo } from "./thai-tax";
import type { LedgerDoc } from "./types";

export interface Branch {
  id: string;
  /** "00000" head office, "00001"… as printed on tax invoices (สาขาที่) */
  no: string;
  name: string;
  sort: number;
}

export const HEAD_NO = "00000";
/** "all" = no branch chosen: every branch's books together */
export const ALL = "all";

export const isHead = (b: Pick<Branch, "no">) => b.no === HEAD_NO;
export const headOf = (branches: Branch[]) => branches.find(isHead) ?? branches[0] ?? null;
export const byId = (branches: Branch[], id: string) => branches.find((b) => b.id === id) ?? null;

/** Branch to show: its name, else "head office" / "branch 00001" in the screen language */
export function branchLabel(b: Branch, t: { head: string; branch: (no: string) => string }): string {
  return b.name.trim() || (isHead(b) ? t.head : t.branch(b.no));
}

/**
 * Which branch a document belongs to, in this order: what it already says (if that branch exists), the buyer's
 * branch number printed on the invoice (สาขาที่ 00001 → that branch), the branch the person is working in, else
 * the head office. "" when there are no branches yet (the database then puts it in the head office).
 */
export function assignBranch(doc: LedgerDoc, branches: Branch[], selected: string = ALL): LedgerDoc {
  if (doc.branchId && byId(branches, doc.branchId)) return doc;
  const printed = branchNo(doc.customer.branch);
  const fromPhoto = printed ? branches.find((b) => b.no === printed) : null;
  const chosen = selected !== ALL ? byId(branches, selected) : null;
  const id = (fromPhoto ?? chosen ?? headOf(branches))?.id ?? "";
  return id === doc.branchId ? doc : { ...doc, branchId: id };
}

/** Did the invoice itself say which branch (so no one needs to be asked)? */
export const branchFromPhoto = (doc: LedgerDoc, branches: Branch[]): Branch | null => {
  const printed = branchNo(doc.customer.branch);
  return printed ? (branches.find((b) => b.no === printed) ?? null) : null;
};

/** Sort: head office first, then by sort, then by number */
export const sortBranches = (branches: Branch[]) => [...branches].sort((a, b) => Number(isHead(b)) - Number(isHead(a)) || a.sort - b.sort || a.no.localeCompare(b.no));
