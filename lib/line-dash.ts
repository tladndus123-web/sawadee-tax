// The bot's dashboard cards (owner, 2026-10-26): the answers to the menu buttons and the weekly AI report, as LINE
// Flex bubbles in the colours of the owner's menu pictures (deep navy, blue, lime), in the reader's language.
// Pure: the numbers come from lib/line-ask-server.ts and lib/weekly-report-server.ts.

import type { messagingApi } from "@line/bot-sdk";
import type { LineLang } from "./line-lang";
import { baht } from "./money";
import { dmy } from "./thai-tax";
import type { Tri } from "./types";

type Box = messagingApi.FlexBox;
type Comp = messagingApi.FlexComponent;

const C = { bg: "#0d121c", card: "#1a2030", line: "#262e40", blue: "#3d6bff", lime: "#d4ff3f", orange: "#ff8a3d", muted: "#8f9bb3", soft: "#b9c2d6", onBlue: "#c9d6ff", barBack: "#7d9bff", white: "#ffffff", warnBg: "#3a2414" };

const txt = (text: string, o: Partial<messagingApi.FlexText> = {}): messagingApi.FlexText => ({ type: "text", text: text || " ", wrap: true, color: C.white, size: "sm", ...o });

// ── Words ─────────────────────────────────────────────────────────────────────────────────────────────────────────

interface Words {
  summary: string; month: (m: string) => string; asOf: string; sales: string; purchases: (n: number) => string; claimable: string;
  unpaid: (n: number) => string; overdue: (n: number) => string; toCheck: (n: number) => string; ofTarget: (p: number) => string;
  target: string; ofLastMonth: (p: number) => string; lastMonth: string; details: string; due: string; dueTitle: (n: number) => string;
  noneDue: string; daysOver: (d: number) => string; today: string; daysLeft: (d: number) => string; more: (n: number) => string;
  vat: string; vatTitle: (m: string) => string; deadline: string; online: string; salesVat: string; toPay: string; refund: string; drafts: (n: number) => string;
  yesterday: string; noSales: (d: string) => string; bills: (n: number) => string; excel: string; excelTitle: string; validHour: string;
  docs: (n: number) => string; download: string; weekly: string; weeklyTitle: string; monthNow: (m: string) => string;
  weekSales: string; vsLastWeek: (p: number) => string; foodCost: string; vsLastMonthPt: (p: number) => string; monthPurchases: string;
  receipts: (n: number) => string; vatEstimate: string; excelButton: string; fileBy: (d: string) => string; tips: string; openDash: string; branches: (n: number) => string;
}

const sign = (n: number) => (n >= 0 ? "▲" : "▼");
const pct = (n: number) => `${Math.abs(Math.round(n))}%`;
const thM = (m: string) => `${m.slice(5, 7)}/${Number(m.slice(0, 4)) + 543}`;
const enM = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

