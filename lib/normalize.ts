// normalize(): accepts AI output, stored documents or first-version documents
// and returns the full LedgerDoc shape (ported from the prototype).

import { amountWords } from "./baht-text";
import { fromSatang, parseBaht, parseBahtOrNull, parseQty, toSatang } from "./money";
import { digitsOnly, fixDate, isIsoDate } from "./thai-tax";
import {
  type Box,
  CATEGORIES,
  type Category,
  CONFIDENCES,
  type Confidence,
  COPY_KINDS,
  type CopyKind,
  DOC_TYPES,
  type DocType,
  type LedgerDoc,
  PAYMENTS,
  STICKERS,
  type Payment,
  type Totals,
  type Tri,
  WHT_TYPES,
  type WhtType,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any -- normalize accepts untrusted input */
type Loose = Record<string, any>;

export const str = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
export const emptyTri = (): Tri => ({ th: "", en: "", ja: "" });
export const tri = (o: unknown): Tri => {
  const x = (o ?? {}) as Loose;
  return { th: str(x.th), en: str(x.en), ja: str(x.ja) };
};
export const triHas = (o: Tri | null | undefined): boolean => !!o && !!(o.th || o.en || o.ja);

const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;

export function blank(): LedgerDoc {
  return {
    docType: "other",
    docTitle: emptyTri(),
    copyKind: "unknown",
    formSerial: "",
    docNo: "",
    date: "",
    dateWasBuddhist: false,
    seller: { name: emptyTri(), taxId: "", branchCode: "", address: emptyTri(), branch: emptyTri(), tel: "", fax: "", saleOffice: "" },
    customer: { code: "", name: emptyTri(), taxId: "", branch: emptyTri(), address: emptyTri() },
    orderNo: "",
    term: emptyTri(),
    creditDays: 0,
    dueDate: "",
    sales: { name: emptyTri(), area: emptyTri(), ref: "" },
    items: [],
    delivery: { note: emptyTri(), place: emptyTri(), contact: "", person: emptyTri() },
    totals: { total: 0, discount: 0, afterDisc: 0, deposit: 0, afterDep: 0, exempt: 0, taxable: 0, vat: 0, net: 0, wht: 0 },
    wordsPrinted: "",
    words: emptyTri(),
    terms: [],
    signs: { receiver: false, issuer: false, deliverer: null, receiverSign: "", issuerSign: "", delivererSign: "" },
    formCode: "",
    formSince: "",
    category: "other",
    payment: "other",
    paid: false,
    paidDate: "",
    stickers: [],
    confidence: "medium",
    unclear: [],
    note: emptyTri(),
    fieldBoxes: {},
    taxMonth: "",
    branchId: "",
    depYears: 0,
    disposedOn: "",
    noClaim: null,
    whtRate: 0,
    whtType: "",
  };
}

/** Fill totals lines that were not printed (null) from the ones that were. Satang math. */
export function normalizeTotals(tt: Loose = {}): Totals {
  const S = (v: number) => toSatang(v);
  const discount = parseBaht(tt.discount);
  const deposit = parseBaht(tt.deposit);
  const exempt = parseBaht(tt.exempt);
  const vat = parseBaht(tt.vat);
  const wht = parseBaht(tt.wht);
  const total = parseBahtOrNull(tt.total) ?? parseBaht(tt.net);
  const afterDisc = parseBahtOrNull(tt.afterDisc) ?? fromSatang(S(total) - S(discount));
  const afterDep = parseBahtOrNull(tt.afterDep) ?? fromSatang(S(afterDisc) - S(deposit));
  const taxable = parseBahtOrNull(tt.taxable) ?? fromSatang(S(afterDep) - S(exempt));
  const net = parseBahtOrNull(tt.net) ?? fromSatang(S(taxable) + S(exempt) + S(vat));
  return { total, discount, afterDisc, deposit, afterDep, exempt, taxable, vat, net, wht };
}

function normalizeBoxes(v: unknown): Record<string, Box> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, Box> = {};
  for (const [k, b] of Object.entries(v as Loose)) {
    if (!Array.isArray(b) || b.length !== 4) continue;
    const n = b.map(Number);
    if (n.every((x) => Number.isFinite(x) && x >= 0 && x <= 1) && n[2] > 0 && n[3] > 0) out[k] = n as Box;
  }
  return out;
}

