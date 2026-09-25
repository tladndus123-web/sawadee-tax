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

export const say = {
  welcome: both(
    "สวัสดี นี่คือบอทสมุดใบเสร็จ\nเปิดแอป → ตั้งค่า → เชื่อม LINE แล้วส่งรหัส 6 หลักมาที่แชทนี้",
    "こんにちは。領収書台帳ボットです。\nアプリの「設定 → LINE連携」で6桁のコードを取得し、このトークに送ってください。",
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
  tooManyTries: both("ใส่รหัสผิดหลายครั้งเกินไป กรุณารอ 10 นาทีแล้วลองใหม่", "コードの入力ミスが多すぎます。10分後にもう一度お試しください。"),
  help: both(
    "ส่งรูปใบกำกับภาษีหรือใบเสร็จมาได้เลย AI จะอ่านแล้วบันทึกลงสมุดบัญชีให้ (รับเฉพาะรูปภาพ)",
    "請求書・領収書の写真を送ると、AIが読み取って台帳に登録します（写真のみ対応）。",
  ),
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