const W: Record<LineLang, Words> = {
  ko: {
    summary: "MONTHLY", month: (m) => `${Number(m.slice(5, 7))}월 요약`, asOf: "기준", sales: "매출", purchases: (n) => `매입 (${n}장)`, claimable: "공제받을 부가세",
    unpaid: (n) => `미지급 ${n}건`, overdue: (n) => `기한 지남 ${n}건`, toCheck: (n) => `⚠️ 확인이 필요한 영수증 ${n}장`, ofTarget: (p) => `목표의 ${p}%`,
    target: "목표", ofLastMonth: (p) => `지난달 전체의 ${p}%`, lastMonth: "지난달", details: "자세히 보기", due: "WEEK", dueTitle: (n) => `이번 주 낼 돈 ${n}건`,
    noneDue: "7일 안에 낼 돈이 없어요", daysOver: (d) => `${d}일 지남`, today: "오늘", daysLeft: (d) => `${d}일 남음`, more: (n) => `외 ${n}건`,
    vat: "VAT", vatTitle: (m) => `${Number(m.slice(5, 7))}월분 부가세 신고`, deadline: "신고 기한", online: "온라인 신고", salesVat: "매출 부가세", toPay: "낼 부가세 (예상)",
    refund: "돌려받거나 넘길 부가세 (예상)", drafts: (n) => `임시저장 ${n}건은 아직 안 들어갔어요`, yesterday: "SALES", noSales: (d) => `${d} 매출이 아직 없어요`,
    bills: (n) => `${n}건`, excel: "EXCEL", excelTitle: "매입 장부 엑셀", validHour: "링크는 1시간 동안 열려요", docs: (n) => `${n}장`, download: "받기",
    weekly: "WEEKLY", weeklyTitle: "이번 주 AI 비서 리포트", monthNow: (m) => `MONTHLY · ${Number(m.slice(5, 7))}월 현황`, weekSales: "이번 주 매출",
    vsLastWeek: (p) => `${sign(p)} ${pct(p)} 지난주보다`, foodCost: "원가율 (식재료)", vsLastMonthPt: (p) => `${sign(p)} ${Math.abs(p).toFixed(1)}%p 지난달보다`,
    monthPurchases: "이번 달 매입", receipts: (n) => `영수증 ${n}장`, vatEstimate: "예상 부가세", excelButton: "엑셀 받기", fileBy: (d) => `${d}까지 신고`, tips: "이번 주 운영 방안",
    openDash: "대시보드 열기", branches: (n) => `지점 ${n}곳`,
  },
  ja: {
    summary: "MONTHLY", month: (m) => `${Number(m.slice(5, 7))}月のまとめ`, asOf: "時点", sales: "売上", purchases: (n) => `仕入（${n}件）`, claimable: "控除できるVAT",
    unpaid: (n) => `未払い ${n}件`, overdue: (n) => `期限切れ ${n}件`, toCheck: (n) => `⚠️ 確認が必要な領収書 ${n}件`, ofTarget: (p) => `目標の${p}%`,
    target: "目標", ofLastMonth: (p) => `先月全体の${p}%`, lastMonth: "先月", details: "詳しく見る", due: "WEEK", dueTitle: (n) => `今週の支払い ${n}件`,
    noneDue: "7日以内の支払いはありません", daysOver: (d) => `${d}日超過`, today: "今日", daysLeft: (d) => `あと${d}日`, more: (n) => `ほか${n}件`,
    vat: "VAT", vatTitle: (m) => `${Number(m.slice(5, 7))}月分 VAT申告`, deadline: "申告期限", online: "オンライン申告", salesVat: "売上VAT", toPay: "納付見込み",
    refund: "還付・繰越見込み", drafts: (n) => `下書き${n}件は未集計です`, yesterday: "SALES", noSales: (d) => `${d}の売上はまだありません`,
    bills: (n) => `${n}件`, excel: "EXCEL", excelTitle: "仕入帳のExcel", validHour: "リンクの有効期限は1時間です", docs: (n) => `${n}件`, download: "ダウンロード",
    weekly: "WEEKLY", weeklyTitle: "今週のAI秘書レポート", monthNow: (m) => `MONTHLY · ${Number(m.slice(5, 7))}月の状況`, weekSales: "今週の売上",
    vsLastWeek: (p) => `${sign(p)} 先週比 ${pct(p)}`, foodCost: "原価率（食材）", vsLastMonthPt: (p) => `${sign(p)} 先月比 ${Math.abs(p).toFixed(1)}pt`,
    monthPurchases: "今月の仕入", receipts: (n) => `領収書 ${n}件`, vatEstimate: "VAT見込み", excelButton: "Excel出力", fileBy: (d) => `${d}までに申告`, tips: "今週の運営アドバイス",
    openDash: "ダッシュボードを開く", branches: (n) => `${n}店舗`,
  },
  th: {
    summary: "MONTHLY", month: (m) => `สรุปเดือน ${thM(m)}`, asOf: "ข้อมูล ณ", sales: "ยอดขาย", purchases: (n) => `ยอดซื้อ (${n} ใบ)`, claimable: "VAT ซื้อที่ขอคืนได้",
    unpaid: (n) => `ค้างจ่าย ${n} ใบ`, overdue: (n) => `เลยกำหนด ${n} ใบ`, toCheck: (n) => `⚠️ ใบเสร็จที่ต้องตรวจ ${n} ใบ`, ofTarget: (p) => `${p}% ของเป้า`,
    target: "เป้า", ofLastMonth: (p) => `${p}% ของเดือนที่แล้ว`, lastMonth: "เดือนที่แล้ว", details: "ดูรายละเอียด", due: "WEEK", dueTitle: (n) => `ต้องจ่ายสัปดาห์นี้ ${n} ใบ`,
    noneDue: "ไม่มีบิลที่ต้องจ่ายภายใน 7 วัน", daysOver: (d) => `เลยกำหนด ${d} วัน`, today: "วันนี้", daysLeft: (d) => `อีก ${d} วัน`, more: (n) => `และอีก ${n} ใบ`,
    vat: "VAT", vatTitle: (m) => `ภ.พ.30 เดือน ${thM(m)}`, deadline: "กำหนดยื่น", online: "ยื่นออนไลน์", salesVat: "ภาษีขาย", toPay: "ต้องชำระประมาณ",
    refund: "ขอคืน/ยกไปประมาณ", drafts: (n) => `ฉบับร่าง ${n} ใบยังไม่นับ`, yesterday: "SALES", noSales: (d) => `ยังไม่มียอดขายของวันที่ ${d}`,
    bills: (n) => `${n} บิล`, excel: "EXCEL", excelTitle: "ไฟล์ Excel บัญชีซื้อ", validHour: "ลิงก์ใช้ได้ 1 ชั่วโมง", docs: (n) => `${n} ใบ`, download: "ดาวน์โหลด",
    weekly: "WEEKLY", weeklyTitle: "รายงานผู้ช่วย AI ประจำสัปดาห์", monthNow: (m) => `MONTHLY · เดือน ${thM(m)}`, weekSales: "ยอดขายสัปดาห์นี้",
    vsLastWeek: (p) => `${sign(p)} ${pct(p)} จากสัปดาห์ก่อน`, foodCost: "ต้นทุนวัตถุดิบ", vsLastMonthPt: (p) => `${sign(p)} ${Math.abs(p).toFixed(1)}% จากเดือนก่อน`,
    monthPurchases: "ยอดซื้อเดือนนี้", receipts: (n) => `ใบเสร็จ ${n} ใบ`, vatEstimate: "VAT ประมาณการ", excelButton: "ดาวน์โหลด Excel", fileBy: (d) => `ยื่นภายใน ${d}`, tips: "แนวทางบริหารสัปดาห์นี้",
    openDash: "เปิดแดชบอร์ด", branches: (n) => `${n} สาขา`,
  },
  en: {
    summary: "MONTHLY", month: (m) => `${enM(m)} summary`, asOf: "as of", sales: "Sales", purchases: (n) => `Purchases (${n})`, claimable: "Claimable VAT",
    unpaid: (n) => `Unpaid (${n})`, overdue: (n) => `${n} overdue`, toCheck: (n) => `⚠️ ${n} receipt(s) to check`, ofTarget: (p) => `${p}% of target`,
    target: "Target", ofLastMonth: (p) => `${p}% of last month`, lastMonth: "Last month", details: "View details", due: "WEEK", dueTitle: (n) => `Due this week: ${n}`,
    noneDue: "Nothing to pay in the next 7 days", daysOver: (d) => `${d} days overdue`, today: "today", daysLeft: (d) => `in ${d} days`, more: (n) => `and ${n} more`,
    vat: "VAT", vatTitle: (m) => `VAT return · ${enM(m)}`, deadline: "Deadline", online: "online filing", salesVat: "Output VAT", toPay: "Estimated to pay",
    refund: "Estimated refund / carry forward", drafts: (n) => `${n} draft(s) not counted yet`, yesterday: "SALES", noSales: (d) => `No sales for ${d} yet`,
    bills: (n) => `${n} bills`, excel: "EXCEL", excelTitle: "Purchase ledger (Excel)", validHour: "Links work for 1 hour", docs: (n) => `${n} docs`, download: "Download",
    weekly: "WEEKLY", weeklyTitle: "Your weekly AI assistant report", monthNow: (m) => `MONTHLY · ${enM(m)}`, weekSales: "Sales this week",
    vsLastWeek: (p) => `${sign(p)} ${pct(p)} vs last week`, foodCost: "Food cost", vsLastMonthPt: (p) => `${sign(p)} ${Math.abs(p).toFixed(1)}pt vs last month`,
    monthPurchases: "Purchases this month", receipts: (n) => `${n} receipts`, vatEstimate: "Estimated VAT", excelButton: "Download Excel", fileBy: (d) => `File by ${d}`, tips: "This week's suggestions",
    openDash: "Open dashboard", branches: (n) => `${n} branches`,
  },
};

