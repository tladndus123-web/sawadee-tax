// A payslip as one LINE message (owner, 2026-10-13): the same figures as the printed ใบแจ้งเงินเดือน, in Thai with
// English beside — or, sent by LINE, in the employee's phone language. Pure: the API route feeds it the saved lines and pushes the text.

import type { LineLang } from "./line-lang";
import { dmy } from "./thai-tax";

export interface SlipHalf {
  gross: number;
  ssEmployee: number;
  wht: number;
  otherDeduction: number;
  net: number;
  paidOn: string;
}

export interface SlipInput {
  company: string;
  employee: string;
  /** YYYY-MM */
  month: string;
  payType: "monthly" | "daily";
  rate: number;
  first: SlipHalf | null;
  second: SlipHalf | null;
}

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const add = (a: number, b: number) => Math.round((a + b) * 100) / 100;
const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

/** The month as the slip prints it: ตุลาคม 2569 */
export const thaiMonth = (ym: string) => `${TH_MONTHS[Number(ym.slice(5, 7)) - 1]} ${Number(ym.slice(0, 4)) + 543}`;

type Labels = Record<"title" | "name" | "salary" | "dayRate" | "gross" | "ss" | "tax" | "other" | "net" | "paid" | "monthNet", string>;

/** Thai with English beside (the printed slip); or one language, the employee's phone language (2026-10-26) */
const LABELS: Record<"both" | LineLang, Labels> = {
  both: {
    title: "ใบแจ้งเงินเดือน / Payslip", name: "ชื่อ / Name", salary: "เงินเดือน / Salary", dayRate: "ค่าจ้างรายวัน / Day rate", gross: "รวมเงินได้ / Gross",
    ss: "ประกันสังคม / Social security", tax: "ภาษีหัก ณ ที่จ่าย / Tax", other: "หักอื่น ๆ / Other", net: "เงินได้สุทธิ / Net", paid: "จ่ายวันที่ / Paid", monthNet: "รวมสุทธิทั้งเดือน / Month net",
  },
  th: {
    title: "ใบแจ้งเงินเดือน", name: "ชื่อ", salary: "เงินเดือน", dayRate: "ค่าจ้างรายวัน", gross: "รวมเงินได้", ss: "ประกันสังคม", tax: "ภาษีหัก ณ ที่จ่าย",
    other: "หักอื่น ๆ", net: "เงินได้สุทธิ", paid: "จ่ายวันที่", monthNet: "รวมสุทธิทั้งเดือน",
  },
  en: {
    title: "Payslip", name: "Name", salary: "Salary", dayRate: "Day rate", gross: "Gross", ss: "Social security", tax: "Tax", other: "Other",
    net: "Net", paid: "Paid", monthNet: "Month net",
  },
  ja: {
    title: "給与明細", name: "氏名", salary: "月給", dayRate: "日給", gross: "総支給額", ss: "社会保険", tax: "源泉徴収税", other: "その他控除",
    net: "差引支給額", paid: "支払日", monthNet: "今月の手取り合計",
  },
  ko: {
    title: "급여명세서", name: "이름", salary: "월급", dayRate: "일당", gross: "총 지급액", ss: "사회보험", tax: "원천징수세", other: "기타 공제",
    net: "실수령액", paid: "지급일", monthNet: "이번 달 실수령 합계",
  },
};

const monthLabel = (ym: string, lang: "both" | LineLang) => {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  if (lang === "ja") return `${y}年${m}月`;
  if (lang === "ko") return `${y}년 ${m}월`;
  if (lang === "en") return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return thaiMonth(ym);
};

/** The slip as one message; without a language, Thai with English beside */
export function payslipText(s: SlipInput, lang?: LineLang): string {
  const L = LABELS[lang ?? "both"];
  const lastDay = new Date(Date.UTC(Number(s.month.slice(0, 4)), Number(s.month.slice(5, 7)), 0)).getUTCDate();
  const lines: string[] = [];
  lines.push(`${L.title} · ${monthLabel(s.month, lang ?? "both")}`);
  if (s.company) lines.push(s.company);
  lines.push(`${L.name}: ${s.employee}`);
  lines.push(`${s.payType === "monthly" ? L.salary : L.dayRate}: ${fmt(s.rate)}`);
  const half = (label: string, h: SlipHalf | null) => {
    if (!h || (!h.gross && !h.net)) return;
    lines.push("");
    lines.push(`▪ ${label}`);
    lines.push(`${L.gross}: ${fmt(h.gross)}`);
    if (h.ssEmployee) lines.push(`${L.ss}: -${fmt(h.ssEmployee)}`);
    if (h.wht) lines.push(`${L.tax}: -${fmt(h.wht)}`);
    if (h.otherDeduction) lines.push(`${L.other}: -${fmt(h.otherDeduction)}`);
    lines.push(`${L.net}: ${fmt(h.net)}`);
    if (h.paidOn) lines.push(`${L.paid}: ${dmy(h.paidOn)}`);
  };
  half("1–15", s.first);
  half(`16–${lastDay}`, s.second);
  const total = add(s.first?.net ?? 0, s.second?.net ?? 0);
  lines.push("");
  lines.push(`${L.monthNet}: ฿${fmt(total)}`);
  return lines.join("\n");
}
