// LedgerDoc ⇄ database rows (supabase/migrations). Pure functions, no Supabase client here.
// Row shape follows PROMPT.md §5; the app keeps working with the normalize() shape.

import { flagsFor } from "./checks";
import { normalize } from "./normalize";
import type { LedgerDoc } from "./types";

export type DbStatus = "draft" | "reviewed";

/**
 * The columns a list of documents needs (speed, owner 2026-10-27: "조금 느린거 같은데"): every column but the two heavy
 * ones nothing in a list uses — ai_raw (the AI's raw answer, kept for the record) and field_boxes (where each field
 * sits on the photo, needed only on one document's screen: lib/ledger-store fieldBoxesOf). Lines included.
 */
export const DOC_LIST_COLUMNS =
  "id, created_by, created_at, updated_by, updated_at, status, doc_type, doc_title, copy_kind, form_serial, doc_no, doc_date, date_was_buddhist, vendor_id, seller, customer, order_no, term, credit_days, due_date, sales, delivery, total, discount, after_disc, deposit, after_dep, exempt, taxable, vat, net, wht, words_printed, words, terms, signs, form_code, form_since, category, payment, paid, paid_date, confidence, unclear, note, flags, stickers, photo_path, deleted_at, deleted_by, delete_reason, tax_month, no_claim, wht_rate, wht_type, ack_flags, ack_by, ack_at, branch_id, dep_years, disposed_on, photo_hash, memo, checked_at, checked_by, document_items(*)";

export interface DocumentRow {
  id: string;
  status: DbStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  doc_type: string;
  doc_title: unknown;
  copy_kind: string;
  form_serial: string;
  doc_no: string;
  doc_date: string | null;
  date_was_buddhist: boolean;
  seller: Record<string, unknown>;
  customer: Record<string, unknown>;
  order_no: string;
  term: unknown;
  credit_days: number;
  due_date: string | null;
  sales: unknown;
  delivery: unknown;
  total: number | string;
  discount: number | string;
  after_disc: number | string;
  deposit: number | string;
  after_dep: number | string;
  exempt: number | string;
  taxable: number | string;
  vat: number | string;
  net: number | string;
  wht: number | string;
  words_printed: string;
  words: unknown;
  terms: unknown;
  signs: unknown;
  form_code: string;
  form_since: string;
  category: string;
  payment: string;
  paid: boolean;
  paid_date: string | null;
  confidence: string;
  unclear: string[];
  note: unknown;
  flags: string[];
  stickers: string[];
  /** Left out of lists (DOC_LIST_COLUMNS) */
  field_boxes?: unknown;
  photo_path: string | null;
  tax_month: string | null;
  branch_id?: string | null;
  dep_years?: number | null;
  disposed_on?: string | null;
  memo?: string | null;
  no_claim: boolean | null;
  wht_rate: number | string;
  wht_type: string;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
}

export interface ItemRow {
  line_no: number;
  category?: string | null;
  code: string;
  desc: unknown;
  wh: string;
  qty: number | string;
  unit: unknown;
  price: number | string;
  amount: number | string;
}

const dateOrNull = (s: string) => (s ? s : null);

/** Row fields the app writes (who/when/delete columns are set by the database). */
export function docToRow(doc: LedgerDoc, status: DbStatus, companyTaxId?: string): { row: Record<string, unknown>; items: ItemRow[] } {
  const t = doc.totals;
  return {
    row: {
      status,
      doc_type: doc.docType,
      doc_title: doc.docTitle,
      copy_kind: doc.copyKind,
      form_serial: doc.formSerial,
      doc_no: doc.docNo,
      doc_date: dateOrNull(doc.date),
      date_was_buddhist: doc.dateWasBuddhist,
      seller: doc.seller,
      customer: doc.customer,
      order_no: doc.orderNo,
      term: doc.term,
      credit_days: doc.creditDays,
      due_date: dateOrNull(doc.dueDate),
      sales: doc.sales,
      delivery: doc.delivery,
      total: t.total,
      discount: t.discount,
      after_disc: t.afterDisc,
      deposit: t.deposit,
      after_dep: t.afterDep,
      exempt: t.exempt,
      taxable: t.taxable,
      vat: t.vat,
      net: t.net,
      wht: t.wht,
      words_printed: doc.wordsPrinted,
      words: doc.words,
      terms: doc.terms,
      signs: doc.signs,
      form_code: doc.formCode,
      form_since: doc.formSince,
      category: doc.category,
      payment: doc.payment,
      paid: doc.paid,
      paid_date: dateOrNull(doc.paidDate),
      confidence: doc.confidence,
      unclear: doc.unclear,
      note: doc.note,
      flags: flagsFor(doc, { companyTaxId }),
      stickers: doc.stickers,
      field_boxes: doc.fieldBoxes,
      tax_month: doc.taxMonth || null,
      // Left out when unset: the database then puts it in the head office
      ...(doc.branchId ? { branch_id: doc.branchId } : {}),
      dep_years: doc.depYears,
      memo: doc.memo,
      no_claim: doc.noClaim,
      wht_rate: doc.whtRate,
      wht_type: doc.whtType,
    },
    items: doc.items.map((i, n) => ({ line_no: n + 1, category: i.category, code: i.code, desc: i.desc, wh: i.wh, qty: i.qty, unit: i.unit, price: i.price, amount: i.amount })),
  };
}

/** Database row (+ items) → LedgerDoc, through normalize() so old or partial rows are always safe. */
export function rowToDoc(row: DocumentRow, items: ItemRow[]): LedgerDoc {
  return normalize({
    id: row.id,
    docType: row.doc_type,
    docTitle: row.doc_title,
    copyKind: row.copy_kind,
    formSerial: row.form_serial,
    docNo: row.doc_no,
    date: row.doc_date ?? "",
    dateWasBuddhist: row.date_was_buddhist,
    seller: row.seller,
    customer: row.customer,
    orderNo: row.order_no,
    term: row.term,
    creditDays: row.credit_days,
    dueDate: row.due_date ?? "",
    sales: row.sales,
    delivery: row.delivery,
    totals: {
      total: row.total,
      discount: row.discount,
      afterDisc: row.after_disc,
      deposit: row.deposit,
      afterDep: row.after_dep,
      exempt: row.exempt,
      taxable: row.taxable,
      vat: row.vat,
      net: row.net,
      wht: row.wht,
    },
    wordsPrinted: row.words_printed,
    words: row.words,
    terms: row.terms,
    signs: row.signs,
    formCode: row.form_code,
    formSince: row.form_since,
    category: row.category,
    payment: row.payment,
    paid: row.paid,
    paidDate: row.paid_date ?? "",
    confidence: row.confidence,
    unclear: row.unclear,
    note: row.note,
    stickers: row.stickers,
    fieldBoxes: row.field_boxes,
    taxMonth: row.tax_month ?? "",
    branchId: row.branch_id ?? "",
    depYears: row.dep_years ?? 0,
    disposedOn: row.disposed_on ?? "",
    memo: row.memo ?? "",
    noClaim: row.no_claim,
    whtRate: row.wht_rate,
    whtType: row.wht_type,
    items: [...items].sort((a, b) => a.line_no - b.line_no).map((i) => ({ category: i.category ?? "", code: i.code, desc: i.desc, wh: i.wh, qty: i.qty, unit: i.unit, price: i.price, amount: i.amount })),
  });
}
