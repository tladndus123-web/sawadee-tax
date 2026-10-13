// A payslip as one LINE message (owner, 2026-10-13): the same figures as the printed ใบแจ้งเงินเดือน, in Thai with
// English beside, for the employee's phone. Pure: the API route feeds it the saved lines and pushes the text.

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

export function payslipText(s: SlipInput): string {
  const lastDay = new Date(Date.UTC(Number(s.month.slice(0, 4)), Number(s.month.slice(5, 7)), 0)).getUTCDate();
  const lines: string[] = [];
  lines.push(`ใบแจ้งเงินเดือน / Payslip · ${thaiMonth(s.month)}`);
  if (s.company) lines.push(s.company);
  lines.push(`ชื่อ / Name: ${s.employee}`);
  lines.push(`${s.payType === "monthly" ? "เงินเดือน / Salary" : "ค่าจ้างรายวัน / Day rate"}: ${fmt(s.rate)}`);
  const half = (label: string, h: SlipHalf | null) => {
    if (!h || (!h.gross && !h.net)) return;
    lines.push("");
    lines.push(`▪ ${label}`);
    lines.push(`รวมเงินได้ / Gross: ${fmt(h.gross)}`);
    if (h.ssEmployee) lines.push(`ประกันสังคม / Social security: -${fmt(h.ssEmployee)}`);
    if (h.wht) lines.push(`ภาษีหัก ณ ที่จ่าย / Tax: -${fmt(h.wht)}`);
    if (h.otherDeduction) lines.push(`หักอื่น ๆ / Other: -${fmt(h.otherDeduction)}`);
    lines.push(`เงินได้สุทธิ / Net: ${fmt(h.net)}`);
    if (h.paidOn) lines.push(`จ่ายวันที่ / Paid: ${dmy(h.paidOn)}`);
  };
  half("1–15", s.first);
  half(`16–${lastDay}`, s.second);
  const total = add(s.first?.net ?? 0, s.second?.net ?? 0);
  lines.push("");
  lines.push(`รวมสุทธิทั้งเดือน / Month net: ฿${fmt(total)}`);
  return lines.join("\n");
}
