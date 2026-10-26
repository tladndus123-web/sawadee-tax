// The bot's dashboard cards (owner, 2026-10-26): the answers to the menu buttons and the weekly AI report, as LINE
// Flex bubbles in the colours of the owner's menu pictures (deep navy, blue, lime), in the reader's language.
// Pure: the numbers come from lib/line-ask-server.ts and lib/weekly-report-server.ts.

import type { messagingApi } from "@line/bot-sdk";
import en from "@/messages/en.json";
import ja from "@/messages/ja.json";
import ko from "@/messages/ko.json";
import th from "@/messages/th.json";
import type { AiCard, Tone } from "./assistant";
import type { CheckResult } from "./checks";
import { inLang } from "./line-lang";
import type { LineLang } from "./line-lang";
import type { CardExtra, CardTip } from "./line-tips";
// Cards show whole baht (the exact figure is one tap away in the app)
import { bahtWhole as baht } from "./money";
import { dmy } from "./thai-tax";
import type { LedgerDoc, Tri } from "./types";

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

/** 💡 TIP: one line of advice for the situation, and a smaller line under it */
const tipBox = (t: CardTip): Box => ({
  type: "box",
  layout: "vertical",
  margin: "md",
  backgroundColor: C.card,
  borderColor: "#5a6b2a",
  borderWidth: "1px",
  cornerRadius: "16px",
  paddingAll: "14px",
  spacing: "sm",
  contents: [
    txt(`💡 TIP · ${t.title}`, { size: "xs", weight: "bold", color: C.lime }),
    txt(t.main, { size: "sm" }),
    ...(t.note ? [txt(t.note, { size: "xs", color: C.soft })] : []),
  ],
});

/** Next questions as buttons above the keyboard: tapping sends the words, the AI assistant answers */
export const nextQuestions = (next: string[] | undefined): messagingApi.QuickReply | undefined =>
  next?.length
    ? { items: next.slice(0, 13).map((q) => ({ type: "action", action: { type: "message", label: [...q].slice(0, 20).join(""), text: q } })) }
    : undefined;

