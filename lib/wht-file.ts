// The ภ.ง.ด.53 / ภ.ง.ด.3 attachment list as a text file for the Revenue Department's RD Prep program ("โอนย้ายข้อมูล"):
// RD Prep reads it, the columns are matched once, and it saves the .rdx file that e-Filing takes as the attachment
// (owner, 2026-11-08). The text follows the Revenue Department's own rules for these files (รูปแบบข้อมูล FORMAT กลาง
// ภ.ง.ด.53 v2.0, 10/02/2568): UTF-8, fields split by "|" with none at the ends of a line, CR/LF line ends, amounts as
// 1234.00, dates as ddmmyyyy in the Buddhist year (here dd/mm/yyyy, which RD Prep asks for when the columns are
// matched), no * + / \ ! $ % # & @ , ' " in the text. One line per payment; the first line names the columns.

import { fromSatang, toSatang } from "./money";
import type { WhtRow } from "./wht";

/** Kind of income as the forms write it (Thai, the legal wording) */
export const WHT_TYPE_TH: Record<string, string> = {
  service: "ค่าบริการ",
  professional: "ค่าวิชาชีพอิสระ",
  contract: "ค่าจ้างทำของ",
  rent: "ค่าเช่า",
  advertising: "ค่าโฆษณา",
  transport: "ค่าขนส่ง",
  other: "อื่น ๆ",
  "": "ค่าบริการ",
};

/** Characters the Revenue Department does not allow in these files become spaces ("/" in "71/9" becomes "-") */
export const cleanText = (s: string): string =>
  s.replace(/\//g, "-").replace(/[*+\\!$%#&@,'"‘’“”|\r\n\t]/g, " ").replace(/\s+/g, " ").trim();

/** "2026-10-12" → "12/10/2569" (Buddhist year) */
export const thaiDate = (iso: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${Number(iso.slice(0, 4)) + 543}` : "");

const COMPANY_TITLES = ["ห้างหุ้นส่วนจำกัด", "ห้างหุ้นส่วนสามัญ", "บริษัทมหาชนจำกัด", "บริษัท", "หจก.", "บจก.", "บมจ.", "สหกรณ์", "มูลนิธิ", "สมาคม"];
const PERSON_TITLES = ["นางสาว", "น.ส.", "นาย", "นาง", "ด.ช.", "ด.ญ."];

/** "บริษัท แพนฟู้ด จำกัด" → title "บริษัท", name "แพนฟู้ด จำกัด"; "นายสมชาย ใจดี" → "นาย", "สมชาย", "ใจดี" (people only) */
export function splitName(full: string, form: "53" | "3"): { title: string; first: string; last: string } {
  const name = cleanText(full);
  const titles = form === "53" ? COMPANY_TITLES : PERSON_TITLES;
  const title = titles.find((t) => name.startsWith(t)) ?? "";
  const rest = name.slice(title.length).trim();
  if (form === "53") return { title: title || "บริษัท", first: rest || name, last: "" };
  const [first, ...last] = rest.split(" ");
  return { title, first: first ?? "", last: last.join(" ") };
}

const money = (n: number) => fromSatang(toSatang(n)).toFixed(2);

/** The lines of the file (header + one per payment) */
export function whtFileLines(rows: readonly WhtRow[], form: "53" | "3"): string[][] {
  const head =
    form === "53"
      ? ["ลำดับที่", "เลขประจำตัวผู้เสียภาษีอากร", "สาขาที่", "คำนำหน้าชื่อ", "ชื่อผู้มีเงินได้", "ที่อยู่", "รหัสไปรษณีย์", "วันเดือนปีที่จ่าย", "ประเภทเงินได้", "อัตราภาษี", "จำนวนเงินที่จ่าย", "จำนวนเงินภาษีที่หัก", "เงื่อนไข"]
      : ["ลำดับที่", "เลขประจำตัวผู้เสียภาษีอากร", "สาขาที่", "คำนำหน้าชื่อ", "ชื่อ", "ชื่อสกุล", "ที่อยู่", "รหัสไปรษณีย์", "วันเดือนปีที่จ่าย", "ประเภทเงินได้", "อัตราภาษี", "จำนวนเงินที่จ่าย", "จำนวนเงินภาษีที่หัก", "เงื่อนไข"];
  const lines = rows.map((r, i) => {
    const full = r.name.th || r.name.en || r.name.ja;
    const n = splitName(full, form);
    const address = cleanText(r.address.th || r.address.en || r.address.ja);
    const postal = [...address.matchAll(/(?<!\d)\d{5}(?!\d)/g)].pop()?.[0] ?? "";
    const pay = [thaiDate(r.paidDate), WHT_TYPE_TH[r.type] ?? WHT_TYPE_TH[""], money(r.rate), money(r.paid), money(r.tax), "1"];
    const who = form === "53" ? [n.title, n.first] : [n.title, n.first, n.last];
    return [String(i + 1), r.taxId, r.branchNo || "00000", ...who, address, postal, ...pay];
  });
  return [head, ...lines];
}

/** The file's text: "|" between fields, CR/LF after every line */
export const whtFileText = (rows: readonly WhtRow[], form: "53" | "3"): string => whtFileLines(rows, form).map((l) => l.join("|")).join("\r\n") + "\r\n";

/** File name in the Revenue Department's pattern: PND53_<tax id>_<branch>_<Buddhist year>_<month>_00_00.txt */
export function whtFileName(form: "53" | "3", companyTaxId: string, month: string, branchNo = "000000"): string {
  const id = companyTaxId.replace(/\D/g, "") || "0000000000000";
  return `PND${form}_${id}_${branchNo.padStart(6, "0")}_${Number(month.slice(0, 4)) + 543}_${month.slice(5, 7)}_00_00.txt`;
}
