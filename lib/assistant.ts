// The LINE AI assistant (owner, 2026-10-26): admins write to the bot like to a secretary. Haiku answers; when a
// question needs a long, in-depth analysis it hands over to Sonnet 5.5, at most 10 times a month for the whole
// company ("fully automatic" — the owner's choice). Pure parts here; the server part is lib/assistant-server.ts.

import { four } from "./line-lang";

export const QUICK_MODEL = "claude-haiku-5-5";
export const DEEP_MODEL = "claude-sonnet-5-5";
/** Long analyses (Sonnet) per month, whole company */
export const DEEP_PER_MONTH = 10;
/** Earlier turns sent along, and how old they may be */
export const HISTORY_TURNS = 8;
export const HISTORY_HOURS = 24;
/** What Haiku answers, alone, when the question needs Sonnet */
export const DEEP_MARK = "<<DEEP>>";

const RULES = `You are the AI secretary of a small restaurant company in Thailand, talking with its owner or an admin in LINE.
You answer from the company's own books below (purchases from tax invoices and receipts, sales, payroll, VAT). Amounts are Thai baht.
- Answer in the language the person writes in.
- Plain text for a chat app: no markdown, no tables, no headings, no asterisks. Short lines; "• " for lists; a few emoji at most.
- Use only the numbers given. If something is not in the data, say so and say where in the app to find or enter it. Never invent figures.
- Tax: explain Thai rules (VAT ภ.พ.30, withholding ภ.ง.ด.1/3/53, social security) plainly, but for a final decision say to confirm with their accountant.
- Be warm and brief, like a capable secretary.`;

export const quickSystem = (context: string) =>
  `${RULES}
- Keep answers short (a few sentences, at most about 12 lines).
- If the question really needs a long, in-depth analysis — comparing many months, finding causes, a plan, a forecast, a detailed report — reply with exactly ${DEEP_MARK} and nothing else. Quick facts, numbers, how-to and short advice you answer yourself.

${context}`;

export const deepSystem = (context: string) =>
  `${RULES}
- This is an in-depth analysis: be thorough but organised — first the answer in two or three lines, then the reasons with numbers, then concrete next steps. At most about 60 lines.

${context}`;

/** Haiku asked for the long analysis */
export const wantsDeep = (reply: string) => reply.trim().startsWith(DEEP_MARK);

/** LINE shows text as it is: markdown leftovers out, at most 4800 characters */
export function chatText(reply: string): string {
  return reply
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 4800);
}

export const assistantSay = {
  thinking: (n: number) =>
    four(
      `🔬 กำลังวิเคราะห์อย่างละเอียด (เดือนนี้ครั้งที่ ${n}/${DEEP_PER_MONTH}) อาจใช้เวลาสักครู่`,
      `🔬 詳しく分析しています（今月 ${n}/${DEEP_PER_MONTH}回目）。少しお待ちください。`,
      `🔬 자세히 분석하고 있어요 (이번 달 ${n}/${DEEP_PER_MONTH}번째). 잠시만 기다려 주세요.`,
      `🔬 Working on an in-depth analysis (${n}/${DEEP_PER_MONTH} this month). One moment.`,
    ),
  deepUsedUp: four(
    `(การวิเคราะห์ละเอียด ${DEEP_PER_MONTH} ครั้งของเดือนนี้ใช้หมดแล้ว จึงตอบแบบย่อ)`,
    `（今月の詳しい分析${DEEP_PER_MONTH}回を使い切ったため、短くお答えしました）`,
    `(이번 달 자세한 분석 ${DEEP_PER_MONTH}번을 다 써서 짧게 답했어요)`,
    `(This month's ${DEEP_PER_MONTH} in-depth analyses are used up, so this is a short answer.)`,
  ),
  failed: four("ตอนนี้ AI ตอบไม่ได้ กรุณาลองใหม่ภายหลัง", "今はAIが答えられません。しばらくしてからもう一度お試しください。", "지금은 AI가 답하지 못해요. 잠시 뒤에 다시 물어봐 주세요.", "The AI can't answer right now. Please try again later."),
  rate: four("ถามถี่เกินไป กรุณารอสักครู่", "質問が多すぎます。少し待ってからどうぞ。", "질문이 너무 많아요. 잠시 뒤에 다시 물어봐 주세요.", "Too many questions at once. Please wait a moment."),
};
