// Thai amount-in-words (ported from the prototype's thaiInt / bahtText)

import { baht } from "./money";
import type { Tri } from "./types";

const DIGITS = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/** Non-negative integer → Thai words without unit. 0 → "". */
export function thaiInt(n: number | string): string {
  let s = String(n).replace(/^0+/, "");
  if (!s) return "";
  // Split into 6-digit groups joined by ล้าน
  const groups: string[] = [];
  while (s.length > 6) {
    groups.unshift(s.slice(-6));
    s = s.slice(0, -6);
  }
  groups.unshift(s);

  let out = "";
  groups.forEach((grp, gi) => {
    const gs = grp.replace(/^0+/, "");
    const higher = out !== "";
    for (let i = 0; i < gs.length; i++) {
      const x = Number(gs[i]);
      const pos = gs.length - 1 - i;
      if (!x) continue;
      if (pos === 1) out += x === 1 ? "สิบ" : x === 2 ? "ยี่สิบ" : DIGITS[x] + "สิบ";
      else if (pos === 0 && x === 1 && (gs.length > 1 || higher)) out += "เอ็ด";
      else out += DIGITS[x] + PLACES[pos];
    }
    if (gi < groups.length - 1) out += "ล้าน";
  });
  return out;
}

/** Baht amount → Thai words, e.g. 64200 → "หกหมื่นสี่พันสองร้อยบาทถ้วน" */
export function bahtText(value: number): string {
  const satang = Math.round((Number(value) || 0) * 100);
  const b = Math.floor(satang / 100);
  const s = satang % 100;
  if (!b && !s) return "ศูนย์บาทถ้วน";
  return (b ? thaiInt(b) + "บาท" : "") + (s ? thaiInt(s) + "สตางค์" : "ถ้วน");
}

/** Normalise printed words for comparison: drop spaces and brackets. */
export const cleanWords = (s: string): string => s.replace(/[\s()（）]/g, "");

/**
 * Amount-in-words band: Thai words as printed (or generated), English and Japanese as digits.
 * e.g. 64200 → { th: "หกหมื่นสี่พันสองร้อยบาทถ้วน", en: "฿ 64,200.00", ja: "฿ 64,200.00" }
 */
export function amountWords(net: number, thaiPrinted = ""): Tri {
  const digits = baht(net);
  return { th: thaiPrinted.trim() || bahtText(net), en: digits, ja: digits };
}
