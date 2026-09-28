// LINE bot pieces with no database access: API clients, the bot's words and the receipt card.
// The bot always answers in Thai and Japanese together (user's choice), Thai first.

import { messagingApi } from "@line/bot-sdk";
import ja from "@/messages/ja.json";
import th from "@/messages/th.json";
import type { CheckResult } from "./checks";
import type { DueItem } from "./dashboard";
import { baht } from "./money";
import { dmy } from "./thai-tax";
import type { LedgerDoc } from "./types";

// Keys never contain whitespace; a line break or space pasted into .env makes LINE refuse some calls
const key = (v: string | undefined) => (v ?? "").replace(/\s+/g, "");

export function lineConfig() {
  return {
    channelAccessToken: key(process.env.LINE_CHANNEL_ACCESS_TOKEN),
    channelSecret: key(process.env.LINE_CHANNEL_SECRET),
  };
}

// The base URLs are only overridden by the local end-to-end check (a fake LINE server)
export const lineClient = () =>
  new messagingApi.MessagingApiClient({ channelAccessToken: lineConfig().channelAccessToken, baseURL: process.env.LINE_API_BASE_URL || undefined });
export const lineBlobClient = () =>
  new messagingApi.MessagingApiBlobClient({ channelAccessToken: lineConfig().channelAccessToken, baseURL: process.env.LINE_DATA_API_BASE_URL || undefined });

const both = (thai: string, japanese: string) => `${thai}\n\n${japanese}`;

/** A branch as the bot names it (Thai / Japanese) */
export const lineBranchLabel = (b: { no: string; name: string }) => b.name.trim() || (b.no === "00000" ? "สำนักงานใหญ่ / 本店" : `สาขา ${b.no}`);

/** Buttons under a sales file: which branch is it for? (postback "branch=<id>&xl=<messageId>&fn=<file name>") */
export function salesBranchButtons(messageId: string, fileName: string, branches: { id: string; no: string; name: string }[]): messagingApi.QuickReply {
  return {
    items: branches.slice(0, 13).map((b) => {
      const label = lineBranchLabel(b).slice(0, 20);
      return { type: "action", action: { type: "postback", label, data: `branch=${b.id}&xl=${messageId}&fn=${encodeURIComponent(fileName).slice(0, 120)}`, displayText: label } };
    }),
  };
}

/** Buttons under the receipt card: which branch is this for? (postback "branch=<id>&doc=<id>") */
export function branchButtons(docId: string, branches: { id: string; no: string; name: string }[]): messagingApi.QuickReply {
  return {
    items: branches.slice(0, 13).map((b) => {
      const label = lineBranchLabel(b).slice(0, 20);
      return { type: "action", action: { type: "postback", label, data: `branch=${b.id}&doc=${docId}`, displayText: label } };
    }),
  };
}

export interface SalesSavedText {
  days: number;
  from: string;
  to: string;
  gross: number;
  vat: number;
  locked: number;
  invalid: number;
  branch: string;
}

