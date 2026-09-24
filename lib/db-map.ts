// LedgerDoc ⇄ database rows (supabase/migrations). Pure functions, no Supabase client here.
// Row shape follows PROMPT.md §5; the app keeps working with the normalize() shape.

import { flagsFor } from "./checks";
import { normalize } from "./normalize";
import type { LedgerDoc } from "./types";

export type DbStatus = "draft" | "reviewed";

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
  field_boxes: unknown;
  photo_path: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
}

export interface ItemRow {
  line_no: number;
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
    },
    items: doc.items.map((i, n) => ({ line_no: n + 1, code: i.code, desc: i.desc, wh: i.wh, qty: i.qty, unit: i.unit, price: i.price, amount: i.amount })),
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
    items: [...items].sort((a, b) => a.line_no - b.line_no).map((i) => ({ code: i.code, desc: i.desc, wh: i.wh, qty: i.qty, unit: i.unit, price: i.price, amount: i.amount })),
  });
}
