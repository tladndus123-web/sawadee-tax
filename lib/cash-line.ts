// The cash box on LINE (owner 2026-11-18, "현금·자산 편하게"): a line like "현금 5200" (counted), "현금 넣음 3000" (put in)
// or "현금 씀 500 얼음" (taken out, with what for) becomes a cash box line without opening the app; the reply says the
// balance. And the morning reminder when the cash box has not been counted for a while. Pure: the reader and the texts.

import { four } from "./line-lang";

export type CashLineKind = "in" | "out" | "count";
export interface CashLine {
  kind: CashLineKind;
  /** Baht */
  amount: number;
  memo: string;
}

// The word, then a space or the amount ("현금5200" too); "현금함" is tried first so its 함 is not left behind
const HEAD = /^\s*(현금함|현금|現金|เงินสด|cash)(?=\s|\d|฿|$)\s*/i;
const IN = /^(넣음|넣기|입금|채움|入れ|入金|เข้า|เติม|ใส่|in|add)\s*/i;
const OUT = /^(씀|쓰기|출금|지출|사용|出|出金|使用|ออก|จ่าย|ใช้|out|spent|spend)\s*/i;
const COUNT = /^(세기|셈|확인|数え|残高|นับ|count)\s*/i;

/**
 * "현금 5,200" → count 5200 · "현금 넣음 3000" → in · "현금 씀 500 얼음" → out with memo "얼음" (also 現金 / เงินสด / cash).
 * Null when the line does not start with the word or has no amount.
 */
export function readCashLine(text: string): CashLine | null {
  let s = text.trim();
  const head = HEAD.exec(s);
  if (!head) return null;
  s = s.slice(head[0].length);
  let kind: CashLineKind = "count";
  for (const [k, re] of [["in", IN], ["out", OUT], ["count", COUNT]] as const) {
    const m = re.exec(s);
    if (m) {
      kind = k;
      s = s.slice(m[0].length);
      break;
    }
  }
  const amt = /^฿?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:바트|บาท|baht|バーツ)?/i.exec(s);
  if (!amt) return null;
  const amount = Number(amt[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount < 0 || amount >= 10_000_000 || (kind !== "count" && amount === 0)) return null;
  return { kind, amount, memo: s.slice(amt[0].length).trim().slice(0, 200) };
}

const b = (n: number) => `฿${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** The reply: what was written and the balance (a count also says how far it was from the book) */
export function cashSavedText(line: CashLine, balance: number, diff: number | null, url: string): string {
  const off = diff === null || diff === 0 ? null : diff;
  const kind = { in: ["ใส่เงิน", "入金", "넣음", "Cash in"], out: ["จ่ายเงิน", "出金", "씀", "Cash out"], count: ["นับเงิน", "残高確認", "세기", "Counted"] }[line.kind];
  const memo = line.memo ? ` (${line.memo})` : "";
  return four(
    [`✓ เงินสด: ${kind[0]} ${b(line.amount)}${memo}`, `ยอดคงเหลือ ${b(balance)}`, ...(off ? [`ต่างจากบัญชี ${off > 0 ? "+" : ""}${b(off)}`] : []), url].join("\n"),
    [`✓ 現金：${kind[1]} ${b(line.amount)}${memo}`, `残高 ${b(balance)}`, ...(off ? [`帳簿との差 ${off > 0 ? "+" : ""}${b(off)}`] : []), url].join("\n"),
    [`✓ 현금함: ${kind[2]} ${b(line.amount)}${memo}`, `남은 돈 ${b(balance)}`, ...(off ? [`장부와 차이 ${off > 0 ? "+" : ""}${b(off)}`] : []), url].join("\n"),
    [`✓ Cash box: ${kind[3]} ${b(line.amount)}${memo}`, `Balance ${b(balance)}`, ...(off ? [`Off from the book by ${off > 0 ? "+" : ""}${b(off)}`] : []), url].join("\n"),
  );
}

/** Days since the cash box was last counted, when it is in use (a move in the last 30 days) and 3+ days passed; else null */
export function countOverdue(moves: readonly { day: string; kind: string }[], today: string): number | null {
  const DAY = 86_400_000;
  const since = (d: string) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / DAY);
  if (!moves.some((m) => since(m.day) <= 30)) return null;
  const counts = moves.filter((m) => m.kind === "count").map((m) => m.day).sort();
  const last = counts[counts.length - 1];
  const days = last ? since(last) : 31;
  return days >= 3 ? days : null;
}

export function countReminder(days: number, url: string): string {
  const n = days > 30 ? "30+" : String(days);
  return four(
    `ไม่ได้นับเงินสดในลิ้นชักมา ${n} วันแล้ว — ส่ง "เงินสด 5200" (จำนวนที่นับได้) หรือเปิด\n${url}`,
    `現金ボックスを${n}日数えていません。「現金 5200」（数えた額）と送るか、こちらから\n${url}`,
    `현금함을 ${n}일째 세지 않았어요. "현금 5200"(센 금액)이라고 보내거나 여기서 입력하세요\n${url}`,
    `The cash box has not been counted for ${n} days. Send "cash 5200" (what you counted) or open\n${url}`,
  );
}