export const say = {
  fileNoColumns: both(
    "อ่านคอลัมน์ของไฟล์นี้ไม่ได้ กรุณานำเข้าในแอปหนึ่งครั้ง (ยอดขาย → POS Excel) เพื่อให้แอปจำคอลัมน์ แล้วครั้งต่อไปส่งไฟล์มาที่นี่ได้เลย",
    "このファイルの列を読み取れませんでした。アプリで一度取り込むと（売上 → POS Excel）列を覚えるので、次回からはここに送るだけで済みます。",
  ),
  fileNoRows: both("ไม่พบแถวที่มีวันที่และยอดขาย ตรวจสอบไฟล์อีกครั้ง", "日付と売上金額のある行が見つかりません。ファイルを確認してください。"),
  fileTooBig: both("ไฟล์ใหญ่เกินไป (เกิน 5 MB)", "ファイルが大きすぎます（5MB超）。"),
  fileAlready: both("ไฟล์นี้บันทึกไว้แล้ว", "このファイルはすでに登録済みです。"),
  fileBranchAsk: "ยอดขายของสาขาไหน? กดเลือกด้านล่าง / どの支店の売上ですか？下から選んでください",
  salesSaved: (s: SalesSavedText, url: string) =>
    [
      ...(s.days
        ? [`✓ บันทึกยอดขาย ${s.days} วัน (${dmy(s.from)}${s.to !== s.from ? ` – ${dmy(s.to)}` : ""})${s.branch ? ` · ${s.branch}` : ""}`, `รวม ${baht(s.gross)} · VAT ${baht(s.vat)}`]
        : ["ไม่ได้บันทึกยอดขาย"]),
      ...(s.locked ? [`ข้าม ${s.locked} วันของเดือนที่ปิดแล้ว`] : []),
      ...(s.invalid ? [`ข้าม ${s.invalid} วันที่ตัวเลขผิดปกติ`] : []),
      "",
      ...(s.days ? [`売上 ${s.days}日分を登録しました（${dmy(s.from)}${s.to !== s.from ? `〜${dmy(s.to)}` : ""}）`, `合計 ${baht(s.gross)} · VAT ${baht(s.vat)}`] : ["売上は登録されませんでした"]),
      ...(s.locked ? [`締めた月の${s.locked}日分はスキップ`] : []),
      "",
      url,
    ].join("\n"),
  duplicate: (url: string) => `รูปนี้บันทึกไว้แล้ว จึงไม่ได้อ่านซ้ำ (ไม่มีค่าใช้จ่าย)\nこの写真は登録済みのため、読み取りを省きました（費用なし）\n${url}`,
  branchAsk: "สาขาไหน? กดเลือกด้านล่าง / どの支店ですか？下から選んでください",
  branchSet: (name: string) => `✓ บันทึกเป็น ${name} / ${name} に登録しました`,
  branchGone: "ไม่พบสาขานั้นแล้ว เปิดแอปเพื่อเลือก / その支店は見つかりません。アプリで選んでください",
  welcome: both(
    "สวัสดี นี่คือบอท Sawadee TAX\nเปิดแอป → ตั้งค่า → เชื่อม LINE แล้วส่งรหัส 6 หลักมาที่แชทนี้",
    "こんにちは。Sawadee TAXのボットです。\nアプリの「設定 → LINE連携」で6桁のコードを取得し、このトークに送ってください。",
  ),
  linked: (name: string) =>
    both(
      `เชื่อมบัญชีแล้ว: ${name}\nส่งรูปใบกำกับภาษีหรือใบเสร็จมาได้เลย (ส่งหลายรูปพร้อมกันก็ได้)`,
      `連携しました：${name}\n請求書・領収書の写真を送ってください（複数枚まとめてもOK）。`,
    ),
  badCode: both(
    "รหัสไม่ถูกต้องหรือหมดอายุแล้ว (ใช้ได้ 10 นาที) กรุณารับรหัสใหม่ในแอป",
    "コードが違うか、期限切れです（有効期間10分）。アプリで新しいコードを取得してください。",
  ),
  checking: both("กำลังตรวจสอบรหัสยืนยัน กรุณารอสักครู่", "認証コードを確認しています。少々お待ちください。"),
  tooManyTries: both("ใส่รหัสผิดหลายครั้งเกินไป กรุณารอ 10 นาทีแล้วลองใหม่", "コードの入力ミスが多すぎます。10分後にもう一度お試しください。"),
  notDoc: both("รูปนี้ไม่น่าจะเป็นใบกำกับภาษีหรือใบเสร็จ", "この写真は請求書・領収書ではないようです。"),
  unreadable: both(
    "อ่านรูปไม่ได้ กรุณาถ่ายใหม่ในที่สว่างให้เห็นเอกสารทั้งแผ่น",
    "読み取れませんでした。明るい場所で書類全体が写るように撮り直してください。",
  ),
  tooBig: both("รูปใหญ่เกินไป (เกิน 4.5 MB) กรุณาส่งแบบคุณภาพปกติ", "画像が大きすぎます（4.5MB超）。通常画質で送ってください。"),
  received: both(
    "กำลังส่งรูปภาพอยู่ เมื่อเสร็จแล้วจะแจ้งให้ทราบ\nกรุณารอสักครู่",
    "画像を送信中です。完了しましたらお知らせします。\n少々お待ちください。",
  ),
  rate: both("ส่งรูปถี่เกินไป กรุณารอสักครู่แล้วส่งใหม่", "送信が多すぎます。少し待ってからもう一度送ってください。"),
  failed: both("ระบบขัดข้องชั่วคราว กรุณาลองใหม่ภายหลัง", "一時的なエラーです。しばらくしてからもう一度お試しください。"),
};

