// Data shape produced by normalize(); mirrors the prototype and sample-document.json

export const FORM_LANGS = ["th", "en", "ja"] as const;
export type FormLang = (typeof FORM_LANGS)[number];
export type Tri = Record<FormLang, string>;

export const DOC_TYPES = ["full", "abbr", "receipt", "other"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const COPY_KINDS = ["original", "copy", "unknown"] as const;
export type CopyKind = (typeof COPY_KINDS)[number];

export const CATEGORIES = [
  "food",
  "transport",
  "fuel",
  "office",
  "supplies",
  "utilities",
  "rent",
  "entertainment",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const PAYMENTS = ["credit", "cash", "transfer", "card", "other"] as const;
export type Payment = (typeof PAYMENTS)[number];

/** Colour stickers for sorting documents (Finder-style tags); names are set per company */
export const STICKERS = ["red", "orange", "yellow", "green", "blue", "purple", "gray"] as const;
export type Sticker = (typeof STICKERS)[number];

export const CONFIDENCES = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const TOTAL_KEYS = [
  "total",
  "discount",
  "afterDisc",
  "deposit",
  "afterDep",
  "exempt",
  "taxable",
  "vat",
  "net",
  "wht",
] as const;
export type TotalKey = (typeof TOTAL_KEYS)[number];
export type Totals = Record<TotalKey, number>;

export interface Seller {
  name: Tri;
  taxId: string;
  branchCode: string;
  address: Tri;
  /** Head office / branch as printed ("สำนักงานใหญ่" or "สาขาที่ 00001"), required by DG Notification 199 */
  branch: Tri;
  tel: string;
  fax: string;
  saleOffice: string;
}

export interface Customer {
  code: string;
  name: Tri;
  taxId: string;
  branch: Tri;
  address: Tri;
}

export interface Sales {
  name: Tri;
  area: Tri;
  ref: string;
}

export interface Item {
  code: string;
  desc: Tri;
  wh: string;
  qty: number;
  unit: Tri;
  price: number;
  amount: number;
}

export interface Delivery {
  note: Tri;
  place: Tri;
  contact: string;
  person: Tri;
}

export interface Signs {
  receiver: boolean;
  issuer: boolean;
  deliverer: Tri | null;
  /** Signature typed by staff in the app ("" = none). Typing one also marks the box as signed. */
  receiverSign: string;
  issuerSign: string;
  delivererSign: string;
}

/** [x, y, w, h] as 0–1 fractions of the photo */
export type Box = [number, number, number, number];

export interface LedgerDoc {
  id?: string;
  docType: DocType;
  docTitle: Tri;
  copyKind: CopyKind;
  formSerial: string;
  docNo: string;
  /** ISO yyyy-mm-dd, Gregorian */
  date: string;
  dateWasBuddhist: boolean;
  seller: Seller;
  customer: Customer;
  orderNo: string;
  term: Tri;
  creditDays: number;
  dueDate: string;
  sales: Sales;
  items: Item[];
  delivery: Delivery;
  /** Baht amounts rounded to 2 decimals */
  totals: Totals;
  wordsPrinted: string;
  words: Tri;
  terms: Tri[];
  signs: Signs;
  formCode: string;
  formSince: string;
  category: Category;
  payment: Payment;
  paid: boolean;
  paidDate: string;
  /** Colour stickers staff attach for sorting (in STICKERS order, no duplicates) */
  stickers: Sticker[];
  confidence: Confidence;
  unclear: string[];
  note: Tri;
  fieldBoxes: Record<string, Box>;
}