/** A name in the reader's language (documents have th / en / ja) */
export const nameIn = (t: Tri, lang: LineLang) =>
  (lang === "ja" ? t.ja || t.en || t.th : lang === "th" ? t.th || t.en || t.ja : t.en || t.th || t.ja) || "—";

// ── Building blocks ───────────────────────────────────────────────────────────────────────────────────────────────

const head = (eyebrow: string, title: string, sub?: string): Box => ({
  type: "box",
  layout: "vertical",
  paddingAll: "20px",
  paddingBottom: "14px",
  contents: [
    txt(eyebrow, { size: "xxs", weight: "bold", color: C.muted }),
    txt(title, { size: "xl", weight: "bold", margin: "sm" }),
    ...(sub ? [txt(sub, { size: "xs", color: C.muted, margin: "sm" })] : []),
  ],
});

/** The blue card: a big amount and an optional lime progress bar */
const hero = (eyebrow: string, amount: string, bar: number | null, left: string, right: string): Box => ({
  type: "box",
  layout: "vertical",
  backgroundColor: C.blue,
  cornerRadius: "18px",
  paddingAll: "18px",
  margin: "none",
  contents: [
    txt(eyebrow, { size: "xxs", weight: "bold", color: C.onBlue }),
    txt(amount, { size: "3xl", weight: "bold", margin: "sm" }),
    ...(bar === null
      ? []
      : [
          {
            type: "box",
            layout: "vertical",
            height: "10px",
            margin: "md",
            backgroundColor: C.barBack,
            cornerRadius: "99px",
            contents: [{ type: "box", layout: "vertical", height: "10px", width: `${Math.max(2, Math.min(100, Math.round(bar * 100)))}%`, backgroundColor: C.lime, cornerRadius: "99px", contents: [] }],
          } satisfies Box,
        ]),
    {
      type: "box",
      layout: "horizontal",
      margin: "sm",
      contents: [txt(left, { size: "xxs", color: C.onBlue, flex: 3 }), txt(right, { size: "xxs", color: C.onBlue, align: "end", flex: 2 })],
    },
  ],
});

