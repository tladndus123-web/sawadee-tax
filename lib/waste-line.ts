// The waste log on LINE (owner 2026-11-18, restaurant extra): "폐기" / "廃棄" / "ทิ้ง" / "waste" puts the sender in waste
// mode for 10 minutes; a photo is kept for the next line, and a line like "우유 2L 상함 ฿90" becomes a waste record (item,
// quantity + unit, reason, value). Pure: the trigger words, the line reader and the replies in four languages.

import type { WasteReason } from "./waste";

export type WasteLang = "ko" | "ja" | "th" | "en";

const TRIGGERS = ["폐기", "廃棄", "ทิ้ง", "ของเสีย", "waste"];
/** The words that start waste mode (alone, any case, surrounding spaces ignored) */
export const isWasteWord = (text: string) => TRIGGERS.includes(text.trim().toLowerCase());

const REASON_WORDS: Record<WasteReason, string[]> = {
  spoiled: ["상함", "상했", "썩", "傷み", "傷んだ", "腐", "เสีย", "บูด", "เน่า", "spoiled", "spoilt", "bad", "rotten"],
  expired: ["유통기한", "기한", "期限", "หมดอายุ", "expired", "expiry"],
  mistake: ["실수", "ミス", "失敗", "พลาด", "ผิด", "mistake", "wrong"],
  dropped: ["떨어", "落とし", "落とした", "ตก", "dropped", "spilled", "spill"],
  leftover: ["남은", "남음", "残り", "食べ残し", "เหลือ", "leftover", "left over"],
  other: [],
};

const UNITS = ["kg", "g", "l", "ml", "pcs", "pc", "pack", "box", "bottle", "개", "봉", "팩", "병", "판", "個", "本", "袋", "パック", "กก.", "กก", "กรัม", "ลิตร", "ชิ้น", "ถุง", "แพ็ค", "ขวด", "กล่อง"];

export interface WasteLine {
  item: string;
  qty: number;
  unit: string;
  reason: WasteReason;
  /** Baht, null = not said */
  amount: number | null;
}

/**
 * "우유 2L 상함 ฿90" → { item: 우유, qty: 2, unit: L, reason: spoiled, amount: 90 }. The value is the number with ฿ / 바트 /
 * บาท / baht / バーツ; the first other number is the quantity (1 when none), its unit glued or next to it; the reason from
 * its words (else "other"); the rest is the item. Null when no item is left.
 */
export function readWasteLine(text: string): WasteLine | null {
  let s = ` ${text.replace(/\s+/g, " ").trim()} `;
  let amount: number | null = null;
  const money = /(?:฿\s*([\d,]+(?:\.\d+)?))|(?:([\d,]+(?:\.\d+)?)\s*(?:바트|บาท|baht|バーツ|thb))/i.exec(s);
  if (money) {
    amount = Number((money[1] ?? money[2]).replace(/,/g, ""));
    s = s.replace(money[0], " ");
  }
  let reason: WasteReason = "other";
  outer: for (const [r, words] of Object.entries(REASON_WORDS) as [WasteReason, string[]][]) {
    for (const w of words) {
      const i = s.toLowerCase().indexOf(w.toLowerCase());
      if (i >= 0) {
        reason = r;
        // drop the whole word the reason sits in
        s = s.replace(new RegExp(`\\S*${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\S*`, "i"), " ");
        break outer;
      }
    }
  }
  let qty = 1;
  let unit = "";
  const unitRe = UNITS.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length).join("|");
  const q = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${unitRe})?(?=\\s|$)`, "i").exec(s);
  if (q) {
    qty = Number(q[1]);
    unit = q[2] ?? "";
    s = s.replace(q[0], " ");
  }
  const item = s.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!item || !(qty > 0)) return null;
  return { item, qty, unit, reason, amount: amount !== null && Number.isFinite(amount) ? amount : null };
}

export const WASTE_LINE_TEXT: Record<WasteLang, { modeOn: string; off: string; notMember: string; photoKept: string; saved: (o: { item: string; qty: number; unit: string; amount: string }) => string; unclear: string; open: string; title: string }> = {
  ko: {
    title: "폐기 기록",
    modeOn: "폐기 기록 모드예요 (10분). 사진을 보내고 \"우유 2L 상함 ฿90\"처럼 재료·수량·이유·금액을 보내 주세요.",
    off: "폐기 기록이 꺼져 있어요. 관리자가 앱 설정 → 음식점 기능에서 켤 수 있어요.",
    notMember: "앱 계정과 LINE이 연결된 직원만 기록할 수 있어요.",
    photoKept: "사진을 받았어요. 이제 \"우유 2L 상함 ฿90\"처럼 보내 주세요.",
    saved: (o) => `✓ 폐기 기록: ${o.item} ${o.qty}${o.unit}${o.amount ? ` · ${o.amount}` : ""}`,
    unclear: "읽지 못했어요. \"우유 2L 상함 ฿90\"처럼 보내 주세요.",
    open: "앱에서 보기",
  },
  ja: {
    title: "廃棄記録",
    modeOn: "廃棄記録モードです（10分）。写真を送り、「牛乳 2L 傷み ฿90」のように食材・数量・理由・金額を送ってください。",
    off: "廃棄記録はオフです。管理者がアプリの設定 → 飲食店の機能でオンにできます。",
    notMember: "アプリのアカウントとLINEを連携したスタッフだけが記録できます。",
    photoKept: "写真を受け取りました。「牛乳 2L 傷み ฿90」のように送ってください。",
    saved: (o) => `✓ 廃棄記録：${o.item} ${o.qty}${o.unit}${o.amount ? `・${o.amount}` : ""}`,
    unclear: "読み取れませんでした。「牛乳 2L 傷み ฿90」のように送ってください。",
    open: "アプリで見る",
  },
  th: {
    title: "บันทึกของเสีย",
    modeOn: "โหมดบันทึกของเสีย (10 นาที) ส่งรูป แล้วพิมพ์เช่น \"นม 2L เสีย ฿90\" (วัตถุดิบ จำนวน สาเหตุ มูลค่า)",
    off: "บันทึกของเสียปิดอยู่ ผู้ดูแลเปิดได้ที่ ตั้งค่า → ฟังก์ชันร้านอาหาร ในแอป",
    notMember: "เฉพาะพนักงานที่เชื่อมบัญชีแอปกับ LINE แล้วเท่านั้น",
    photoKept: "ได้รับรูปแล้ว พิมพ์ต่อเช่น \"นม 2L เสีย ฿90\"",
    saved: (o) => `✓ บันทึกของเสีย: ${o.item} ${o.qty}${o.unit}${o.amount ? ` · ${o.amount}` : ""}`,
    unclear: "อ่านไม่ออก พิมพ์เช่น \"นม 2L เสีย ฿90\"",
    open: "ดูในแอป",
  },
  en: {
    title: "Waste log",
    modeOn: "Waste mode (10 minutes). Send a photo, then a line like \"milk 2L spoiled ฿90\" — item, quantity, reason, value.",
    off: "The waste log is off. An admin can switch it on in the app: Settings → Restaurant features.",
    notMember: "Only staff whose app account is linked to LINE can record waste.",
    photoKept: "Got the photo. Now send a line like \"milk 2L spoiled ฿90\".",
    saved: (o) => `✓ Waste recorded: ${o.item} ${o.qty}${o.unit}${o.amount ? ` · ${o.amount}` : ""}`,
    unclear: "Couldn't read that. Send a line like \"milk 2L spoiled ฿90\".",
    open: "Open in the app",
  },
};
