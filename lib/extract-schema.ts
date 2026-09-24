// Shape of the AI reading (step 6). Mirrors docs/reference/extract-prompt.txt, written so it can be
// sent as a structured-output JSON schema: every field required, "not printed" expressed as null,
// and field boxes as a list (open-ended object keys are not allowed in structured outputs).

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
export type Extracted = z.infer<typeof extractSchema>;

/** Photos read in one batch; each is its own request */
export const MAX_PHOTOS = 5;

/** Error codes /api/extract returns; the upload screen turns them into friendly sentences */
export type ExtractErrorCode = "rate" | "notDoc" | "badImage" | "aiFail" | "busy" | "noKey";

/** Added to the prototype prompt: the photo positions used to zoom into unclear fields. */
export const FIELD_BOX_RULE = `- fieldBoxes: for each field you could locate on the photo (always include every path listed in "unclear"), give {"path": "<field path>", "box": [x, y, w, h]} where x, y are the top-left corner and w, h the size, all as fractions 0-1 of the image width and height. Omit fields you cannot locate.
- If the image is not a receipt or invoice, set notDocument true and leave every other field empty.`;

/** AI reading → the loose object normalize() expects (fieldBoxes back to a path → box record). */
export function extractedToRaw(x: Extracted): Record<string, unknown> {
  // notDocument stays in; normalize() only picks the fields it knows
  const { fieldBoxes, ...rest } = x;
  const boxes: Record<string, number[]> = {};
  for (const { path, box } of fieldBoxes) if (path && box.length === 4) boxes[path] = box;
  return { ...rest, fieldBoxes: boxes };
}