export function normalize(input: unknown): LedgerDoc {
  const b = blank();
  if (!input || typeof input !== "object") return b;
  let a = input as Loose;

  // First-version document shape
  if (a.vendor && !a.seller) {
    a = {
      ...a,
      seller: { name: a.vendor, taxId: a.taxId, branchCode: a.branch },
      items: (a.items || []).map((i: Loose) => ({ desc: i.name, qty: i.qty, amount: i.amount })),
      totals: {
        total: a.subtotal,
        afterDisc: a.subtotal,
        afterDep: a.subtotal,
        taxable: a.subtotal,
        vat: a.vat,
        net: a.total,
        wht: a.wht,
      },
    };
  }

  const [date, dateBE] = fixDate(a.date);
  const [dueDate] = fixDate(a.dueDate);
  const s: Loose = a.seller || {};
  const c: Loose = a.customer || {};
  const sl: Loose = a.sales || {};
  const dv: Loose = a.delivery || {};
  const sg: Loose = a.signs || {};

  const totals = normalizeTotals(a.totals || {});
  const wordsPrinted = str(a.wordsPrinted);

  return {
    ...b,
    ...(a.id ? { id: String(a.id) } : {}),
    docType: oneOf<DocType>(DOC_TYPES, a.docType, "other"),
    docTitle: tri(a.docTitle),
    copyKind: oneOf<CopyKind>(COPY_KINDS, a.copyKind, "unknown"),
    formSerial: str(a.formSerial),
    docNo: str(a.docNo),
    date,
    dateWasBuddhist: !!a.dateWasBuddhist || dateBE,
    seller: {
      name: tri(s.name),
      // Never cut to 13: a 14-digit ID must stay wrong so the tax ID check catches it
      taxId: digitsOnly(str(s.taxId)).slice(0, 20),
      branchCode: str(s.branchCode),
      address: tri(s.address),
      branch: tri(s.branch),
      tel: str(s.tel),
      fax: str(s.fax),
      saleOffice: str(s.saleOffice),
    },
    customer: {
      code: str(c.code),
      name: tri(c.name),
      taxId: digitsOnly(str(c.taxId)).slice(0, 20),
      branch: tri(c.branch),
      address: tri(c.address),
    },
    orderNo: str(a.orderNo),
    term: tri(a.term),
    creditDays: Math.max(0, Math.round(parseBaht(a.creditDays))),
    dueDate,
    sales: { name: tri(sl.name), area: tri(sl.area), ref: str(sl.ref) },
    items: (Array.isArray(a.items) ? a.items : []).slice(0, 40).map((i: Loose) => ({
      category: oneOf<Category | "">(["", ...CATEGORIES], i?.category, ""),
      code: str(i?.code),
      desc: tri(i?.desc),
      wh: str(i?.wh),
      qty: parseQty(i?.qty),
      unit: tri(i?.unit),
      price: parseBaht(i?.price),
      amount: parseBaht(i?.amount),
    })),
    delivery: { note: tri(dv.note), place: tri(dv.place), contact: str(dv.contact), person: tri(dv.person) },
    totals,
    wordsPrinted,
    // wordsPrinted is the single source of the Thai line; without it the words are generated
    words: amountWords(totals.net, wordsPrinted),
    terms: (Array.isArray(a.terms) ? a.terms : []).slice(0, 10).map(tri),
    signs: {
      receiver: !!sg.receiver || !!str(sg.receiverSign),
      issuer: !!sg.issuer || !!str(sg.issuerSign),
      deliverer: sg.deliverer ? tri(sg.deliverer) : str(sg.delivererSign) ? emptyTri() : null,
      receiverSign: str(sg.receiverSign).slice(0, 60),
      issuerSign: str(sg.issuerSign).slice(0, 60),
      delivererSign: str(sg.delivererSign).slice(0, 60),
    },
    formCode: str(a.formCode),
    formSince: str(a.formSince),
    category: oneOf<Category>(CATEGORIES, a.category, "other"),
    payment: oneOf<Payment>(PAYMENTS, a.payment, "other"),
    paid: !!a.paid,
    paidDate: isIsoDate(a.paidDate) ? a.paidDate : "",
    stickers: STICKERS.filter((c) => Array.isArray(a.stickers) && a.stickers.includes(c)),
    confidence: oneOf<Confidence>(CONFIDENCES, a.confidence, "medium"),
    unclear: Array.isArray(a.unclear) ? a.unclear.map(str).filter(Boolean).slice(0, 30) : [],
    note: tri(a.note),
    fieldBoxes: normalizeBoxes(a.fieldBoxes ?? a.field_boxes),
    taxMonth: typeof a.taxMonth === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(a.taxMonth) ? a.taxMonth : "",
    depYears: Math.max(0, Math.min(50, Math.round(Number(a.depYears) || 0))),
    disposedOn: isIsoDate(a.disposedOn) ? a.disposedOn : "",
    branchId: typeof a.branchId === "string" && /^[0-9a-f-]{36}$/i.test(a.branchId) ? a.branchId : "",
    noClaim: typeof a.noClaim === "boolean" ? a.noClaim : null,
    whtRate: Math.min(100, Math.max(0, Math.round((Number(a.whtRate) || 0) * 100) / 100)),
    whtType: oneOf<WhtType | "">(["", ...WHT_TYPES], a.whtType, ""),
  };
}

/** Drop item lines that are completely empty (used before saving). */
export const dropEmptyItems = (d: LedgerDoc): LedgerDoc => ({
  ...d,
  items: d.items.filter((i) => i.code || i.desc.th || i.desc.en || i.desc.ja || i.amount),
});
