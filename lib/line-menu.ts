// The admins' LINE menu (rich menu, owner 2026-10-26): the owner's pictures in docs/line-menu/{ko,ja,th,en}.png.
// Only admins get it (linked per person; staff and employees keep the plain chat), in the language their phone's
// LINE is set to (LINE profile "language"), English for any other. scripts/line-menu.ts uploads the four menus.
//
//  ┌──────────────────────┬───────────┬───────────┐
//  │ 📊 month summary      │ 💸 due     │ 🧾 VAT     │   top row: wide card + 2
//  ├──────────┬───────────┼───────────┴───────────┤
//  │ 📈 sales  │ 📎 Excel   │ 📷 upload a receipt    │   bottom row: 2 + wide card
//  └──────────┴───────────┴───────────────────────┘

import type { messagingApi } from "@line/bot-sdk";
import { type Ask, askData } from "./line-ask";
import { lineClient } from "./line";
import { LINE_LANGS, lineLang, type LineLang } from "./line-lang";

export const MENU_LANGS = LINE_LANGS;
export type MenuLang = LineLang;
export const MENU_SIZE = { width: 2500, height: 1686 } as const;
export const menuAlias = (lang: MenuLang) => `sawadee-admin-${lang}`;

/** LINE profile language → the menu's language (English for any other) */
export const menuLang = lineLang;

/** Postback of the upload card: the bot answers with camera / photo buttons (a menu cannot open the camera itself) */
export const UPLOAD_DATA = "do=upload";

type Button = Ask | "upload";

/** Where each card is on the picture (pixels of the 2500 × 1686 original), in the order of the drawing above */
const CELLS: { button: Button; x: number; y: number; width: number; height: number }[] = [
  { button: "summary", x: 0, y: 0, width: 1250, height: 843 },
  { button: "due", x: 1250, y: 0, width: 612, height: 843 },
  { button: "vat", x: 1862, y: 0, width: 638, height: 843 },
  { button: "sales", x: 0, y: 843, width: 637, height: 843 },
  { button: "excel", x: 637, y: 843, width: 613, height: 843 },
  { button: "upload", x: 1250, y: 843, width: 1250, height: 843 },
];

/** What the chat shows for a tap (the words on the picture) */
export const MENU_LABELS: Record<MenuLang, Record<Button, string>> = {
  ko: { summary: "📊 이번 달 요약", due: "💸 이번 주 낼 돈", vat: "🧾 부가세 마감", sales: "📈 어제 매출", excel: "📎 엑셀 받기", upload: "📷 영수증 올리기" },
  ja: { summary: "📊 今月のまとめ", due: "💸 今週の支払い", vat: "🧾 VAT申告期限", sales: "📈 昨日の売上", excel: "📎 Excel出力", upload: "📷 領収書を送る" },
  th: { summary: "📊 สรุปเดือนนี้", due: "💸 ต้องจ่ายสัปดาห์นี้", vat: "🧾 กำหนดยื่น VAT", sales: "📈 ยอดขายเมื่อวาน", excel: "📎 ดาวน์โหลด Excel", upload: "📷 ส่งใบเสร็จ" },
  en: { summary: "📊 Monthly summary", due: "💸 Due this week", vat: "🧾 VAT deadline", sales: "📈 Yesterday's sales", excel: "📎 Download Excel", upload: "📷 Upload receipt" },
};

const CHAT_BAR: Record<MenuLang, string> = { ko: "메뉴", ja: "メニュー", th: "เมนู", en: "Menu" };

export function menuDefinition(lang: MenuLang): messagingApi.RichMenuRequest {
  return {
    size: MENU_SIZE,
    selected: true,
    name: `Sawadee TAX admin ${lang}`,
    chatBarText: CHAT_BAR[lang],
    areas: CELLS.map(({ button, ...bounds }) => ({
      bounds,
      action: { type: "postback", data: button === "upload" ? UPLOAD_DATA : askData(button), displayText: MENU_LABELS[lang][button] },
    })),
  };
}

/** The person's LINE language (best effort: English when LINE does not say) */
export async function profileLang(lineUser: string): Promise<MenuLang> {
  const p = await lineClient()
    .getProfile(lineUser)
    .catch(() => null);
  return menuLang(p?.language);
}

/** Give an admin the menu in their language (quietly does nothing until scripts/line-menu.ts has made the menus) */
export async function linkAdminMenu(lineUser: string) {
  try {
    const { richMenuId } = await lineClient().getRichMenuAlias(menuAlias(await profileLang(lineUser)));
    await lineClient().linkRichMenuIdToUser(lineUser, richMenuId);
  } catch (e) {
    console.warn("[line] admin menu not linked", e instanceof Error ? e.message : e);
  }
}

export async function unlinkMenu(lineUser: string) {
  await lineClient()
    .unlinkRichMenuIdFromUser(lineUser)
    .catch(() => undefined);
}
