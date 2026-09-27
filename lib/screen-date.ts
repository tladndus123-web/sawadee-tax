// Dates on the app's own screens follow the reader: Japanese readers get 2026/09/27（日）, everyone else the Thai
// day/month/year the documents use. Thai forms (the invoice copy, reports, 50 ทวิ) always keep dmy().

import { dmy } from "./thai-tax";

const JA_WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

export function screenDate(locale: string, iso: string | null | undefined): string {
  if (!iso) return "—";
  if (locale !== "ja") return dmy(iso);
  const [y, m, d] = iso.split("-");
  const day = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).getUTCDay();
  return `${y}/${m}/${d}（${JA_WEEKDAY[day]}）`;
}
