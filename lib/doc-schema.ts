// zod schema for a normalized LedgerDoc (used by the edit form and the API).

import { z } from "zod";
import { isIsoDate } from "./thai-tax";
import {
  CATEGORIES,
  CONFIDENCES,
  COPY_KINDS,
  DOC_TYPES,
  type LedgerDoc,
  PAYMENTS,
  STICKERS,
  WHT_TYPES,
} from "./types";

const isoOrEmpty = z.string().refine((s) => s === "" || isIsoDate(s), "yyyy-mm-dd");
// Digits only; the length (13) is judged by the tax ID check so a wrong ID can still be saved and flagged
const taxId = z.string().regex(/^\d{0,20}$/, "digits");
const money = z.number().finite();

export const triSchema = z.object({ th: z.string(), en: z.string(), ja: z.string() });

export const itemSchema = z.object({
  code: z.string(),
  desc: triSchema,
  wh: z.string(),
  qty: z.number().finite(),
  unit: triSchema,
  price: money,
  amount: money,
});

export const docSchema = z.object({
  id: z.string().optional(),
  docType: z.enum(DOC_TYPES),
  docTitle: triSchema,
  copyKind: z.enum(COPY_KINDS),
  formSerial: z.string(),
  docNo: z.string(),
  date: isoOrEmpty,
  dateWasBuddhist: z.boolean(),
  seller: z.object({
    name: triSchema,
    taxId,
    branchCode: z.string(),
    address: triSchema,
    branch: triSchema,
    tel: z.string(),
    fax: z.string(),
    saleOffice: z.string(),
  }),
  customer: z.object({ code: z.string(), name: triSchema, taxId, branch: triSchema, address: triSchema }),
  orderNo: z.string(),
  term: triSchema,
  creditDays: z.number().int().min(0),
  dueDate: isoOrEmpty,
  sales: z.object({ name: triSchema, area: triSchema, ref: z.string() }),
  items: z.array(itemSchema).max(40),
  delivery: z.object({ note: triSchema, place: triSchema, contact: z.string(), person: triSchema }),
  totals: z.object({
    total: money,
    discount: money,
    afterDisc: money,
    deposit: money,
    afterDep: money,
    exempt: money,
    taxable: money,
    vat: money,
    net: money,
    wht: money,
  }),
  wordsPrinted: z.string(),
  words: triSchema,
  terms: z.array(triSchema).max(10),
  signs: z.object({
    receiver: z.boolean(),
    issuer: z.boolean(),
    deliverer: triSchema.nullable(),
    receiverSign: z.string().max(60),
    issuerSign: z.string().max(60),
    delivererSign: z.string().max(60),
  }),
  formCode: z.string(),
  formSince: z.string(),
  category: z.enum(CATEGORIES),
  payment: z.enum(PAYMENTS),
  paid: z.boolean(),
  paidDate: isoOrEmpty,
  stickers: z.array(z.enum(STICKERS)),
  confidence: z.enum(CONFIDENCES),
  unclear: z.array(z.string()),
  note: triSchema,
  fieldBoxes: z.record(z.string(), z.tuple([z.number(), z.number(), z.number(), z.number()])),
  taxMonth: z.string().regex(/^(\d{4}-(0[1-9]|1[0-2]))?$/, "yyyy-mm"),
  branchId: z.string(),
  noClaim: z.boolean().nullable(),
  whtRate: z.number().min(0).max(100),
  whtType: z.enum(["", ...WHT_TYPES]),
}) satisfies z.ZodType<LedgerDoc>;