const bubble = (alt: string, top: Box, middle: Comp[], buttons: Box[], extra: CardExtra = {}): messagingApi.FlexMessage => ({
  type: "flex",
  altText: alt.slice(0, 400),
  ...(extra.next?.length ? { quickReply: nextQuestions(extra.next) } : {}),
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
        {
          type: "box",
          layout: "vertical",
          paddingStart: "14px",
          paddingEnd: "14px",
          paddingBottom: "14px",
          contents: [...middle, ...(extra.tip ? [tipBox(extra.tip)] : []), ...(buttons.length ? [{ type: "box", layout: "horizontal", spacing: "sm", margin: "lg", contents: buttons } satisfies Box] : [])],
        },
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
  /** The same without VAT (what the target is compared with) */
  salesValue?: number | null;
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

/**
 * Bar under the sales: against the target — set without VAT, so the sales without VAT, as the app's dashboard does —
 * or else the sales (with VAT) against last month's whole month
 */
function salesBar(gross: number, value: number, target: number, lastMonth: number, w: Words): { bar: number | null; left: string; right: string } {
  if (target > 0) return { bar: value / target, left: w.ofTarget(Math.round((value / target) * 100)), right: `${w.target} ${baht(target)}` };
  if (lastMonth > 0) return { bar: gross / lastMonth, left: w.ofLastMonth(Math.round((gross / lastMonth) * 100)), right: `${w.lastMonth} ${baht(lastMonth)}` };
  return { bar: null, left: "", right: "" };
}

export function summaryCard(d: SummaryData, lang: LineLang, url: string, extra: CardExtra = {}): messagingApi.FlexMessage {
  const w = W[lang];
  const top = head(w.summary, w.month(d.month), `${dmy(d.today)} ${d.asOf} ${w.asOf}`);
  const b = d.sales === null ? null : salesBar(d.sales, d.salesValue ?? d.sales, d.target, d.lastMonthSales, w);
  const middle: Comp[] = [
    ...(d.sales !== null && b ? [hero(w.sales, baht(d.sales), b.bar, b.left, b.right)] : []),
    rows([
      row(w.purchases(d.count), baht(d.purchases)),
      row(w.claimable, baht(d.claimableVat), C.lime),
      ...(d.unpaidCount ? [row(`${w.unpaid(d.unpaidCount)}${d.overdueCount ? ` · ${w.overdue(d.overdueCount)}` : ""}`, baht(d.unpaid), C.orange)] : []),
    ]),
    ...(d.toCheck ? [warn(w.toCheck(d.toCheck))] : []),
  ];
  return bubble(d.sales === null ? w.month(d.month) : `${w.month(d.month)} · ${w.sales} ${baht(d.sales)}`, top, middle, [button(w.details, url)], extra);
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

export function dueCard(bills: DueBill[], lang: LineLang, url: string, extra: CardExtra = {}): messagingApi.FlexMessage {
  const w = W[lang];
  if (!bills.length) return bubble(w.noneDue, head(w.due, w.noneDue), [], [button(w.details, url)], extra);
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
    extra,
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

export function vatCard(v: VatData, lang: LineLang, url: string, extra: CardExtra = {}): messagingApi.FlexMessage {
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
  return bubble(`${w.vatTitle(v.month)} · ${dmy(v.due)}`, head(w.vat, w.vatTitle(v.month)), middle, [button(w.details, url)], extra);
}

export interface SalesDay {
  date: string;
  branches: { name: Record<LineLang, string>; gross: number; bills: number }[];
}

export function salesCard(s: SalesDay, lang: LineLang, url: string, extra: CardExtra = {}): messagingApi.FlexMessage {
  const w = W[lang];
  if (!s.branches.length) return bubble(w.noSales(dmy(s.date)), head(w.yesterday, w.noSales(dmy(s.date))), [], [button(w.details, url)], extra);
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
    extra,
  );
}

export interface ExcelLink {
  month: string;
  count: number;
  url: string;
}

export function excelCard(files: ExcelLink[], lang: LineLang, extra: CardExtra = {}): messagingApi.FlexMessage {
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
    extra,
  );
}

// ── The 5-day report (owner, 2026-10-26: on the 5th, 10th, 15th, 20th and 25th) ───────────────────────────────────
// Four cards to swipe: ① the last 5 days ② the month so far and where it ends ③ ✨ the AI's suggestions for the month
// ④ 🔍 anything unusual, compared with "our usual shop" (lib/anomalies.ts).

export interface Tip {
  title: string;
  body: string;
}

export interface FiveDayData {
  /** The 5 days shown (inclusive) */
  from: string;
  to: string;
  company: string;
  branchCount: number;
  /** The company keeps its sales here */
  hasSales: boolean;
  sales: number;
  salesBefore: number;
  bestDay: { date: string; gross: number } | null;
  receipts: number;
  purchases: number;
  month: string;
  monthSales: number;
  /** The month's sales without VAT (against the target) */
  monthSalesValue?: number;
  target: number;
  lastMonthSales: number;
  monthPurchases: number;
  /** Food purchases ÷ sales without VAT, % (null = not enough data) */
  foodCost: number | null;
  vatEstimate: number;
  vatDue: string;
}

/** An unusual thing, already in the reader's words */
export interface AnomalyLine {
  level: "red" | "orange" | "blue";
  title: string;
  detail: string;
  url: string;
}

const FD: Record<LineLang, Record<string, string>> = {
  ko: { days: "5일 결산", month: "이번 달 진행률", ai: "이번 달 운영 제안", odd: "이상한 점", none: "평소와 다른 점이 없어요 ✓", noneSub: "중복 영수증, 큰 지출, 새 거래처를 확인했어요.", sales: "5일 매출", purchases: "5일 매입", receipts: "들어온 영수증", best: "가장 높은 날", before: "직전 5일보다", check: "확인", noTips: "AI 제안을 만들지 못했어요. 대시보드에서 숫자를 확인해 주세요." },
  ja: { days: "5日間の決算", month: "今月の進み具合", ai: "今月の運営アドバイス", odd: "気になる点", none: "いつもと違う点はありません ✓", noneSub: "重複領収書・大きな支出・新しい取引先を確認しました。", sales: "5日間の売上", purchases: "5日間の仕入", receipts: "届いた領収書", best: "一番よかった日", before: "直前5日比", check: "確認", noTips: "AIの提案を作れませんでした。ダッシュボードで数字をご確認ください。" },
  th: { days: "สรุป 5 วัน", month: "ความคืบหน้าเดือนนี้", ai: "ข้อเสนอการบริหารเดือนนี้", odd: "สิ่งที่ผิดปกติ", none: "ไม่มีอะไรผิดปกติ ✓", noneSub: "ตรวจใบเสร็จซ้ำ ค่าใช้จ่ายสูง และผู้ขายใหม่แล้ว", sales: "ยอดขาย 5 วัน", purchases: "ยอดซื้อ 5 วัน", receipts: "ใบเสร็จที่เข้ามา", best: "วันที่ขายดีที่สุด", before: "จาก 5 วันก่อน", check: "ตรวจ", noTips: "สร้างข้อเสนอ AI ไม่ได้ ดูตัวเลขในแดชบอร์ด" },
  en: { days: "Last 5 days", month: "This month so far", ai: "Suggestions for this month", odd: "Anything unusual", none: "Nothing unusual ✓", noneSub: "Checked for receipts twice, big spends and new suppliers.", sales: "Sales, 5 days", purchases: "Purchases, 5 days", receipts: "Receipts in", best: "Best day", before: "vs the 5 days before", check: "Check", noTips: "Couldn't make AI suggestions; see the numbers on the dashboard." },
};

const LEVEL: Record<AnomalyLine["level"], string> = { red: "🔴", orange: "🟠", blue: "🔵" };

export function fiveDayMessage(d: FiveDayData, tips: Tip[], odd: AnomalyLine[], lang: LineLang, appUrl: string, extra: CardExtra = {}): messagingApi.FlexMessage {
  const w = W[lang];
  const f = FD[lang];
  const range = `${dmy(d.from).slice(0, 5)} – ${dmy(d.to).slice(0, 5)}`;
  const ch = change(d.sales, d.salesBefore);

  // ① the 5 days
  const first = bubble(
    f.days,
    head(`5 DAYS · ${range}`, f.days, `${d.company}${d.branchCount > 1 ? ` · ${w.branches(d.branchCount)}` : ""}`),
    [
      d.hasSales ? hero(f.sales, baht(d.sales), null, ch === null ? "" : `${sign(ch)} ${pct(ch)} ${f.before}`, "") : hero(f.purchases, baht(d.purchases), null, "", ""),
      pair(
        tile(f.receipts, String(d.receipts), d.hasSales ? `${f.purchases} ${baht(d.purchases)}` : " "),
        d.bestDay ? tile(f.best, baht(d.bestDay.gross), dmy(d.bestDay.date), C.lime) : tile(w.monthPurchases, baht(d.monthPurchases), " "),
      ),
    ],
    [button(w.openDash, `${appUrl}/`)],
  ).contents as messagingApi.FlexBubble;

  // ② the month so far and where it ends
  const b = salesBar(d.monthSales, d.monthSalesValue ?? d.monthSales, d.target, d.lastMonthSales, w);
  const second = bubble(
    f.month,
    head(w.monthNow(d.month), f.month),
    [
      ...(d.hasSales ? [hero(w.sales, baht(d.monthSales), b.bar, b.left, b.right)] : []),
      pair(tile(w.monthPurchases, baht(d.monthPurchases), " "), d.foodCost === null ? tile(w.vatEstimate, baht(d.vatEstimate), w.fileBy(dmy(d.vatDue))) : tile(w.foodCost, `${d.foodCost.toFixed(1)}%`, " ")),
      ...(d.foodCost === null ? [] : [{ ...tile(w.vatEstimate, baht(d.vatEstimate), w.fileBy(dmy(d.vatDue))), margin: "sm" } satisfies Box]),
    ],
    [],
    { tip: extra.tip },
  ).contents as messagingApi.FlexBubble;

  // ③ ✨ the AI's suggestions
  const third = bubble(
    f.ai,
    head("AI", `✨ ${f.ai}`),
    tips.length
      ? tips.slice(0, 3).map(
          (t, i): Box => ({
            type: "box",
            layout: "horizontal",
            spacing: "md",
            margin: i ? "md" : "none",
            backgroundColor: C.card,
            borderColor: C.line,
            borderWidth: "1px",
            cornerRadius: "16px",
            paddingAll: "14px",
            contents: [
              { type: "box", layout: "vertical", width: "24px", height: "24px", backgroundColor: C.line, cornerRadius: "8px", justifyContent: "center", contents: [txt(String(i + 1), { size: "xs", weight: "bold", color: C.lime, align: "center" })] },
              { type: "box", layout: "vertical", flex: 1, contents: [txt(t.title, { size: "sm", weight: "bold" }), txt(t.body, { size: "xs", color: C.soft, margin: "xs" })] },
            ],
          }),
        )
      : [txt(f.noTips, { size: "sm", color: C.soft })],
    [],
  ).contents as messagingApi.FlexBubble;

  // ④ 🔍 anything unusual
  const fourth = bubble(
    f.odd,
    head("CHECK", `🔍 ${f.odd}`, odd.length ? undefined : f.noneSub),
    odd.length
      ? odd.map(
          (a, i): Box => ({
            type: "box",
            layout: "horizontal",
            spacing: "md",
            margin: i ? "sm" : "none",
            backgroundColor: C.card,
            borderColor: C.line,
            borderWidth: "1px",
            cornerRadius: "16px",
            paddingAll: "12px",
            action: { type: "uri", label: f.check, uri: a.url },
            contents: [
              txt(LEVEL[a.level], { size: "sm", flex: 0, gravity: "top" }),
              { type: "box", layout: "vertical", flex: 1, contents: [txt(a.title, { size: "sm", weight: "bold" }), txt(a.detail, { size: "xxs", color: C.soft, margin: "xs" })] },
              txt(`${f.check} ›`, { size: "xxs", color: C.lime, flex: 0, gravity: "center" }),
            ],
          }),
        )
      : [{ type: "box", layout: "vertical", backgroundColor: C.card, cornerRadius: "16px", paddingAll: "16px", contents: [txt(f.none, { size: "md", weight: "bold", color: C.lime })] } satisfies Box],
    [],
  ).contents as messagingApi.FlexBubble;

  return {
    type: "flex",
    altText: `${f.days} ${range}${d.hasSales ? ` · ${w.sales} ${baht(d.sales)}` : ""}${odd.length ? ` · ${f.odd} ${odd.length}` : ""}`.slice(0, 400),
    contents: { type: "carousel", contents: [first, second, third, fourth] },
    ...(extra.next?.length ? { quickReply: nextQuestions(extra.next) } : {}),
  };
}

const change = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);

// ── The AI assistant's answers ────────────────────────────────────────────────────────────────────────────────────

const TONE: Record<Tone, string> = { up: C.lime, down: C.orange, warn: C.orange, neutral: C.white };
const TILE_NOTE: Record<Tone, string> = { up: C.lime, down: C.orange, warn: C.orange, neutral: C.muted };

/** A card the AI filled (lib/assistant.ts parseCard), drawn like the menu's cards */
export function aiCard(c: AiCard): messagingApi.FlexMessage {
  const tiles = c.tiles.map((t) => tile(t.label, t.value, t.note || " ", TILE_NOTE[t.tone]));
  const middle: Comp[] = [
    ...(c.hero ? [hero(c.hero.label || " ", c.hero.value, c.hero.bar, c.hero.note, "")] : []),
    ...(tiles.length === 1 ? [{ ...tiles[0], margin: "sm" } satisfies Box] : []),
    ...Array.from({ length: Math.floor(tiles.length / 2) }, (_, i) => pair(tiles[i * 2], tiles[i * 2 + 1])),
    ...(tiles.length > 1 && tiles.length % 2 ? [{ ...tiles[tiles.length - 1], margin: "sm" } satisfies Box] : []),
    ...(c.rows.length ? [rows(c.rows.map((r) => row(r.label, r.value, TONE[r.tone])))] : []),
    ...c.sections.map(
      (s): Box => ({
        type: "box",
        layout: "vertical",
        margin: "md",
        backgroundColor: C.card,
        borderColor: C.line,
        borderWidth: "1px",
        cornerRadius: "16px",
        paddingAll: "14px",
        spacing: "sm",
        contents: [
          ...(s.title ? [txt(s.title, { size: "sm", weight: "bold", color: C.lime })] : []),
          ...s.items.map((i) => txt(`• ${i}`, { size: "xs", color: C.soft })),
        ],
      }),
    ),
  ];
  return bubble(
    `${c.title} · ${c.summary}`,
    head(c.eyebrow || "AI", c.title, c.summary || undefined),
    middle,
    c.links.map((l, i) => button(l.label, l.url, i === 0)),
    { tip: c.tip, next: c.next },
  );
}

// ── The receipt card (a photo saved from LINE) ──────────────────────────────────────────────────────────────────

const CARD: Record<LineLang, { toCheck: (n: number) => string; ok: string; saved: string; vat: string; due: string; total: string; open: string; alt: string }> = {
  th: { toCheck: (n) => `ต้องตรวจ ${n} รายการ`, ok: "ตรวจอัตโนมัติผ่าน", saved: "บันทึกลงสมุดบัญชีแล้ว", vat: "VAT", due: "ครบกำหนด", total: "ยอดสุทธิ", open: "เปิดในแอป", alt: "บันทึกแล้ว" },
  ja: { toCheck: (n) => `要確認 ${n}件`, ok: "自動チェックOK", saved: "台帳に登録しました", vat: "消費税", due: "支払期限", total: "合計", open: "アプリで開く", alt: "登録しました" },
  ko: { toCheck: (n) => `확인 필요 ${n}건`, ok: "자동 확인 통과", saved: "장부에 저장했어요", vat: "부가세", due: "지급 기한", total: "합계", open: "앱에서 열기", alt: "저장했어요" },
  en: { toCheck: (n) => `${n} to check`, ok: "Automatic checks passed", saved: "Saved to the ledger", vat: "VAT", due: "Due", total: "Total", open: "Open in the app", alt: "Saved" },
};
const CHECK_NAMES: Record<LineLang, Record<string, string>> = { th: th.checks, ja: ja.checks, ko: ko.checks, en: en.checks };

/** The reply for a saved document: who, how much, what the automatic checks found, and a link to it */
export function receiptCard(doc: LedgerDoc, checks: CheckResult[], url: string, lang: LineLang): messagingApi.FlexMessage {
  const L = CARD[lang];
  const seller = nameIn(doc.seller.name, lang);
  const problems = checks.filter((c) => !c.na && !c.ok);
  const meta = [doc.docNo, doc.date && dmy(doc.date)].filter(Boolean).join(" · ") || " ";
  const net = baht(doc.totals.net);
  const status: Box = problems.length
    ? {
        type: "box",
        layout: "vertical",
        backgroundColor: C.warnBg,
        cornerRadius: "12px",
        paddingAll: "12px",
        margin: "md",
        spacing: "xs",
        contents: [
          txt(`⚠️ ${L.toCheck(problems.length)}`, { size: "xs", weight: "bold", color: C.orange }),
          ...problems.slice(0, 3).map((c) => txt(`• ${CHECK_NAMES[lang][c.key] ?? c.key}`, { size: "xxs", color: C.orange })),
        ],
      }
    : { type: "box", layout: "vertical", backgroundColor: C.card, cornerRadius: "12px", paddingAll: "12px", margin: "md", contents: [txt(`✓ ${L.ok}`, { size: "xs", weight: "bold", color: C.lime })] };
  return bubble(
    `${L.alt} ${net} ${seller}`,
    head("RECEIPT", seller, `${L.saved} · ${meta}`),
    [
      hero(L.total, net, null, `${L.vat} ${baht(doc.totals.vat)}`, doc.dueDate && !doc.paid ? `${L.due} ${dmy(doc.dueDate)}` : ""),
      status,
    ],
    [button(L.open, url)],
  );
}

// ── Notices (morning reminders, a sales file saved …) as cards ──────────────────────────────────────────────────

const OPEN: Record<LineLang, string> = { ko: "열기", ja: "開く", th: "เปิด", en: "Open" };

/**
 * A bot text in the reader's language as a card: the first line is the title, the second the line under it, the
 * other lines become rows ("label: value") or a list, and a last line with a link becomes the button.
 */
export function noticeBubble(text: string, eyebrow: string, lang: LineLang): messagingApi.FlexBubble {
  const lines = text.split("\n").map((l) => l.trim());
  const url = lines.length && /^https?:\/\//.test(lines[lines.length - 1]) ? lines.pop()! : "";
  const [title = " ", second = "", ...rest] = lines;
  const body: Box[] = [];
  const pairs: Box[] = [];
  const items: string[] = [];
  for (const l of rest.filter(Boolean)) {
    const m = /^(.+?)\s*[:：]\s*(.{1,26})$/.exec(l);
    if (m && !l.startsWith("•")) pairs.push(row(m[1].replace(/^[•✓]\s*/, ""), m[2]));
    else items.push(l);
  }
  if (pairs.length) body.push(rows(pairs));
  if (items.length)
    body.push({
      type: "box",
      layout: "vertical",
      margin: "md",
      backgroundColor: C.card,
      borderColor: C.line,
      borderWidth: "1px",
      cornerRadius: "16px",
      paddingAll: "14px",
      spacing: "sm",
      contents: items.map((i) => txt(i, { size: "xs", color: i.startsWith("✓") ? C.lime : C.soft })),
    });
  return bubble(title, head(eyebrow, title, second || undefined), body, url ? [button(OPEN[lang], url)] : []).contents as messagingApi.FlexBubble;
}

/** Several bot texts (each in four languages) as one message in the reader's language: a card, or swipeable cards */
export function noticeMessage(texts: string[], eyebrow: string, lang: LineLang, prefix = ""): messagingApi.FlexMessage {
  const parts = texts.map((t) => `${prefix}${inLang(t, lang)}`);
  const bubbles = parts.slice(0, 12).map((t) => noticeBubble(t, eyebrow, lang));
  const alt = parts.map((t) => t.split("\n")[0]).join(" · ").slice(0, 400) || eyebrow;
  return bubbles.length === 1
    ? { type: "flex", altText: alt, contents: bubbles[0] }
    : { type: "flex", altText: alt, contents: { type: "carousel", contents: bubbles } };
}

// ── Month-end report (the 1st), the accountant link, next month's target ─────────────────────────────────────────

export interface MonthEndData {
  month: string;
  company: string;
  hasSales: boolean;
  salesValue: number;
  costs: number;
  labor: number;
  profit: number;
  previousProfit: number;
  vatPayable: number;
  wht: number;
  socialSecurity: number;
  target: number;
  documents: number;
}

const ME: Record<LineLang, Record<string, string>> = {
  ko: { eyebrow: "MONTH-END", title: "{m} 마감", left: "남은 돈", vsPrev: "{p} 지난달보다", hit: "목표 달성 ✓", ofTarget: "목표의 {p}%", sales: "매출 (VAT 제외)", costs: "비용 (매입)", labor: "인건비", vat: "낼 부가세", wht: "원천세", ss: "사회보험", share: "📤 회계사에게 보내기", goal: "📊 {m} 목표 정하기", files: "{m} 자료", docs: "매입 서류 {n}장", excel: "엑셀 받기", salesReport: "매출 보고서", ledgerReport: "매입 보고서", shareTitle: "{m} 자료 링크", shareSub: "회계사가 로그인 없이 {m} 자료만 볼 수 있어요. {d}까지 열려요.", sendLine: "LINE으로 보내기", preview: "미리 보기", settings: "앱에서 정하기", shareText: "{c} {m} 장부 자료입니다 (로그인 없이 보기, {d}까지): {u}", goalTitle: "{m} 목표", goalSub: "지난 3달 매출(VAT 제외) 중 높은 쪽을 기준으로 정했어요.", total: "합계", setAs: "이대로 정하기", goalSet: "✓ {m} 목표를 정했어요 · 합계 {t}", setHint: "누르면 바로 저장돼요 (✓ +5% 추천). 앱 설정에서도 바꿀 수 있어요.", goalNone: "목표를 정할 매출 기록이 없어요. 앱 설정에서 직접 정해 주세요." },
  ja: { eyebrow: "MONTH-END", title: "{m}の締め", left: "残ったお金", vsPrev: "先月比 {p}", hit: "目標達成 ✓", ofTarget: "目標の{p}%", sales: "売上（VAT抜き）", costs: "費用（仕入）", labor: "人件費", vat: "納付するVAT", wht: "源泉税", ss: "社会保険", share: "📤 会計士に送る", goal: "📊 {m}の目標を決める", files: "{m}の資料", docs: "仕入書類 {n}件", excel: "Excel出力", salesReport: "売上レポート", ledgerReport: "仕入レポート", shareTitle: "{m}の資料リンク", shareSub: "会計士がログインなしで{m}の資料だけ見られます。{d}まで有効です。", sendLine: "LINEで送る", preview: "プレビュー", settings: "アプリで決める", shareText: "{c} {m}の帳簿資料です（ログイン不要、{d}まで）: {u}", goalTitle: "{m}の目標", goalSub: "直近3か月の売上（VAT抜き）の高い方を基準にしました。", total: "合計", setAs: "これで決める", goalSet: "✓ {m}の目標を決めました · 合計 {t}", setHint: "押すとすぐ保存されます（✓ +5%がおすすめ）。アプリの設定でも変更できます。", goalNone: "目標を決める売上記録がありません。アプリの設定で決めてください。" },
  th: { eyebrow: "MONTH-END", title: "ปิดเดือน {m}", left: "กำไร", vsPrev: "{p} จากเดือนก่อน", hit: "ถึงเป้าแล้ว ✓", ofTarget: "{p}% ของเป้า", sales: "ยอดขาย (ไม่รวม VAT)", costs: "ค่าใช้จ่าย (ซื้อ)", labor: "ค่าแรง", vat: "VAT ที่ต้องชำระ", wht: "ภาษีหัก ณ ที่จ่าย", ss: "ประกันสังคม", share: "📤 ส่งให้นักบัญชี", goal: "📊 ตั้งเป้า {m}", files: "เอกสาร {m}", docs: "เอกสารซื้อ {n} ใบ", excel: "ดาวน์โหลด Excel", salesReport: "รายงานยอดขาย", ledgerReport: "รายงานซื้อ", shareTitle: "ลิงก์เอกสาร {m}", shareSub: "นักบัญชีดูเอกสารเดือน {m} ได้โดยไม่ต้องเข้าสู่ระบบ ใช้ได้ถึง {d}", sendLine: "ส่งทาง LINE", preview: "ดูตัวอย่าง", settings: "ตั้งในแอป", shareText: "เอกสารบัญชีเดือน {m} ของ {c} (ดูได้ไม่ต้องเข้าสู่ระบบ ถึง {d}): {u}", goalTitle: "เป้า {m}", goalSub: "ตั้งจากยอดขาย (ไม่รวม VAT) ที่สูงกว่าระหว่างเดือนก่อนกับค่าเฉลี่ย 3 เดือน", total: "รวม", setAs: "ตั้งตามนี้", goalSet: "✓ ตั้งเป้า {m} แล้ว · รวม {t}", setHint: "กดแล้วบันทึกทันที (แนะนำ ✓ +5%) แก้ในแอปได้", goalNone: "ยังไม่มียอดขายพอจะตั้งเป้า กรุณาตั้งในแอป" },
  en: { eyebrow: "MONTH-END", title: "{m} closed", left: "What was left", vsPrev: "{p} vs last month", hit: "Target reached ✓", ofTarget: "{p}% of target", sales: "Sales (excl. VAT)", costs: "Costs (purchases)", labor: "Labour", vat: "VAT to pay", wht: "Withholding tax", ss: "Social security", share: "📤 Send to accountant", goal: "📊 Set {m} target", files: "{m} files", docs: "{n} purchase documents", excel: "Download Excel", salesReport: "Sales report", ledgerReport: "Purchase report", shareTitle: "{m} link for your accountant", shareSub: "Your accountant can see {m} without signing in, until {d}.", sendLine: "Send by LINE", preview: "Preview", settings: "Set in the app", shareText: "{c} books for {m} (no sign-in, until {d}): {u}", goalTitle: "{m} target", goalSub: "Based on the higher of last month and the 3-month average (sales excl. VAT).", total: "Total", setAs: "Set it", goalSet: "✓ {m} target set · total {t}", setHint: "Tap to save at once (✓ +5% suggested). You can change it in the app too.", goalNone: "Not enough sales to suggest a target. Please set it in the app." },
};
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const monthWord = (m: string, lang: LineLang) => (lang === "th" ? thM(m) : lang === "en" ? enM(m) : lang === "ja" ? `${Number(m.slice(5, 7))}月` : `${Number(m.slice(5, 7))}월`);
const nextMonthOf = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
};

