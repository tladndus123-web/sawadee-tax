// The LINE AI assistant (owner, 2026-10-26): admins write to the bot like to a secretary. Haiku answers; when a
// question needs a long, in-depth analysis it hands over to Sonnet 5.5, at most 10 times a month for the whole
// company ("fully automatic" — the owner's choice). Every answer is a dashboard card like the menu's (owner: "모든 것을
// 대시보드로"): the model fills a small JSON card (AiCard), lib/line-dash.ts draws it. Pure parts here; the server part
// is lib/assistant-server.ts.

import { four } from "./line-lang";

export const QUICK_MODEL = "claude-haiku-5-5";
export const DEEP_MODEL = "claude-sonnet-5-5";
/**
 * Long analyses (Sonnet) per month, whole company. The owner lifted the first limit of 10 on 2026-10-26 ("it is our
 * own shop"); the uses are still counted, and this cap only stops a runaway.
 */
export const DEEP_PER_MONTH = 1000;
/** Earlier turns sent along, and how old they may be */
export const HISTORY_TURNS = 8;
export const HISTORY_HOURS = 24;
/** What Haiku answers, alone, when the question needs Sonnet */
export const DEEP_MARK = "<<DEEP>>";

const RULES = `You are the AI secretary of a small restaurant company in Thailand, talking with its owner or an admin in LINE.
You answer from the company's own books below (purchases from tax invoices and receipts, sales, payroll, VAT). Amounts are Thai baht.
- Answer in the language the person writes in.
- Use only the numbers given. If something is not in the data, say so and say where in the app to find or enter it. Never invent figures.
- Tax: explain Thai rules (VAT ภ.พ.30, withholding ภ.ง.ด.1/3/53, social security) plainly, but for a final decision say to confirm with their accountant.
- Be warm and brief, like a capable secretary.

Reply with ONLY one JSON object — a dashboard card shown in LINE — and nothing before or after it:
{"title": "short title, e.g. 'September sales'",
 "eyebrow": "ONE OR TWO UPPERCASE ENGLISH WORDS, e.g. SALES, MONTHLY, VAT, COSTS, BILLS, ADVICE",
 "summary": "the answer in one or two plain sentences",
 "hero": {"label": "", "value": "the key number, formatted like ฿1,234,567", "note": "", "bar": 0.68},
 "tiles": [{"label": "", "value": "", "note": "", "tone": "up|down|warn|neutral"}],
 "rows": [{"label": "", "value": "", "tone": "up|down|warn|neutral"}],
 "sections": [{"title": "", "items": ["one short line each"]}],
 "links": [{"label": "", "url": "one of the app pages listed in the books"}],
 "tip": {"title": "2–3 words, e.g. 'Month-end forecast'", "main": "one useful insight with a number", "note": "one smaller line: what to do"},
 "next": ["2 or 3 short follow-up questions the person may ask next, each at most 18 characters, starting with an emoji"]}
Only "title" and "summary" are required; leave out what does not help. hero = the one number that answers the question
("bar" 0–1 only for progress against a target). tiles = 2 or 4 key figures side by side. rows = up to 12 lines such as
days, branches, suppliers or bills with their amounts. sections = up to 4 short lists (reasons, next steps, tips).
tone "up" = good (green), "down" or "warn" = needs attention (orange). No markdown anywhere; plain words, a few emoji at most.
Always add a "tip": the most useful thing the numbers show beyond the question — e.g. the month-end forecast at the
current pace, a price rise, cash for the bills due, VAT that cannot be claimed, a weekday pattern, how far to
break-even, labour cost share, a deadline coming up, something unusual (a receipt twice, a spend far above usual),
a branch that differs. Always add "next" questions (forecast, comparisons, causes, plans) in the person's language.`;

export const quickSystem = (context: string) =>
  `${RULES}
- Keep the card short: a summary, a hero or a few tiles, and rows only when they help.
- If the question really needs a long, in-depth analysis — comparing many months, finding causes, a plan, a forecast, a detailed report — reply with exactly ${DEEP_MARK} and nothing else. Quick facts, numbers, how-to and short advice you answer yourself.

${context}`;