/** Daily payment reminder for admins: overdue and due-within-a-week credit purchases, most urgent first */
export function dueReminder(items: DueItem[], url: string): string | null {
  const due = items.filter((i) => i.state === "overdue" || i.state === "soon");
  if (!due.length) return null;
  const over = due.filter((i) => i.state === "overdue").length;
  const soon = due.length - over;
  const line = (i: DueItem) => {
    const name = i.doc.seller.name.th || i.doc.seller.name.en || i.doc.seller.name.ja || i.doc.docNo || "—";
    const d = i.days ?? 0;
    const when = d < 0 ? `เกิน ${-d} วัน / ${-d}日超過` : d === 0 ? "วันนี้ / 本日" : `อีก ${d} วัน / あと${d}日`;
    return `• ${name}\n   ${baht(i.doc.totals.net)} · ${dmy(i.doc.dueDate)} (${when})`;
  };
  const shown = due.slice(0, 8);
  return [
    "แจ้งเตือนการชำระเงิน · 支払いのお知らせ",
    `เกินกำหนด ${over} · ครบกำหนดภายใน 7 วัน ${soon}`,
    `期限切れ ${over}件 · 7日以内 ${soon}件`,
    "",
    ...shown.map(line),
    ...(due.length > shown.length ? [`… และอีก ${due.length - shown.length} รายการ / ほか${due.length - shown.length}件`] : []),
    "",
    url,
  ].join("\n");
}

/** Days before the VAT return's deadline on which the admins get a LINE reminder */
export const VAT_REMIND_DAYS = [3, 1];

export interface VatReminder {
  /** Tax month being filed, YYYY-MM */
  month: string;
  /** The deadline that counts now (paper, or the online one after it) */
  due: string;
  daysLeft: number;
  toCheck: number;
  drafts: number;
  claimableVat: number;
}

/**
 * The VAT return (ภ.พ.30) reminder, Thai + Japanese like the payment one — sent only a few days before the
 * deadline and only while the month is still open, with what is left to do.
 */
export function vatReminder(v: VatReminder, url: string, opts: { force?: boolean } = {}): string | null {
  if (!opts.force && !VAT_REMIND_DAYS.includes(v.daysLeft)) return null;
  const [y, m] = v.month.split("-");
  const todo = v.toCheck + v.drafts;
  return [
    "แจ้งเตือนยื่น ภ.พ.30 · 付加価値税申告のお知らせ",
    `เดือนภาษี ${m}/${Number(y) + 543} · ยื่นภายใน ${dmy(v.due)} (อีก ${v.daysLeft} วัน)`,
    `${y}年${Number(m)}月分 · 期限 ${dmy(v.due)}（あと${v.daysLeft}日）`,
    "",
    `ภาษีซื้อที่ขอคืนได้ / 控除できる仕入VAT: ${baht(v.claimableVat)}`,
    todo
      ? `ต้องตรวจ ${v.toCheck} · ฉบับร่าง ${v.drafts} — กรุณาจัดการก่อนยื่น\n要確認 ${v.toCheck}件 · 下書き ${v.drafts}件 — 申告前に整理してください`
      : "เอกสารพร้อมยื่นแล้ว / 書類は申告の準備ができています",
    "",
    url,
  ].join("\n");
}

export interface PayrollReminder {
  /** Pay month being filed, YYYY-MM */
  month: string;
  pnd1Paper: string;
  due: string;
  daysLeft: number;
  wht: number;
  /** Employees' and the company's social security together */
  ss: number;
}

/** The payroll filings (ภ.ง.ด.1, สปส.1-10) reminder, on the same days before the deadline as the VAT one */
export function payrollReminder(v: PayrollReminder, url: string, opts: { force?: boolean } = {}): string | null {
  if (!opts.force && !VAT_REMIND_DAYS.includes(v.daysLeft)) return null;
  const [y, m] = v.month.split("-");
  return [
    "แจ้งเตือนยื่น ภ.ง.ด.1 และ สปส.1-10 · 源泉税・社会保険の申告のお知らせ",
    `เดือน ${m}/${Number(y) + 543} · ยื่นภายใน ${dmy(v.due)} (อีก ${v.daysLeft} วัน)`,
    `${y}年${Number(m)}月分 · 期限 ${dmy(v.due)}（あと${v.daysLeft}日）`,
    "",
    `ภาษีหัก ณ ที่จ่าย / 源泉徴収税: ${baht(v.wht)}`,
    `เงินสมทบประกันสังคม / 社会保険料（本人＋会社）: ${baht(v.ss)}`,
    "",
    url,
  ].join("\n");
}

