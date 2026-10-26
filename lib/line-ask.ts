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

// Shortcuts people type instead of tapping: only a message that is exactly one of these (a menu card's words or a
// single word) gets the card. Anything longer is a question for the AI assistant — "저번달 매출내역 보내줘" asked
// about last month and got yesterday's sales card while any message containing "매출" counted (owner, 2026-10-26).
const WORDS: Record<Ask, string[]> = {
  summary: ["요약", "이번달요약", "まとめ", "今月のまとめ", "สรุป", "สรุปเดือนนี้", "summary", "monthlysummary"],
  due: ["낼돈", "이번주낼돈", "支払い", "今週の支払い", "ต้องจ่าย", "ต้องจ่ายสัปดาห์นี้", "due", "duethisweek"],
  vat: ["부가세", "부가세마감", "vat", "vat申告期限", "ภพ30", "กำหนดยื่นvat", "vatdeadline"],
  sales: ["매출", "어제매출", "売上", "昨日の売上", "ยอดขาย", "ยอดขายเมื่อวาน", "sales", "yesterdayssales", "yesterday'ssales"],
  excel: ["엑셀", "엑셀받기", "excel", "excel出力", "ดาวน์โหลดexcel", "downloadexcel"],
};

/** A message that is just a card's name, or null (then it goes to the AI assistant) */
export function askFromText(text: string): Ask | null {
  // Emoji, spaces and punctuation out; "ภ.พ.30" → "ภพ30"
  const t = text.toLowerCase().replace(/[\s.·・、。!?！？]|\p{Extended_Pictographic}|️/gu, "");
  if (!t) return null;
  for (const a of ASKS) if (WORDS[a].includes(t)) return a;
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
