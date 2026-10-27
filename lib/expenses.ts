// Expense claims (owner, 2026-10-28): an employee paid for the shop with their own money and claims it back. They
// photograph the receipt (the AI reads it, as on the upload screen) or type it in; an admin approves or rejects it
// (in the app or with the LINE buttons) and marks it paid back — in cash, by transfer or with the next pay — which
// puts the receipt into the ledger as a paid document. The company decides what staff may claim (categories),
// whether a photo is needed, and up to which amount a claim is approved by itself. Money in satang.

import { normalize } from "./normalize";
import { fromSatang, toSatang } from "./money";
import { type Category, isCategoryKey, type LedgerDoc } from "./types";

export type ClaimStatus = "pending" | "approved" | "rejected" | "paid";
export type PaidHow = "cash" | "transfer" | "payroll";
export const PAID_HOW: PaidHow[] = ["cash", "transfer", "payroll"];

export interface Claim {
  id: string;
  userId: string | null;
  name: string;
  /** The branch the claim belongs to (where the person works) */
  branchId?: string;
  /** YYYY-MM-DD, the receipt's day */
  day: string;
  seller: string;
  /** Satang */
  amount: number;
  category: Category;
  note: string;
  photoPath: string | null;
  /** The photo's fingerprint (lib/photo-hash), to spot the same receipt claimed twice */
  photoHash: string | null;
  /** The AI reading of the receipt, when there was one */
  doc: LedgerDoc | null;
  status: ClaimStatus;
  reason: string;
  decidedAt: string | null;
  paidOn: string | null;
  paidHow: PaidHow | null;
  documentId: string | null;
  createdAt: string;
}

export interface ExpenseSettings {
  /** What staff may pick (in this order) */
  categories: Category[];
  /** Claims up to this many baht are approved by themselves (0 = every claim waits for an admin) */
  autoUnder: number;
  /** A receipt photo is needed */
  photo: boolean;
  /** Admins get each new claim on LINE with approve / reject buttons */
  line: boolean;
}

export const DEFAULT_EXPENSE_CATEGORIES: Category[] = ["supplies", "consumables", "food", "transport", "fuel", "repairs", "office"];
export const AUTO_CHOICES = [0, 100, 300, 500, 1000];

export function readExpenseSettings(v: unknown): ExpenseSettings {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const cats = Array.isArray(o.categories) ? [...new Set(o.categories.filter(isCategoryKey))] : [];
  const auto = Number(o.autoUnder);
  return {
    categories: cats.length ? cats : DEFAULT_EXPENSE_CATEGORIES,
    autoUnder: Number.isFinite(auto) && auto > 0 ? Math.min(Math.round(auto), 100_000) : 0,
    photo: o.photo !== false,
    line: o.line !== false,
  };
}

/** What a claim may be saved with: a day, a positive amount, and a photo when the company asks for one */
export function claimProblems(c: Pick<Claim, "day" | "amount" | "photoPath">, s: Pick<ExpenseSettings, "photo">, hasNewPhoto = false): ("day" | "amount" | "photo")[] {
  const out: ("day" | "amount" | "photo")[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.day)) out.push("day");
  if (!(c.amount > 0)) out.push("amount");
  if (s.photo && !c.photoPath && !hasNewPhoto) out.push("photo");
  return out;
}

export interface Owed {
  userId: string | null;
  name: string;
  /** Satang */
  amount: number;
  ids: string[];
}

/** Approved and not yet paid back, per person (most first) */
export function owed(claims: Claim[]): Owed[] {
  const by = new Map<string, Owed>();
  for (const c of claims) {
    if (c.status !== "approved") continue;
    const key = c.userId ?? `name:${c.name}`;
    const o = by.get(key) ?? { userId: c.userId, name: c.name, amount: 0, ids: [] };
    o.amount += c.amount;
    o.ids.push(c.id);
    by.set(key, o);
  }
  return [...by.values()].sort((a, b) => b.amount - a.amount);
}

export interface ClaimSummary {
  pending: number;
  /** Satang approved and not paid back */
  owed: number;
  /** Satang paid back in the month */
  paid: number;
  count: number;
}
export function claimSummary(claims: Claim[], month: string): ClaimSummary {
  let pending = 0,
    owe = 0,
    paid = 0,
    count = 0;
  for (const c of claims) {
    if (c.status === "pending") pending++;
    if (c.status === "approved") owe += c.amount;
    if (c.status === "paid" && c.paidOn?.startsWith(month)) paid += c.amount;
    if (c.day.startsWith(month)) count++;
  }
  return { pending, owed: owe, paid, count };
}

/**
 * The ledger document a paid-back claim becomes: the AI reading when there was one (its amounts and VAT), else a
 * plain receipt for the amount; paid on the day it was paid back, with who claimed it in the remark.
 */