export function monthEndMessage(d: MonthEndData, lang: LineLang, appUrl: string, extra: CardExtra = {}): messagingApi.FlexMessage {
  const t = ME[lang];
  const m = monthWord(d.month, lang);
  const next = nextMonthOf(d.month);
  const ch = d.previousProfit !== 0 ? ((d.profit - d.previousProfit) / Math.abs(d.previousProfit)) * 100 : null;
  const right = d.target > 0 && d.hasSales ? (d.salesValue >= d.target ? t.hit : fill(t.ofTarget, { p: Math.round((d.salesValue / d.target) * 100) })) : "";
  const first = bubble(
    fill(t.title, { m }),
    head(t.eyebrow, fill(t.title, { m }), d.company || undefined),
    [
      hero(t.left, baht(d.profit), null, ch === null ? "" : fill(t.vsPrev, { p: `${sign(ch)} ${pct(ch)}` }), right),
      rows([
        ...(d.hasSales ? [row(t.sales, baht(d.salesValue))] : []),
        row(t.costs, baht(d.costs)),
        ...(d.labor ? [row(t.labor, baht(d.labor))] : []),
        row(t.vat, baht(Math.max(0, d.vatPayable)), d.vatPayable > 0 ? C.orange : C.white),
        ...(d.wht ? [row(t.wht, baht(d.wht), C.orange)] : []),
        ...(d.socialSecurity ? [row(t.ss, baht(d.socialSecurity))] : []),
      ]),
    ],
    [button(t.share, { data: `share=${d.month}` })],
    { tip: extra.tip },
  ).contents as messagingApi.FlexBubble;
  const second = bubble(
    fill(t.files, { m }),
    head("FILES", fill(t.files, { m }), fill(t.docs, { n: d.documents })),
    [
      { ...button(t.excel, { data: "ask=excel" }), flex: 0 } satisfies Box,
      { ...button(t.salesReport, `${appUrl}/sales/report/${d.month}`, false), flex: 0, margin: "sm" } satisfies Box,
      { ...button(t.ledgerReport, `${appUrl}/ledger/report/${d.month}`, false), flex: 0, margin: "sm" } satisfies Box,
      { ...button(fill(t.goal, { m: monthWord(next, lang) }), { data: `goal=${next}` }, false), flex: 0, margin: "sm" } satisfies Box,
    ],
    [],
  ).contents as messagingApi.FlexBubble;
  return {
    type: "flex",
    altText: `${fill(t.title, { m })} · ${t.left} ${baht(d.profit)}`.slice(0, 400),
    contents: { type: "carousel", contents: [first, second] },
    ...(extra.next?.length ? { quickReply: nextQuestions(extra.next) } : {}),
  };
}