/** LINE sends photos as JPEG, but look at the bytes rather than trust that */
export function imageType(b: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

// Card colours: the app's system blue and status colours, white card, hairline separators
const INK = "#1d1d1f";
const MUTED = "#6e6e73";
const BLUE = "#0071e3";

const row = (label: string, value: string, strong = false): messagingApi.FlexBox => ({
  type: "box",
  layout: "horizontal",
  contents: [
    { type: "text", text: label, size: strong ? "sm" : "xs", color: strong ? INK : MUTED, weight: strong ? "bold" : "regular", flex: 3, wrap: true, gravity: "center" },
    { type: "text", text: value, size: strong ? "xl" : "sm", color: INK, weight: strong ? "bold" : "regular", align: "end", flex: 4, gravity: "center" },
  ],
});

/** The reply for a saved document: who, how much, what the automatic checks found, and a link to it */
export function receiptCard(doc: LedgerDoc, checks: CheckResult[], url: string): messagingApi.FlexMessage {
  const seller = doc.seller.name.th || doc.seller.name.en || doc.seller.name.ja || "—";
  const problems = checks.filter((c) => !c.na && !c.ok);
  const meta = [doc.docNo, doc.date && dmy(doc.date)].filter(Boolean).join(" · ") || "—";
  const net = baht(doc.totals.net);

  const status: messagingApi.FlexBox = problems.length
    ? {
        type: "box",
        layout: "vertical",
        backgroundColor: "#fff4e5",
        cornerRadius: "12px",
        paddingAll: "12px",
        spacing: "xs",
        contents: [
          { type: "text", text: `ต้องตรวจ ${problems.length} รายการ · 要確認 ${problems.length}件`, size: "xs", weight: "bold", color: "#b25000" },
          ...problems.slice(0, 3).map(
            (c): messagingApi.FlexText => ({
              type: "text",
              text: `• ${th.checks[c.key]} / ${ja.checks[c.key]}`,
              size: "xxs",
              color: "#8a4b00",
              wrap: true,
            }),
          ),
        ],
      }
    : {
        type: "box",
        layout: "vertical",
        backgroundColor: "#e9f7ee",
        cornerRadius: "12px",
        paddingAll: "12px",
        contents: [{ type: "text", text: "ตรวจอัตโนมัติผ่าน · 自動チェックOK", size: "xs", weight: "bold", color: "#1a7f37" }],
      };

  return {
    type: "flex",
    altText: `บันทึกแล้ว · 登録しました ${net} ${seller}`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "0px",
        contents: [
          // The Apple Intelligence spectrum, as a hairline accent only
          {
            type: "box",
            layout: "vertical",
            height: "4px",
            contents: [],
            background: { type: "linearGradient", angle: "90deg", startColor: "#0894ff", centerColor: "#c959dd", endColor: "#ff9004" },
          },
          {
            type: "box",
            layout: "vertical",
            paddingAll: "20px",
            spacing: "md",
            contents: [
              { type: "text", text: "บันทึกลงสมุดบัญชีแล้ว · 台帳に登録しました", size: "xxs", color: MUTED, weight: "bold", wrap: true },
              {
                type: "box",
                layout: "vertical",
                contents: [
                  { type: "text", text: seller, size: "md", weight: "bold", color: INK, wrap: true },
                  { type: "text", text: meta, size: "xs", color: MUTED, margin: "xs", wrap: true },
                ],
              },
              { type: "separator", color: "#e5e5ea" },
              row("VAT · 消費税", baht(doc.totals.vat)),
              ...(doc.dueDate && !doc.paid ? [row("ครบกำหนด · 支払期限", dmy(doc.dueDate))] : []),
              row("ยอดสุทธิ · 合計", net, true),
              status,
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        paddingTop: "0px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: BLUE,
            height: "sm",
            action: { type: "uri", label: "เปิดในแอป · アプリで開く", uri: url },
          },
        ],
      },
    },
  };
}
