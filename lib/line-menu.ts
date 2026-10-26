// The admins' LINE menu (rich menu, owner 2026-10-26): 6 buttons at the bottom of the chat, 3 on top and 3 below.
// Only admins get it (it is linked per person; staff and employees keep the plain chat). The picture comes from the
// owner; scripts/line-menu.ts uploads it and makes the menu. The bot finds the menu by its alias.

import type { messagingApi } from "@line/bot-sdk";
import { type Ask, askData } from "./line-ask";
import { lineClient } from "./line";

export const MENU_ALIAS = "sawadee-admin";
export const MENU_SIZE = { width: 2500, height: 1686 } as const;

type Cell = { ask: Ask; label: string } | { url: string; label: string };

/** Left to right, top row first — the picture must show the buttons in this order */
export function menuCells(appUrl: string): Cell[] {
  return [
    { ask: "summary", label: "📊 今月のまとめ · สรุปเดือนนี้" },
    { ask: "due", label: "💸 今週の支払い · ต้องจ่ายสัปดาห์นี้" },
    { ask: "vat", label: "🧾 VAT申告 · ภ.พ.30" },
    { ask: "sales", label: "📈 昨日の売上 · ยอดขายเมื่อวาน" },
    { ask: "excel", label: "📎 Excel" },
    { url: `${appUrl}/`, label: "🌐 App" },
  ];
}

/** The menu definition: a 3 × 2 grid over the 2500 × 1686 picture */
export function menuDefinition(appUrl: string): messagingApi.RichMenuRequest {
  const cols = [0, 833, 1667, MENU_SIZE.width];
  const rows = [0, 843, MENU_SIZE.height];
  return {
    size: MENU_SIZE,
    selected: true,
    name: "Sawadee TAX admin",
    chatBarText: "メニュー · เมนู",
    areas: menuCells(appUrl).map((c, i) => {
      const x = cols[i % 3];
      const y = rows[Math.floor(i / 3)];
      return {
        bounds: { x, y, width: cols[(i % 3) + 1] - x, height: rows[Math.floor(i / 3) + 1] - y },
        // A button shows its name in the chat (displayText) so everyone sees what was asked
        action: "ask" in c ? { type: "postback", data: askData(c.ask), displayText: c.label } : { type: "uri", uri: c.url, label: "App" },
      };
    }),
  };
}

/** Give an admin the menu (quietly does nothing until scripts/line-menu.ts has made it) */
export async function linkAdminMenu(lineUser: string) {
  try {
    const { richMenuId } = await lineClient().getRichMenuAlias(MENU_ALIAS);
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