/** The accountant link, with a button to forward it by LINE */
export function shareCard(p: { month: string; url: string; expires: string; company: string }, lang: LineLang): messagingApi.FlexMessage {
  const t = ME[lang];
  const m = monthWord(p.month, lang);
  const d = dmy(p.expires.slice(0, 10));
  const text = fill(t.shareText, { c: p.company, m, d, u: p.url });
  return bubble(
    fill(t.shareTitle, { m }),
    head("ACCOUNTANT", fill(t.shareTitle, { m }), fill(t.shareSub, { m, d })),
    [{ type: "box", layout: "vertical", backgroundColor: C.card, cornerRadius: "12px", paddingAll: "12px", contents: [txt(p.url, { size: "xxs", color: C.soft })] } satisfies Box],
    [button(t.sendLine, `https://line.me/R/share?text=${encodeURIComponent(text)}`), button(t.preview, p.url, false)],
  );
}

export interface GoalLineView {
  name: string;
  base: number;
  target: number;
}

/** Next month's target per branch, and buttons to set it raised by 5 %, as it is, or by 10 % */
export function goalCard(month: string, lines: GoalLineView[], lang: LineLang, appUrl: string): messagingApi.FlexMessage {
  const t = ME[lang];
  const m = monthWord(month, lang);
  const total = lines.reduce((a, l) => a + l.target, 0);
  if (!total) return bubble(t.goalNone, head("GOAL", fill(t.goalTitle, { m }), t.goalNone), [], [button(t.settings, `${appUrl}/settings`, false)]);
  return bubble(
    `${fill(t.goalTitle, { m })} ${baht(total)}`,
    head("GOAL", fill(t.goalTitle, { m }), t.goalSub),
    [
      hero(t.total, baht(total), null, "+5%", ""),
      ...(lines.length > 1 ? [rows(lines.map((l) => row(l.name, baht(l.target))))] : []),
      txt(t.setHint, { size: "xs", color: C.soft, margin: "md" }),
    ],
    [button("✓ +5%", { data: `goalset=${month}&p=5` }), button("+0%", { data: `goalset=${month}&p=0` }, false), button("+10%", { data: `goalset=${month}&p=10` }, false)],
  );
}

export const goalSetText = (month: string, total: number, lang: LineLang) => fill(ME[lang].goalSet, { m: monthWord(month, lang), t: baht(total) });
