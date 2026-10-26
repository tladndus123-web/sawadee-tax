// "Ask the bot" (owner, 2026-10-26): the LINE menu at the bottom of the chat, or a short word, brings the ledger's
// own numbers — this month, bills to pay this week, the VAT return, yesterday's sales, the month's Excel file —
// as dashboard cards (lib/line-dash.ts) in the reader's language. Admins only (company money).
// No database access here: the server part is lib/line-ask-server.ts.

import { four, type LineLang } from "./line-lang";

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

export const askSay = {
  adminOnly: four("ข้อมูลนี้ดูได้เฉพาะผู้ดูแลระบบ", "この情報は管理者だけが見られます。", "이 정보는 관리자만 볼 수 있어요.", "Only admins can see this."),
};

/** The Excel file's link works for an hour */
export const EXCEL_LINK_SECONDS = 3600;

/** The upload card: a menu cannot open the camera, so the bot answers with camera / photo buttons */
const UPLOAD_TEXT: Record<LineLang, [string, string, string]> = {
  ko: ["영수증 사진을 보내 주세요. 여러 장도 한 번에 돼요.", "카메라", "사진 고르기"],
  ja: ["領収書の写真を送ってください。複数枚まとめてもOKです。", "カメラ", "写真を選ぶ"],
  th: ["ส่งรูปใบเสร็จมาได้เลย ส่งหลายรูปพร้อมกันก็ได้", "กล้อง", "เลือกรูป"],
  en: ["Send a photo of the receipt — several at once is fine.", "Camera", "Choose photos"],
};
export function uploadPrompt(lang: LineLang) {
  const [msg, camera, roll] = UPLOAD_TEXT[lang];
  return {
    type: "text" as const,
    text: `📷 ${msg}`,
    quickReply: {
      items: [
        { type: "action" as const, action: { type: "camera" as const, label: camera } },
        { type: "action" as const, action: { type: "cameraRoll" as const, label: roll } },
      ],
    },
  };
}
