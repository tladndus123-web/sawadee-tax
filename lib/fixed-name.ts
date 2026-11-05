// A fixed cost's name as typed is data (owner typed 家賃 / 水道光熱費 in Japanese). When the name is only the generic
// word for its kind — in any of the four languages — it is shown as that kind in the reader's language instead
// (KO: 임대료, 전기·수도·통신), so a Korean screen never shows Japanese words. Any other name is shown as typed.

import type { Category } from "./types";

const GENERIC: Partial<Record<Category, readonly string[]>> = {
  rent: ["家賃", "地代家賃", "賃料", "地代", "店舗家賃", "rent", "shoprent", "officerent", "ค่าเช่า", "ค่าเช่าร้าน", "ค่าเช่าที่", "임대료", "월세", "집세", "가게월세"],
  utilities: [
    "水道光熱費", "水道光熱通信費", "光熱費", "電気代", "水道代", "電気水道", "utilities", "utility", "electricityandwater",
    "ค่าน้ำค่าไฟ", "ค่าน้ำไฟ", "ค่าสาธารณูปโภค", "ค่าน้ำไฟโทรศัพท์", "수도광열비", "공과금", "전기수도", "전기수도통신",
  ],
};

const norm = (v: string) => v.normalize("NFKC").toLowerCase().replace(/[\s·・,、.\-–—/&+()（）]|and/g, "");

/** Is this name just the generic word for its kind? */
export function isGenericName(category: Category, name: string): boolean {
  const n = norm(name);
  return !!n && (GENERIC[category] ?? []).some((w) => norm(w) === n);
}

/** The name to show: the kind in the reader's language for a generic name, else the name as typed */
export function fixedDisplayName(line: { category: Category; name: string }, label: (c: Category) => string): string {
  return isGenericName(line.category, line.name) ? label(line.category) : line.name;
}