const tile = (label: string, value: string, note: string, noteColor: string = C.muted): Box => ({
  type: "box",
  layout: "vertical",
  flex: 1,
  backgroundColor: C.card,
  borderColor: C.line,
  borderWidth: "1px",
  cornerRadius: "16px",
  paddingAll: "12px",
  contents: [txt(label, { size: "xxs", color: C.muted, weight: "bold" }), txt(value, { size: "lg", weight: "bold", margin: "sm" }), txt(note, { size: "xxs", color: noteColor, margin: "xs" })],
});

const pair = (a: Box, b: Box): Box => ({ type: "box", layout: "horizontal", spacing: "sm", margin: "sm", contents: [a, b] });

const row = (label: string, value: string, color: string = C.white): Box => ({
  type: "box",
  layout: "horizontal",
  paddingTop: "8px",
  paddingBottom: "8px",
  contents: [txt(label, { size: "sm", color: C.soft, flex: 3 }), txt(value, { size: "sm", weight: "bold", color, align: "end", flex: 2 })],
});
const sep: messagingApi.FlexSeparator = { type: "separator", color: C.line };
const rows = (list: Box[]): Box => ({ type: "box", layout: "vertical", margin: "md", contents: list.flatMap((r, i) => (i ? [sep, r] : [r])) });

const warn = (text: string): Box => ({ type: "box", layout: "vertical", backgroundColor: C.warnBg, cornerRadius: "12px", paddingAll: "12px", margin: "md", contents: [txt(text, { size: "xs", weight: "bold", color: C.orange })] });

