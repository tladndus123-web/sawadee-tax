// Shape of the AI reading (step 6). Mirrors docs/reference/extract-prompt.txt: every field present,
// "not printed" totals as null, field boxes as a list of {path, box}.
// Not sent as a structured-output schema: with ~60 fields (20 of them th/en/ja objects) the API rejects it
// ("compiled grammar is too large"). The prompt asks for this JSON; replies are checked against this schema
// and then cleaned by normalize(), which tolerates missing or loosely typed fields.

import { z } from "zod";
import { CATEGORIES, CONFIDENCES, COPY_KINDS, DOC_TYPES, PAYMENTS } from "./types";

const tri = z.object({ th: z.string(), en: z.string(), ja: z.string() });
const amount = z.number().nullable();

export const extractSchema = z.object({
  notDocument: z.boolean(),
  docType: z.enum(DOC_TYPES),
  docTitle: tri,
  copyKind: z.enum(COPY_KINDS),
  formSerial: z.string(),
  docNo: z.string(),
  date: z.string(),
  dateWasBuddhist: z.boolean(),
  seller: z.object({
    name: tri,
    taxId: z.string(),
    branchCode: z.string(),
    address: tri,
    branch: tri,
    tel: z.string(),
    fax: z.string(),
    saleOffice: z.string(),
  }),
  customer: z.object({ code: z.string(), name: tri, taxId: z.string(), branch: tri, address: tri }),
  orderNo: z.string(),
  term: tri,
  creditDays: z.number(),
  dueDate: z.string(),
  sales: z.object({ name: tri, area: tri, ref: z.string() }),
  items: z.array(
    z.object({ code: z.string(), desc: tri, wh: z.string(), qty: z.number(), unit: tri, price: z.number(), amount: z.number() }),
  ),
  delivery: z.object({ note: tri, place: tri, contact: z.string(), person: tri }),
  totals: z.object({
    total: amount,
    discount: amount,
    afterDisc: amount,
    deposit: amount,
    afterDep: amount,
    exempt: amount,
    taxable: amount,
    vat: amount,
    net: amount,
    wht: amount,
  }),
  wordsPrinted: z.string(),
  words: tri,
  terms: z.array(tri),
  signs: z.object({ receiver: z.boolean(), issuer: z.boolean(), deliverer: tri.nullable() }),
  formCode: z.string(),
  formSince: z.string(),
  category: z.enum(CATEGORIES),
  payment: z.enum(PAYMENTS),
  confidence: z.enum(CONFIDENCES),
  unclear: z.array(z.string()),
  note: tri,
  fieldBoxes: z.array(z.object({ path: z.string(), box: z.array(z.number()) })),
});

/** Photos read in one batch; each is its own request */
export const MAX_PHOTOS = 5;

/** Error codes /api/extract returns; the upload screen turns them into friendly sentences */
export type ExtractErrorCode = "rate" | "notDoc" | "badImage" | "aiFail" | "busy" | "noKey";

/** Added to the prototype prompt: the photo positions used to zoom into unclear fields. */
export const FIELD_BOX_RULE = `- fieldBoxes: for each field you could locate on the photo (always include every path listed in "unclear"), give {"path": "<field path>", "box": [x, y, w, h]} where x, y are the top-left corner and w, h the size, all as fractions 0-1 of the image width and height. Omit fields you cannot locate.
- If the image is not a receipt or invoice, set notDocument true and leave every other field empty.
- The "seller" object MUST also contain "branch": {"th":"","en":"","ja":""} — the seller's head office or branch as printed near the seller's address or tax ID ("สำนักงานใหญ่" / "Head office" / "本社", or "สาขาที่ 00001" / "Branch 00001" / "支店 00001" with the 5-digit number). Put it there even when the same words also appear in the address; empty strings only if nothing is printed.
- docTitle: only the document's name (e.g. "ใบกำกับภาษี/ใบส่งของ/ใบแจ้งหนี้"). Do not include "ต้นฉบับ"/"สำเนา"/"Original"/"Copy" — that belongs in copyKind.
Reply with the single JSON object only (including "fieldBoxes"), no prose and no code fences.`;

/** The JSON object in a text reply (tolerates ```json fences or a stray sentence around it). */
export function parseReply(text: string): Record<string, unknown> | null {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    const v: unknown = JSON.parse(text.slice(a, b + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** AI reading → the loose object normalize() expects (fieldBoxes list back to a path → box record). */
export function extractedToRaw(x: Record<string, unknown>): Record<string, unknown> {
  // notDocument stays in; normalize() only picks the fields it knows
  const { fieldBoxes, ...rest } = x;
  const boxes: Record<string, unknown> = {};
  if (Array.isArray(fieldBoxes)) {
    for (const f of fieldBoxes as { path?: unknown; box?: unknown }[]) {
      if (typeof f?.path === "string" && Array.isArray(f.box) && f.box.length === 4) boxes[f.path] = f.box;
    }
  } else if (fieldBoxes && typeof fieldBoxes === "object") Object.assign(boxes, fieldBoxes);
  return { ...rest, fieldBoxes: boxes };
}
