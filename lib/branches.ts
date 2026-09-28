// Branches (สาขา) of the one company: one tax ID, several shops. Every document and day of sales belongs to one.
// Pure part, shared by the app and the LINE bot; the client store is lib/branch-store.ts.

import { type LaborLine, monthLabor } from "./cost-control";
import { type MonthResult, monthResult, type Sale } from "./sales";
import { branchNo } from "./thai-tax";
import type { LedgerDoc } from "./types";

export interface Branch {
  id: string;
  /** "00000" head office, "00001"… as printed on tax invoices (สาขาที่) */
  no: string;
  name: string;
  sort: number;
  /** "" = automatic (by order), else a BRANCH_COLORS name */
  color: string;
}

/** Colours a branch can wear in the switcher: name → [dot / text, soft background] */
export const BRANCH_COLORS = {
  blue: ["#0a6cff", "rgb(10 108 255 / 0.12)"],
  orange: ["#f06d0f", "rgb(240 109 15 / 0.12)"],
  green: ["#1f9d55", "rgb(31 157 85 / 0.12)"],
  purple: ["#7c4dff", "rgb(124 77 255 / 0.12)"],
  pink: ["#e0457b", "rgb(224 69 123 / 0.12)"],
  teal: ["#0f9ba8", "rgb(15 155 168 / 0.12)"],
  amber: ["#c98a00", "rgb(201 138 0 / 0.14)"],
  red: ["#d93636", "rgb(217 54 54 / 0.12)"],
} as const;
export type BranchColor = keyof typeof BRANCH_COLORS;
export const COLOR_NAMES = Object.keys(BRANCH_COLORS) as BranchColor[];

/** The colour a branch wears: its own, else the next palette colour by its place in the list */
export function colorOf(b: Branch, branches: Branch[]): BranchColor {
  if ((COLOR_NAMES as string[]).includes(b.color)) return b.color as BranchColor;
  const i = Math.max(0, sortBranches(branches).findIndex((x) => x.id === b.id));
  return COLOR_NAMES[i % COLOR_NAMES.length];
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

export interface BranchSummary {
  branch: Branch;
  result: MonthResult;
}

/**
 * The month for each branch and for all together (the combined board): the same arithmetic as the sales page.
 * Documents or sales without a branch (older rows) count as the head office.
 */
export function branchSummaries(
  branches: Branch[],
  purchases: LedgerDoc[],
  sales: Sale[],
  month: string,
  companyTaxId: string,
  labor: LaborLine[] = [],
): { rows: BranchSummary[]; total: MonthResult } {
  const head = headOf(branches);
  const of = (id: string) => (id && byId(branches, id) ? id : (head?.id ?? ""));
  const rows = sortBranches(branches).map((b) => ({
    branch: b,
    result: monthResult(
      sales.filter((s) => of(s.branchId) === b.id),
      purchases.filter((d) => of(d.branchId) === b.id),
      month,
      companyTaxId,
      monthLabor(labor.filter((l) => of(l.branchId) === b.id), month),
    ),
  }));
  return { rows, total: monthResult(sales, purchases, month, companyTaxId, monthLabor(labor, month)) };
}