/** A button as a box (LINE buttons cannot have dark text on lime): a link, or a postback such as "ask=excel" */
const button = (label: string, to: string | { data: string }, primary = true): Box => ({
  type: "box",
  layout: "vertical",
  flex: 1,
  backgroundColor: primary ? C.lime : C.line,
  cornerRadius: "14px",
  paddingAll: "13px",
  action: typeof to === "string" ? { type: "uri", label: label.slice(0, 20), uri: to } : { type: "postback", label: label.slice(0, 20), data: to.data, displayText: label },
  contents: [txt(label, { size: "sm", weight: "bold", align: "center", color: primary ? C.bg : C.white })],
});

const bubble = (alt: string, top: Box, middle: Comp[], buttons: Box[]): messagingApi.FlexMessage => ({
  type: "flex",
  altText: alt.slice(0, 400),
  contents: {
    type: "bubble",
    size: "mega",
    styles: { body: { backgroundColor: C.bg } },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "0px",
      contents: [
        top,
        { type: "box", layout: "vertical", paddingStart: "14px", paddingEnd: "14px", paddingBottom: "14px", contents: [...middle, ...(buttons.length ? [{ type: "box", layout: "horizontal", spacing: "sm", margin: "lg", contents: buttons } satisfies Box] : [])] },
      ],
    },
  },
});

// ── The answers ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface SummaryData {
  month: string;
  /** Time of the numbers, "HH:MM" Bangkok */
  asOf: string;
  today: string;
  /** Gross sales of the month so far; null = the company keeps no sales */
  sales: number | null;
  /** Monthly sales target of all branches (0 = none) */
  target: number;
  /** Gross sales of all of last month (for the bar when there is no target) */
  lastMonthSales: number;
  purchases: number;
  count: number;
  claimableVat: number;
  unpaid: number;
  unpaidCount: number;
  overdueCount: number;
  toCheck: number;
}

/** Bar under the sales: against the target, or else against last month's whole month */
function salesBar(sales: number, target: number, lastMonth: number, w: Words): { bar: number | null; left: string; right: string } {
  if (target > 0) return { bar: sales / target, left: w.ofTarget(Math.round((sales / target) * 100)), right: `${w.target} ${baht(target)}` };
  if (lastMonth > 0) return { bar: sales / lastMonth, left: w.ofLastMonth(Math.round((sales / lastMonth) * 100)), right: `${w.lastMonth} ${baht(lastMonth)}` };
  return { bar: null, left: "", right: "" };
}

export function summaryCard(d: SummaryData, lang: LineLang, url: string): messagingApi.FlexMessage {
  const w = W[lang];
  const top = head(w.summary, w.month(d.month), `${dmy(d.today)} ${d.asOf} ${w.asOf}`);
  const b = d.sales === null ? null : salesBar(d.sales, d.target, d.lastMonthSales, w);
  const middle: Comp[] = [
    ...(d.sales !== null && b ? [hero(w.sales, baht(d.sales), b.bar, b.left, b.right)] : []),
    rows([
      row(w.purchases(d.count), baht(d.purchases)),
      row(w.claimable, baht(d.claimableVat), C.lime),
      ...(d.unpaidCount ? [row(`${w.unpaid(d.unpaidCount)}${d.overdueCount ? ` · ${w.overdue(d.overdueCount)}` : ""}`, baht(d.unpaid), C.orange)] : []),
    ]),
    ...(d.toCheck ? [warn(w.toCheck(d.toCheck))] : []),
  ];
  return bubble(d.sales === null ? w.month(d.month) : `${w.month(d.month)} · ${w.sales} ${baht(d.sales)}`, top, middle, [button(w.details, url)]);
}

export interface DueBill {
  vendor: Tri;
  amount: number;
  due: string;
  /** Negative = overdue */
  days: number;
}
/** At most this many bills are listed; the rest are counted */
export const DUE_LIST_MAX = 8;