export function claimDoc(c: Pick<Claim, "doc" | "seller" | "day" | "amount" | "category" | "note" | "name">, paidOn: string, how: PaidHow): LedgerDoc {
  const memo = [`${c.name}`.trim(), c.note.trim()].filter(Boolean).join(" · ").slice(0, 300);
  const payment = how === "transfer" ? "transfer" : "cash";
  if (c.doc) return normalize({ ...c.doc, category: c.category, paid: true, paidDate: paidOn, payment, memo: [c.doc.memo, memo].filter(Boolean).join(" · ") });
  const baht = fromSatang(c.amount);
  return normalize({
    docType: "receipt",
    copyKind: "original",
    date: c.day,
    seller: { name: { th: c.seller, en: c.seller, ja: "" } },
    items: [{ desc: { th: c.note || c.seller, en: c.note || c.seller, ja: "" }, qty: 1, price: baht, amount: baht, category: c.category }],
    totals: { total: baht, net: baht },
    category: c.category,
    paid: true,
    paidDate: paidOn,
    payment,
    memo,
    confidence: "high",
  });
}

/** The amount the AI read, in satang (what was paid: the net), or 0 */
export const docAmount = (d: Pick<LedgerDoc, "totals"> | null) => (d ? toSatang(d.totals.net) : 0);

export interface MonthExpenses {
  /** Satang approved or paid back, receipts dated in the month */
  total: number;
  count: number;
  /** The month before, for comparison */
  prevTotal: number;
  /** Most first, at most 3 */
  people: { name: string; amount: number }[];
  categories: { category: Category; amount: number }[];
}

/** The month's expense claims for the month-end report (rejected and waiting ones left out) */
export function monthExpenses(claims: Pick<Claim, "name" | "userId" | "day" | "amount" | "category" | "status">[], month: string): MonthExpenses {
  const prev = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const counted = (c: (typeof claims)[number], m: string) => (c.status === "approved" || c.status === "paid") && c.day.startsWith(m);
  const mine = claims.filter((c) => counted(c, month));
  const top = <K extends string>(key: (c: (typeof claims)[number]) => K) => {
    const by = new Map<K, number>();
    for (const c of mine) by.set(key(c), (by.get(key(c)) ?? 0) + c.amount);
    return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  };
  return {
    total: mine.reduce((a, c) => a + c.amount, 0),
    count: mine.length,
    prevTotal: claims.filter((c) => counted(c, prev)).reduce((a, c) => a + c.amount, 0),
    people: top((c) => c.name).map(([name, amount]) => ({ name, amount })),
    categories: top((c) => c.category).map(([category, amount]) => ({ category, amount })),
  };
}

/** A database row (public.expense_claims) → a claim; shared by the app and the server */
export const rowToClaim = (r: Record<string, unknown>): Claim => ({
  id: r.id as string,
  userId: (r.user_id as string) ?? null,
  name: (r.name as string) ?? "",
  branchId: (r.branch_id as string) ?? undefined,
  day: r.day as string,
  seller: (r.seller as string) ?? "",
  amount: Number(r.amount),
  category: (isCategoryKey(r.category) ? r.category : "other") as Category,
  note: (r.note as string) ?? "",
  photoPath: (r.photo_path as string) ?? null,
  photoHash: (r.photo_hash as string) ?? null,
  doc: r.doc ? normalize(r.doc) : null,
  status: r.status as ClaimStatus,
  reason: (r.reason as string) ?? "",
  decidedAt: (r.decided_at as string) ?? null,
  paidOn: (r.paid_on as string) ?? null,
  paidHow: (r.paid_how as PaidHow) ?? null,
  documentId: (r.document_id as string) ?? null,
  createdAt: r.created_at as string,
});


/**
 * A ledger document a member paid out of their own pocket → their expense claim (owner, 2026-10-27: "장부에서 경비로
 * 넘기기"). The document stays in the ledger (its cost counts once); the claim points at it, starts approved (an admin
 * moves it) and, once paid back, marks that document paid instead of adding a new one.
 */
export function claimFromDocument(doc: LedgerDoc, documentId: string, person: { userId: string; name: string }, note = "") {
  return {
    user_id: person.userId,
    name: person.name.trim().slice(0, 80),
    ...(doc.branchId ? { branch_id: doc.branchId } : {}),
    day: doc.date,
    seller: (doc.seller.name.en || doc.seller.name.th || doc.seller.name.ja || "").slice(0, 120),
    amount: docAmount(doc),
    category: doc.category,
    note: note.trim().slice(0, 500),
    doc,
    status: "approved" as const,
    document_id: documentId,
  };
}
