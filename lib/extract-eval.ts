// Field-by-field comparison of an AI reading with the hand-checked answer (sample-document.json).
// Groups: "exact" = numbers, codes, dates, choices (must match); "thai" = Thai text as printed
// (spaces ignored); "english" = names/addresses in English (case, spaces and punctuation ignored).
// Japanese is a translation, not printed on the paper, so it is not scored.

import { cleanWords } from "./baht-text";
import { TOTAL_KEYS, type LedgerDoc, type Tri } from "./types";

export type EvalGroup = "exact" | "thai" | "english";

export interface FieldResult {
  path: string;
  group: EvalGroup;
  expected: string;
  got: string;
  ok: boolean;
}

export interface EvalReport {
  fields: FieldResult[];
  score: Record<EvalGroup | "all", { ok: number; total: number }>;
}

const thai = (s: string) => s.replace(/\s+/g, "");
const latin = (s: string) => s.toLowerCase().replace(/[\s.,'"()\-]/g, "");

export function compareDocs(expected: LedgerDoc, got: LedgerDoc): EvalReport {
  const fields: FieldResult[] = [];
  const add = (path: string, group: EvalGroup, e: unknown, g: unknown, eq?: (a: string, b: string) => boolean) => {
    const es = e == null ? "" : String(e);
    const gs = g == null ? "" : String(g);
    fields.push({ path, group, expected: es, got: gs, ok: eq ? eq(es, gs) : es === gs });
  };
  const tri = (path: string, e: Tri | null | undefined, g: Tri | null | undefined) => {
    if (e?.th) add(`${path}.th`, "thai", e.th, g?.th, (a, b) => thai(a) === thai(b));
    if (e?.en) add(`${path}.en`, "english", e.en, g?.en, (a, b) => latin(a) === latin(b));
  };

  // Exact: identifiers, dates, choices, money
  add("docType", "exact", expected.docType, got.docType);
  add("copyKind", "exact", expected.copyKind, got.copyKind);
  add("formSerial", "exact", expected.formSerial, got.formSerial);
  add("docNo", "exact", expected.docNo, got.docNo);
  add("date", "exact", expected.date, got.date);
  add("dateWasBuddhist", "exact", expected.dateWasBuddhist, got.dateWasBuddhist);
  add("seller.taxId", "exact", expected.seller.taxId, got.seller.taxId);
  add("seller.branchCode", "exact", expected.seller.branchCode, got.seller.branchCode);
  add("customer.code", "exact", expected.customer.code, got.customer.code);
  add("customer.taxId", "exact", expected.customer.taxId, got.customer.taxId);
  add("orderNo", "exact", expected.orderNo, got.orderNo);
  add("creditDays", "exact", expected.creditDays, got.creditDays);
  add("dueDate", "exact", expected.dueDate, got.dueDate);
  add("sales.ref", "exact", expected.sales.ref, got.sales.ref);
  for (const k of TOTAL_KEYS) add(`totals.${k}`, "exact", expected.totals[k], got.totals[k]);
  add("wordsPrinted", "exact", expected.wordsPrinted, got.wordsPrinted, (a, b) => cleanWords(a) === cleanWords(b));
  add("formCode", "exact", expected.formCode, got.formCode, (a, b) => latin(a) === latin(b));
  add("signs.receiver", "exact", expected.signs.receiver, got.signs.receiver);
  add("signs.issuer", "exact", expected.signs.issuer, got.signs.issuer);
  add("items.length", "exact", expected.items.length, got.items.length);
  expected.items.forEach((it, i) => {
    const g = got.items[i];
    add(`items.${i}.code`, "exact", it.code, g?.code);
    add(`items.${i}.wh`, "exact", it.wh, g?.wh);
    add(`items.${i}.qty`, "exact", it.qty, g?.qty);
    add(`items.${i}.price`, "exact", it.price, g?.price);
    add(`items.${i}.amount`, "exact", it.amount, g?.amount);
    tri(`items.${i}.desc`, it.desc, g?.desc);
    tri(`items.${i}.unit`, it.unit, g?.unit);
  });

  // Text as printed
  tri("docTitle", expected.docTitle, got.docTitle);
  tri("seller.name", expected.seller.name, got.seller.name);
  tri("seller.address", expected.seller.address, got.seller.address);
  tri("customer.name", expected.customer.name, got.customer.name);
  tri("customer.branch", expected.customer.branch, got.customer.branch);
  tri("customer.address", expected.customer.address, got.customer.address);
  tri("term", expected.term, got.term);
  tri("sales.name", expected.sales.name, got.sales.name);
  tri("sales.area", expected.sales.area, got.sales.area);
  tri("delivery.note", expected.delivery.note, got.delivery.note);
  tri("delivery.place", expected.delivery.place, got.delivery.place);
  tri("delivery.person", expected.delivery.person, got.delivery.person);
  tri("signs.deliverer", expected.signs.deliverer, got.signs.deliverer);

  const score = {} as EvalReport["score"];
  for (const g of ["exact", "thai", "english", "all"] as const) {
    const list = g === "all" ? fields : fields.filter((f) => f.group === g);
    score[g] = { ok: list.filter((f) => f.ok).length, total: list.length };
  }
  return { fields, score };
}
