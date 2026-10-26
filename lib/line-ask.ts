// "Ask the bot" (owner, 2026-10-26): the LINE menu at the bottom of the chat, or a short word, brings the ledger's
// own numbers — this month, bills to pay this week, the VAT return, yesterday's sales, the month's Excel file.
// Admins only (company money). No database access here: the server part is lib/line-ask-server.ts.
// Like every bot text: Thai and Japanese, as two messages (LANG_SPLIT).

import { LANG_SPLIT } from "./line";
import { baht } from "./money";
import { dmy } from "./thai-tax";

export const ASKS = ["summary", "due", "vat", "sales", "excel"] as const;
export type Ask = (typeof ASKS)[number];

/** Postback data of the menu buttons: "ask=summary" … */
export const askData = (a: Ask) => `ask=${a}`;
export function askFromData(data: string): Ask | null {
  const v = new URLSearchParams(data).get("ask");
  return (ASKS as readonly string[]).includes(v ?? "") ? (v as Ask) : null;
}

// Words people type instead of tapping (Korean, Japanese, Thai, English). Only short messages count, so ordinary
// chat in the room never sets the bot off.
const WORDS: Record<Ask, string[]> = {
  summary: ["요약", "이번달", "まとめ", "今月", "サマリー", "สรุป", "เดือนนี้", "summary"],
  due: ["낼돈", "지급", "갚을", "支払", "払う", "ต้องจ่าย", "ค้างจ่าย", "จ่ายเงิน", "due", "bills", "pay"],
  vat: ["부가세", "vat", "消費税", "付加価値税", "ภพ30", "ภาษีมูลค่าเพิ่ม", "ภาษีซื้อ"],
  sales: ["매출", "売上", "ยอดขาย", "sales"],
  excel: ["엑셀", "excel", "エクセル", "xlsx", "เอ็กเซล"],
};
const MAX_ASK_LENGTH = 16;

/** A short message asking for one of the answers, or null (anything else stays unanswered, as before) */
export function askFromText(text: string): Ask | null {
  // Emoji, spaces and punctuation out; "ภ.พ.30" → "ภพ30"
  const t = text.toLowerCase().replace(/[\s.·・、。!?！？]|\p{Extended_Pictographic}|️/gu, "");
  if (!t || t.length > MAX_ASK_LENGTH) return null;
  for (const a of ASKS) if (WORDS[a].some((w) => t.includes(w))) return a;
  return null;
}

const both = (thai: string, japanese: string) => `${thai}${LANG_SPLIT}${japanese}`;
const thMonth = (m: string) => `${m.slice(5, 7)}/${Number(m.slice(0, 4)) + 543}`;
const jaMonth = (m: string) => `${m.slice(0, 4)}年${Number(m.slice(5, 7))}月`;
const line = (...parts: (string | false | null | undefined)[]) => parts.filter((p) => p !== false && p != null).join("\n");

export const askSay = {
  adminOnly: both("ข้อมูลนี้ดูได้เฉพาะผู้ดูแลระบบ", "この情報は管理者だけが見られます。"),
  busy: both("กำลังทำไฟล์อยู่ กรุณารอสักครู่", "ファイルを作成中です。少々お待ちください。"),
};

export interface MonthSummary {
  month: string;
  count: number;
  /** Purchases (net) of the month */
  total: number;
  claimableVat: number;
  toCheck: number;
  /** Sales (gross) of the month; null = the company keeps no sales */
  sales: number | null;
  unpaid: number;
  unpaidCount: number;
  overdueCount: number;
}

export function summaryText(s: MonthSummary, url: string): string {
  return both(
    line(
      `📊 สรุปเดือน ${thMonth(s.month)}`,
      "",
      `ยอดซื้อ ${baht(s.total)} (${s.count} ใบ)`,
      `VAT ซื้อที่ขอคืนได้ ${baht(s.claimableVat)}`,
      s.sales !== null && `ยอดขาย ${baht(s.sales)}`,
      s.toCheck > 0 && `⚠️ รอตรวจ ${s.toCheck} ใบ`,
      s.unpaidCount > 0 && `ค้างจ่าย ${s.unpaidCount} ใบ ${baht(s.unpaid)}${s.overdueCount ? ` (เลยกำหนด ${s.overdueCount})` : ""}`,
      "",
      url,
    ),
    line(
      `📊 ${jaMonth(s.month)}のまとめ`,
      "",
      `仕入 ${baht(s.total)}（${s.count}件）`,
      `控除できる仕入VAT ${baht(s.claimableVat)}`,
      s.sales !== null && `売上 ${baht(s.sales)}`,
      s.toCheck > 0 && `⚠️ 要確認 ${s.toCheck}件`,
      s.unpaidCount > 0 && `未払い ${s.unpaidCount}件 ${baht(s.unpaid)}${s.overdueCount ? `（期限切れ ${s.overdueCount}件）` : ""}`,
      "",
      url,
    ),
  );
}

export interface DueBill {
  vendorTh: string;
  vendorJa: string;
  amount: number;
  /** YYYY-MM-DD */
  due: string;
  /** Negative = overdue */
  days: number;
}

/** At most this many bills are listed; the rest are counted */
export const DUE_LIST_MAX = 10;