export function dueCard(bills: DueBill[], lang: LineLang, url: string): messagingApi.FlexMessage {
  const w = W[lang];
  if (!bills.length) return bubble(w.noneDue, head(w.due, w.noneDue), [], [button(w.details, url)]);
  const total = bills.reduce((a, b) => a + Math.round(b.amount * 100), 0) / 100;
  const shown = bills.slice(0, DUE_LIST_MAX);
  const when = (d: number) => (d < 0 ? w.daysOver(-d) : d === 0 ? w.today : w.daysLeft(d));
  const list: Box[] = shown.map((b) => ({
    type: "box",
    layout: "horizontal",
    paddingTop: "8px",
    paddingBottom: "8px",
    contents: [
      { type: "box", layout: "vertical", flex: 3, contents: [txt(nameIn(b.vendor, lang), { size: "sm", weight: "bold" }), txt(`${dmy(b.due)} · ${when(b.days)}`, { size: "xxs", color: b.days < 0 ? C.orange : C.muted })] },
      txt(baht(b.amount), { size: "sm", weight: "bold", align: "end", flex: 2, gravity: "center", color: b.days < 0 ? C.orange : C.white }),
    ],
  }));
  const more = bills.length - shown.length;
  return bubble(
    `${w.dueTitle(bills.length)} ${baht(total)}`,
    head(w.due, w.dueTitle(bills.length)),
    [hero(w.due, baht(total), null, "", ""), rows(list), ...(more > 0 ? [txt(w.more(more), { size: "xs", color: C.muted, margin: "sm" })] : [])],
    [button(w.details, url)],
  );
}

export interface VatData {
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

export function vatCard(v: VatData, lang: LineLang, url: string): messagingApi.FlexMessage {
  const w = W[lang];
  const net = v.salesVat === null ? null : Math.round(v.salesVat * 100 - v.claimableVat * 100) / 100;
  const middle: Comp[] = [
    hero(`${w.deadline}${v.onlineOnly ? ` · ${w.online}` : ""}`, dmy(v.due), null, w.daysLeft(v.daysLeft), ""),
    rows([
      ...(v.salesVat !== null ? [row(w.salesVat, baht(v.salesVat))] : []),
      row(w.claimable, baht(v.claimableVat), C.lime),
      ...(net !== null ? [row(net >= 0 ? w.toPay : w.refund, baht(Math.abs(net)), net >= 0 ? C.orange : C.lime)] : []),
    ]),
    ...(v.toCheck ? [warn(w.toCheck(v.toCheck))] : []),
    ...(v.drafts ? [txt(w.drafts(v.drafts), { size: "xs", color: C.muted, margin: "sm" })] : []),
  ];
  return bubble(`${w.vatTitle(v.month)} · ${dmy(v.due)}`, head(w.vat, w.vatTitle(v.month)), middle, [button(w.details, url)]);
}

export interface SalesDay {
  date: string;
  branches: { name: Record<LineLang, string>; gross: number; bills: number }[];
}

export function salesCard(s: SalesDay, lang: LineLang, url: string): messagingApi.FlexMessage {
  const w = W[lang];
  if (!s.branches.length) return bubble(w.noSales(dmy(s.date)), head(w.yesterday, w.noSales(dmy(s.date))), [], [button(w.details, url)]);
  const total = s.branches.reduce((a, b) => a + Math.round(b.gross * 100), 0) / 100;
  const bills = s.branches.reduce((a, b) => a + b.bills, 0);
  return bubble(
    `${dmy(s.date)} ${w.sales} ${baht(total)}`,
    head(w.yesterday, `${dmy(s.date)} ${w.sales}`),
    [
      hero(w.sales, baht(total), null, bills ? w.bills(bills) : "", s.branches.length > 1 ? w.branches(s.branches.length) : ""),
      ...(s.branches.length > 1 ? [rows(s.branches.map((b) => row(b.name[lang], baht(b.gross))))] : []),
    ],
    [button(w.details, url)],
  );
}

export interface ExcelLink {
  month: string;
  count: number;
  url: string;
}

export function excelCard(files: ExcelLink[], lang: LineLang): messagingApi.FlexMessage {
  const w = W[lang];
  const monthName = (m: string) => (lang === "th" ? thM(m) : lang === "en" ? enM(m) : lang === "ja" ? `${m.slice(0, 4)}年${Number(m.slice(5, 7))}月` : `${m.slice(0, 4)}년 ${Number(m.slice(5, 7))}월`);
  return bubble(
    w.excelTitle,
    head(w.excel, w.excelTitle, w.validHour),
    files.map(
      (f): Box => ({
        type: "box",
        layout: "horizontal",
        margin: "sm",
        backgroundColor: C.card,
        borderColor: C.line,
        borderWidth: "1px",
        cornerRadius: "16px",
        paddingAll: "14px",
        contents: [
          { type: "box", layout: "vertical", flex: 3, contents: [txt(monthName(f.month), { size: "md", weight: "bold" }), txt(w.docs(f.count), { size: "xs", color: C.muted })] },
          { ...button(w.download, f.url), flex: 2 },
        ],
      }),
    ),
    [],
  );
}

// ── The weekly report ─────────────────────────────────────────────────────────────────────────────────────────────

export interface WeeklyData {
  /** The week shown: Monday … Sunday before the report */
  from: string;
  to: string;
  company: string;
  branchCount: number;
  month: string;
  monthSales: number;
  target: number;
  lastMonthSales: number;
  weekSales: number;
  prevWeekSales: number;
  /** Food purchases ÷ sales without VAT, % (null = not enough data) */
  foodCost: number | null;
  foodCostLastMonth: number | null;
  purchases: number;
  receipts: number;
  vatEstimate: number;
  vatDue: string;
}

export interface Tip {
  title: string;
  body: string;
}

const change = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);