export const deepSystem = (context: string) =>
  `${RULES}
- This is an in-depth analysis: summary = the conclusion in two or three sentences; tiles and rows with the key numbers;
  sections for the reasons (with numbers) and concrete next steps.

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
      `🔬 กำลังวิเคราะห์อย่างละเอียด (ครั้งที่ ${n} ของเดือนนี้) อาจใช้เวลาสักครู่`,
      `🔬 詳しく分析しています（今月${n}回目）。少しお待ちください。`,
      `🔬 자세히 분석하고 있어요 (이번 달 ${n}번째). 잠시만 기다려 주세요.`,
      `🔬 Working on an in-depth analysis (#${n} this month). One moment.`,
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

/** The card the model fills (all text already in the asker's language) */
export interface AiCard {
  title: string;
  eyebrow: string;
  summary: string;
  hero: { label: string; value: string; note: string; bar: number | null } | null;
  tiles: { label: string; value: string; note: string; tone: Tone }[];
  rows: { label: string; value: string; tone: Tone }[];
  sections: { title: string; items: string[] }[];
  links: { label: string; url: string }[];
  tip: { title: string; main: string; note?: string } | null;
  next: string[];
}
export type Tone = "up" | "down" | "warn" | "neutral";

const str = (v: unknown, max: number) => (typeof v === "string" ? chatText(v).replace(/\s*\n\s*/g, " ").slice(0, max) : "");
const list = (v: unknown, max: number): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object").slice(0, max) : []);
const tone = (v: unknown): Tone => (v === "up" || v === "down" || v === "warn" ? v : "neutral");

/**
 * The model's reply as a card, or null when it is not one (then the text is sent as it is). Links only to the app
 * itself, so a card never points somewhere else.
 */
export function parseCard(reply: string, appUrl: string): AiCard | null {
  const a = reply.indexOf("{");
  const b = reply.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(reply.slice(a, b + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const title = str(o.title, 60);
  const summary = str(o.summary, 400);
  if (!title && !summary) return null;
  const h = o.hero && typeof o.hero === "object" ? (o.hero as Record<string, unknown>) : null;
  const bar = typeof h?.bar === "number" && h.bar >= 0 ? Math.min(1, h.bar) : null;
  return {
    title: title || " ",
    eyebrow: str(o.eyebrow, 24).toUpperCase(),
    summary,
    hero: h && str(h.value, 30) ? { label: str(h.label, 40), value: str(h.value, 30), note: str(h.note, 60), bar } : null,
    tiles: list(o.tiles, 4)
      .map((t) => ({ label: str(t.label, 30), value: str(t.value, 24), note: str(t.note, 40), tone: tone(t.tone) }))
      .filter((t) => t.value),
    rows: list(o.rows, 12)
      .map((r) => ({ label: str(r.label, 60), value: str(r.value, 24), tone: tone(r.tone) }))
      .filter((r) => r.label || r.value),
    sections: list(o.sections, 4)
      .map((s) => ({ title: str(s.title, 40), items: (Array.isArray(s.items) ? s.items : []).slice(0, 6).map((i) => str(i, 160)).filter(Boolean) }))
      .filter((s) => s.items.length),
    links: list(o.links, 2)
      .map((l) => ({ label: str(l.label, 20), url: typeof l.url === "string" ? l.url.trim() : "" }))
      .filter((l) => l.label && appUrl && l.url.startsWith(`${appUrl}/`)),
    tip: (() => {
      const t = o.tip && typeof o.tip === "object" ? (o.tip as Record<string, unknown>) : null;
      const main = t ? str(t.main, 200) : "";
      return t && main ? { title: str(t.title, 30) || "TIP", main, note: str(t.note, 200) || undefined } : null;
    })(),
    next: (Array.isArray(o.next) ? o.next : [])
      .map((q) => str(q, 60))
      .filter(Boolean)
      .slice(0, 4),
  };
}

/** The card as plain lines (kept as the conversation so a follow-up question has it) */
export function cardText(c: AiCard): string {
  return [
    c.title,
    c.summary,
    c.hero ? `${c.hero.label} ${c.hero.value} ${c.hero.note}`.trim() : "",
    ...c.tiles.map((t) => `${t.label}: ${t.value} ${t.note}`.trim()),
    ...c.rows.map((r) => `${r.label}: ${r.value}`),
    ...c.sections.flatMap((s) => [s.title, ...s.items.map((i) => `• ${i}`)]),
    ...c.links.map((l) => `${l.label}: ${l.url}`),
    c.tip ? `TIP ${c.tip.title}: ${c.tip.main} ${c.tip.note ?? ""}`.trim() : "",
  ]
    .filter(Boolean)
    .join("\n");
}
