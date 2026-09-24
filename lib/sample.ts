// The hand-checked PANFOOD sample (docs/reference/sample-document.json) as a LedgerDoc.
// The reference JSON predates the seller's head office / branch field; the paper prints
// "สำนักงานใหญ่" (Head office), so it is added here. The reference file itself stays unchanged.

import sample from "@/docs/reference/sample-document.json";
import { normalize } from "./normalize";
import type { LedgerDoc } from "./types";

export function sampleDoc(): LedgerDoc {
  const d = normalize(structuredClone(sample));
  d.seller.branch = { th: "สำนักงานใหญ่", en: "Head office", ja: "本社" };
  return d;
}