export function weeklyCard(d: WeeklyData, tips: Tip[], lang: LineLang, url: string): messagingApi.FlexMessage {
  const w = W[lang];
  const b = salesBar(d.monthSales, d.target, d.lastMonthSales, w);
  const wk = change(d.weekSales, d.prevWeekSales);
  const food = d.foodCost !== null && d.foodCostLastMonth !== null ? d.foodCost - d.foodCostLastMonth : null;
  const tipBox: Box = {
    type: "box",
    layout: "vertical",
    margin: "sm",
    backgroundColor: C.card,
    borderColor: C.line,
    borderWidth: "1px",
    cornerRadius: "16px",
    paddingAll: "14px",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: [
          { type: "box", layout: "vertical", backgroundColor: C.lime, cornerRadius: "99px", paddingStart: "8px", paddingEnd: "8px", paddingTop: "2px", paddingBottom: "2px", flex: 0, contents: [txt("AI", { size: "xxs", weight: "bold", color: C.bg })] },
          txt(w.tips, { size: "md", weight: "bold", gravity: "center" }),
        ],
      },
      ...tips.slice(0, 3).map(
        (t, i): Box => ({
          type: "box",
          layout: "horizontal",
          spacing: "md",
          margin: "md",
          contents: [
            { type: "box", layout: "vertical", width: "22px", height: "22px", backgroundColor: C.line, cornerRadius: "8px", justifyContent: "center", contents: [txt(String(i + 1), { size: "xxs", weight: "bold", color: C.lime, align: "center" })] },
            { type: "box", layout: "vertical", flex: 1, contents: [txt(t.title, { size: "sm", weight: "bold" }), txt(t.body, { size: "xs", color: C.soft, margin: "xs" })] },
          ],
        }),
      ),
    ],
  };
  const middle: Comp[] = [
    hero(w.monthNow(d.month), baht(d.monthSales), b.bar, b.left || w.sales, b.right),
    pair(
      tile(w.weekSales, baht(d.weekSales), wk === null ? " " : w.vsLastWeek(wk), wk === null ? C.muted : wk >= 0 ? C.lime : C.orange),
      tile(w.foodCost, d.foodCost === null ? "—" : `${d.foodCost.toFixed(1)}%`, food === null ? " " : w.vsLastMonthPt(food), food === null ? C.muted : food > 0 ? C.orange : C.lime),
    ),
    pair(tile(w.monthPurchases, baht(d.purchases), w.receipts(d.receipts)), tile(w.vatEstimate, baht(d.vatEstimate), w.fileBy(dmy(d.vatDue)))),
    ...(tips.length ? [tipBox] : []),
  ];
  return bubble(
    `${w.weeklyTitle} · ${w.sales} ${baht(d.monthSales)}`,
    head(`${w.weekly} · ${dmy(d.from).slice(0, 5)} – ${dmy(d.to).slice(0, 5)}`, w.weeklyTitle, `${d.company}${d.branchCount > 1 ? ` · ${w.branches(d.branchCount)}` : ""}`),
    middle,
    [button(w.openDash, url), button(w.excelButton, { data: "ask=excel" }, false)],
  );
}