export function dueText(bills: DueBill[], url: string): string {
  if (!bills.length) return both(`💸 ไม่มีบิลที่ต้องจ่ายภายใน 7 วัน\n\n${url}`, `💸 7日以内に支払う請求書はありません。\n\n${url}`);
  const total = bills.reduce((a, b) => a + Math.round(b.amount * 100), 0) / 100;
  const shown = bills.slice(0, DUE_LIST_MAX);
  const more = bills.length - shown.length;
  const th = (d: number) => (d < 0 ? `เลยกำหนด ${-d} วัน` : d === 0 ? "วันนี้" : `อีก ${d} วัน`);
  const ja = (d: number) => (d < 0 ? `${-d}日超過` : d === 0 ? "今日" : `あと${d}日`);
  return both(
    line(
      `💸 ต้องจ่ายภายใน 7 วัน: ${bills.length} ใบ ${baht(total)}`,
      "",
      ...shown.map((b) => `• ${b.vendorTh || b.vendorJa} ${baht(b.amount)} — ${dmy(b.due)} (${th(b.days)})`),
      more > 0 && `และอีก ${more} ใบ`,
      "",
      url,
    ),
    line(
      `💸 7日以内の支払い：${bills.length}件 ${baht(total)}`,
      "",
      ...shown.map((b) => `• ${b.vendorJa || b.vendorTh} ${baht(b.amount)} — ${dmy(b.due)}（${ja(b.days)}）`),
      more > 0 && `ほか${more}件`,
      "",
      url,
    ),
  );
}

export interface VatAnswer {
  month: string;
  due: string;
  daysLeft: number;
  onlineOnly: boolean;
  claimableVat: number;
  /** Output VAT on the month's sales; null = the company keeps no sales */
  salesVat: number | null;
  toCheck: number;
  drafts: number;
}

export function vatText(v: VatAnswer, url: string): string {
  const net = v.salesVat === null ? null : Math.round(v.salesVat * 100 - v.claimableVat * 100) / 100;
  return both(
    line(
      `🧾 ภ.พ.30 เดือน ${thMonth(v.month)}`,
      `ยื่นภายใน ${dmy(v.due)}${v.onlineOnly ? " (ยื่นออนไลน์)" : ""} · อีก ${v.daysLeft} วัน`,
      "",
      v.salesVat !== null && `ภาษีขาย ${baht(v.salesVat)}`,
      `ภาษีซื้อที่ขอคืนได้ ${baht(v.claimableVat)}`,
      net !== null && (net >= 0 ? `ต้องชำระประมาณ ${baht(net)}` : `ขอคืน/ยกไปประมาณ ${baht(-net)}`),
      v.toCheck > 0 && `⚠️ รอตรวจ ${v.toCheck} ใบ`,
      v.drafts > 0 && `ฉบับร่าง ${v.drafts} ใบ (ยังไม่นับ)`,
      "",
      url,
    ),
    line(
      `🧾 ${jaMonth(v.month)}分 VAT申告（ภ.พ.30）`,
      `期限 ${dmy(v.due)}${v.onlineOnly ? "（オンライン申告）" : ""} · あと${v.daysLeft}日`,
      "",
      v.salesVat !== null && `売上VAT ${baht(v.salesVat)}`,
      `控除できる仕入VAT ${baht(v.claimableVat)}`,
      net !== null && (net >= 0 ? `納付見込み ${baht(net)}` : `還付・繰越見込み ${baht(-net)}`),
      v.toCheck > 0 && `⚠️ 要確認 ${v.toCheck}件`,
      v.drafts > 0 && `下書き ${v.drafts}件（未集計）`,
      "",
      url,
    ),
  );
}

export interface DaySales {
  date: string;
  branches: { th: string; ja: string; gross: number; bills: number }[];
}

export function salesText(s: DaySales, url: string): string {
  if (!s.branches.length)
    return both(`📈 ยังไม่มียอดขายของวันที่ ${dmy(s.date)}\n\n${url}`, `📈 ${dmy(s.date)}の売上はまだ入っていません。\n\n${url}`);
  const total = s.branches.reduce((a, b) => a + Math.round(b.gross * 100), 0) / 100;
  const bills = s.branches.reduce((a, b) => a + b.bills, 0);
  const several = s.branches.length > 1;
  return both(
    line(
      `📈 ยอดขายวันที่ ${dmy(s.date)}: ${baht(total)}${bills ? ` (${bills} บิล)` : ""}`,
      ...(several ? ["", ...s.branches.map((b) => `• ${b.th} ${baht(b.gross)}`)] : []),
      "",
      url,
    ),
    line(
      `📈 ${dmy(s.date)}の売上：${baht(total)}${bills ? `（${bills}件）` : ""}`,
      ...(several ? ["", ...s.branches.map((b) => `• ${b.ja} ${baht(b.gross)}`)] : []),
      "",
      url,
    ),
  );
}

export interface ExcelLink {
  month: string;
  count: number;
  url: string;
}

/** The link works for an hour */
export const EXCEL_LINK_SECONDS = 3600;

export function excelText(files: ExcelLink[]): string {
  return both(
    line("📎 ไฟล์ Excel บัญชีซื้อ (ลิงก์ใช้ได้ 1 ชั่วโมง)", ...files.flatMap((f) => ["", `เดือน ${thMonth(f.month)} · ${f.count} ใบ`, f.url])),
    line("📎 仕入帳のExcel（リンクの有効期限は1時間）", ...files.flatMap((f) => ["", `${jaMonth(f.month)} · ${f.count}件`, f.url])),
  );
}
